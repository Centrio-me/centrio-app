#!/usr/bin/env python3
"""
Claude Code PreToolUse hook.

Запускается Claude Code перед каждым инструментом требующим разрешения.
- Если бот работает (TELEGRAM_SESSION=1 в env) — шлёт запрос в Telegram и ждёт.
- Иначе — выходит с 0 (allow), чтобы обычный интерактивный Claude Code не трогать.

Exit codes: 0 = allow, 2 = deny
"""
import json
import os
import sys
import time
from pathlib import Path

LOG_FILE = Path(__file__).parent / "hook.log"
HOOK_PORT = int(os.getenv("HOOK_PORT", "8765"))
BASE_URL = f"http://127.0.0.1:{HOOK_PORT}"
POLL_INTERVAL = 0.8
TIMEOUT = 600  # 10 минут


def log(msg: str):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _sanitize(obj, max_str: int = 1000):
    """Удаляет суррогатные символы и обрезает длинные строки."""
    if isinstance(obj, str):
        clean = obj.encode("utf-8", errors="replace").decode("utf-8")
        return clean[:max_str] + ("…" if len(clean) > max_str else "")
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    return obj


def main() -> None:
    log(f"hook started. TELEGRAM_SESSION={os.getenv('TELEGRAM_SESSION')!r} HOOK_PORT={HOOK_PORT}")

    if not os.getenv("TELEGRAM_SESSION"):
        log("no TELEGRAM_SESSION — allowing through")
        sys.exit(0)

    try:
        import requests as _req
    except ImportError:
        log("requests not installed — allowing through")
        sys.exit(0)

    try:
        raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
        data = json.loads(raw) if raw.strip() else {}
        tool_name = data.get("tool_name", "?")
        log(f"tool={tool_name} input_keys={list(data.get('tool_input', {}).keys())}")
    except Exception as e:
        log(f"stdin parse error: {e}")
        data = {}

    # Обрезаем большой контент (содержимое файлов и т.п.) и чистим суррогаты
    data = _sanitize(data)

    try:
        resp = _req.post(f"{BASE_URL}/hook/permission", json=data, timeout=5)
        resp.raise_for_status()
        rid = resp.json()["request_id"]
        log(f"registered request_id={rid[:8]}")
    except Exception as e:
        log(f"bot not reachable ({e}) — allowing through")
        sys.exit(0)

    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        try:
            r = _req.get(f"{BASE_URL}/hook/decision/{rid}", timeout=5)
            if r.status_code == 200:
                decision = r.json().get("decision", "deny")
                log(f"decision={decision}")
                if decision == "allow":
                    sys.exit(0)
                else:
                    print(json.dumps({"reason": "Отклонено через Telegram"}), flush=True)
                    sys.exit(2)
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)

    log("timeout — denying")
    print(json.dumps({"reason": "Таймаут 5 мин"}), flush=True)
    sys.exit(2)


if __name__ == "__main__":
    main()
