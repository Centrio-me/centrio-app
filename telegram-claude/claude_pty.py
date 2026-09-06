"""
PTY-based Claude Code runner.
Держит один живой процесс `claude` на каждый Telegram-топик.
Сообщения из Telegram пишутся в stdin PTY, ответ читается из stdout.
"""
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Optional

from winpty import PTY as WinPTY, Backend

ANSI_RE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
# Строки Claude Code UI которые нужно отфильтровать
UI_LINE_RE = re.compile(r'^[\s╭╮╰╯│─·❯>\u2800-\u28FF\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F]*$')

LOG = Path(__file__).parent / "hook.log"


def _log(msg: str):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')} [pty] {msg}\n")
    except Exception:
        pass


def _strip_ansi(text: str) -> str:
    text = ANSI_RE.sub('', text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = []
    for line in text.split('\n'):
        stripped = line.strip()
        if stripped and not UI_LINE_RE.match(stripped):
            lines.append(line.rstrip())
    return '\n'.join(lines).strip()


def _work_dir_to_project_key(work_dir: str) -> str:
    """C:\\MessengerApps → C--MessengerApps"""
    p = Path(work_dir).resolve()
    # Claude's naming: drive letter + -- + rest with \ replaced by --
    s = str(p)
    # Remove colon after drive letter, replace separators
    s = re.sub(r'[:\\]', '--', s).lstrip('--')
    return s


def _find_session_id_after(work_dir: str, after_ts: float) -> Optional[str]:
    """Находит session_id .jsonl-файла созданного после after_ts."""
    key = _work_dir_to_project_key(work_dir)
    projects_dir = Path.home() / ".claude" / "projects"
    # Ищем папку проекта
    candidates = [d for d in projects_dir.iterdir() if d.is_dir() and d.name == key]
    if not candidates:
        # Fallback: ищем по частичному совпадению
        candidates = [d for d in projects_dir.iterdir() if d.is_dir() and key[:10] in d.name]
    if not candidates:
        return None
    project_dir = candidates[0]
    try:
        jsonl_files = [
            f for f in project_dir.glob("*.jsonl")
            if f.stat().st_mtime > after_ts
        ]
        if not jsonl_files:
            return None
        newest = max(jsonl_files, key=lambda f: f.stat().st_mtime)
        return newest.stem  # UUID без расширения
    except Exception:
        return None


class PTYSession:
    """Один живой процесс Claude Code в PTY."""

    IDLE_TIMEOUT = 3.0   # секунд тишины = ответ готов
    MAX_WAIT = 600        # максимальное ожидание ответа
    STARTUP_WAIT = 5.0   # ожидание старта Claude

    def __init__(self, session_id: Optional[str], work_dir: str, hook_port: int):
        self.session_id = session_id
        self._work_dir = work_dir
        self._buf: list[str] = []
        self._collecting = False
        self._last_ts = time.monotonic()
        self._lock = threading.Lock()
        self._dead = False
        self._started_at = time.time()

        cmd = "claude"
        if session_id:
            cmd += f" --resume {session_id}"

        _log(f"spawning PTY: {cmd!r} in {work_dir}")
        self._pty = WinPTY(200, 50, backend=Backend.ConPTY)
        self._pty.spawn(cmd, cwd=work_dir)

        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

        # Ждём старта Claude и обрабатываем экран выбора логина
        self._wait_for_ready()

        # Если session_id не был задан — ищем созданный
        if not self.session_id:
            sid = _find_session_id_after(work_dir, self._started_at)
            if sid:
                self.session_id = sid
                _log(f"detected new session_id={sid[:8]}")

    def _wait_for_ready(self, timeout: float = 15.0):
        """Ждёт готовности Claude, автоматически выбирая логин если нужно."""
        deadline = time.monotonic() + timeout
        login_handled = False
        while time.monotonic() < deadline:
            with self._lock:
                buf = "".join(self._buf)
            if not login_handled and "Select login method" in buf:
                _log("login screen detected, sending '1'")
                time.sleep(0.5)
                self._pty.write("1\r\n")
                login_handled = True
                time.sleep(3.0)
            # Ждём появления prompt (❯ или > в начале строки)
            cleaned = ANSI_RE.sub('', buf)
            if login_handled and ("❯" in cleaned or "\n>" in cleaned):
                _log("Claude ready (prompt detected)")
                break
            if not login_handled and time.monotonic() > deadline - 10:
                # Прошло 5 сек без login screen — считаем готовым
                break
            time.sleep(0.3)
        with self._lock:
            self._buf.clear()
        _log("startup complete")

    def send(self, message: str) -> str:
        if self._dead:
            raise RuntimeError("PTY session is dead")

        with self._lock:
            self._buf.clear()
            self._last_ts = time.monotonic()
            self._collecting = True

        _log(f"send to PTY session={self.session_id[:8] if self.session_id else '?'} len={len(message)}")
        self._pty.write(message + "\r\n")

        deadline = time.monotonic() + self.MAX_WAIT
        while time.monotonic() < deadline:
            with self._lock:
                idle = time.monotonic() - self._last_ts
                has_output = bool(self._buf)
                dead = self._dead
            if dead:
                raise RuntimeError("PTY session died")
            if has_output and idle >= self.IDLE_TIMEOUT:
                break
            time.sleep(0.2)

        with self._lock:
            self._collecting = False
            raw = "".join(self._buf)

        result = _strip_ansi(raw)
        _log(f"response len={len(result)}")
        return result

    def _read_loop(self):
        while not self._dead:
            try:
                chunk = self._pty.read(False)
                if chunk:
                    with self._lock:
                        if self._collecting:
                            self._buf.append(chunk)
                        self._last_ts = time.monotonic()
                else:
                    time.sleep(0.05)
            except Exception as e:
                _log(f"PTY read error: {e}")
                self._dead = True
                break

    def close(self):
        self._dead = True
        try:
            self._pty.close()
        except Exception:
            pass


class PTYManager:
    """Управляет одним PTYSession на каждый Telegram-топик."""

    def __init__(self, work_dir: str, hook_port: int):
        self._work_dir = work_dir
        self._hook_port = hook_port
        self._sessions: dict[str, PTYSession] = {}
        self._lock = threading.Lock()

    def _key(self, thread_id: Optional[int]) -> str:
        return str(thread_id) if thread_id is not None else "main"

    def send(self, thread_id: Optional[int], session_id: Optional[str], message: str) -> tuple[str, Optional[str]]:
        """Отправляет сообщение и возвращает (ответ, session_id)."""
        key = self._key(thread_id)

        with self._lock:
            sess = self._sessions.get(key)
            need_new = (
                sess is None
                or sess._dead
                or (session_id and sess.session_id and sess.session_id != session_id)
            )
            if need_new:
                if sess:
                    threading.Thread(target=sess.close, daemon=True).start()
                sess = PTYSession(session_id, self._work_dir, self._hook_port)
                self._sessions[key] = sess

        response = sess.send(message)
        return response, sess.session_id

    def close(self, thread_id: Optional[int]):
        key = self._key(thread_id)
        with self._lock:
            sess = self._sessions.pop(key, None)
        if sess:
            threading.Thread(target=sess.close, daemon=True).start()

    def close_all(self):
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for sess in sessions:
            threading.Thread(target=sess.close, daemon=True).start()
