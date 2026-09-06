#!/usr/bin/env python3
"""
Двунаправленная синхронизация: компьютер ↔ Telegram.

Срабатывает на UserPromptSubmit и Stop только для локальных сессий
(не TELEGRAM_SESSION). Всё что пишешь и получаешь в Claude Code —
дублируется в соответствующий Telegram-топик.
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = Path(__file__).parent
LOG = BASE / "hook.log"


# ─── Env ──────────────────────────────────────────────────────────────────────

def _load_env():
    env = BASE / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

_load_env()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
GROUP_ID   = int(os.getenv("GROUP_ID", "0"))
API        = f"https://api.telegram.org/bot{BOT_TOKEN}"


# ─── Utils ────────────────────────────────────────────────────────────────────

def log(msg: str):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')} [sync] {msg}\n")
    except Exception:
        pass


def find_thread(session_id: str) -> int | None:
    try:
        mapping = json.loads((BASE / "sessions.json").read_text(encoding="utf-8"))
        for tid, sid in mapping.items():
            if sid == session_id:
                return int(tid)
    except Exception:
        pass
    return None


def send(thread_id: int, text: str):
    body = json.dumps({
        "chat_id": GROUP_ID,
        "message_thread_id": thread_id,
        "text": text[:4000],
        "parse_mode": "HTML",
        "disable_notification": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{API}/sendMessage", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        log(f"sent to thread={thread_id} len={len(text)}")
    except Exception as e:
        log(f"send failed: {e}")


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def clean_response(text: str, max_len: int = 2000) -> str:
    text = re.sub(r"```[\s\S]*?```", "[код]", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_len] + ("…" if len(text) > max_len else "")


def last_result(transcript_path: str) -> str:
    """Читает последний ответ ассистента из .jsonl (оба формата: --print и интерактивный)."""
    result = ""
    if not transcript_path:
        return result
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    t = d.get("type", "")

                    # Формат claude --print
                    if t == "result":
                        r = d.get("result", "")
                        if r:
                            result = r

                    # Формат интерактивной сессии
                    elif t == "assistant":
                        content = d.get("message", {}).get("content", [])
                        if isinstance(content, list):
                            texts = [
                                b["text"] for b in content
                                if isinstance(b, dict) and b.get("type") == "text" and b.get("text")
                            ]
                            if texts:
                                result = "\n".join(texts)
                        elif isinstance(content, str) and content:
                            result = content
                except Exception:
                    pass
    except Exception as e:
        log(f"last_result error: {e}")
    return result


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    # Только для локальных сессий (не бот)
    if os.getenv("TELEGRAM_SESSION"):
        return

    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", errors="replace") or "{}")
    except Exception:
        data = {}

    # Тип хука передаётся как аргумент: sync_hook.py prompt | sync_hook.py stop
    event = sys.argv[1] if len(sys.argv) > 1 else "stop"

    session_id = data.get("session_id", "")
    transcript  = data.get("transcript_path", "")

    log(f"event={event} session={session_id[:8] if session_id else '?'}")

    if not session_id:
        return

    thread_id = find_thread(session_id)
    if not thread_id:
        log(f"no topic for session {session_id[:8]}")
        return

    if event == "prompt":
        prompt = data.get("prompt", "").strip()
        if prompt:
            send(thread_id, f"👤 <b>Ты (компьютер):</b>\n{esc(prompt[:1500])}")

    elif event == "stop":
        # Claude Code передаёт last_assistant_message прямо в данных хука
        text = data.get("last_assistant_message", "") or last_result(transcript)
        log(f"stop: result_len={len(text)}")
        if text:
            send(thread_id, f"🤖 <b>Claude (компьютер):</b>\n{esc(clean_response(text))}")


if __name__ == "__main__":
    main()
