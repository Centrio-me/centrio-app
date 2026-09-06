#!/usr/bin/env python3
"""
Claude Code Stop hook.
Когда интерактивная сессия на компьютере завершается — записывает session_id
в sessions.json, чтобы Telegram-бот автоматически подхватил её в нужном топике.

Срабатывает только для интерактивных сессий (не TELEGRAM_SESSION).
"""
import json
import os
import sys
from pathlib import Path

SESSIONS_FILE = Path(__file__).parent / "sessions.json"
LOG_FILE = Path(__file__).parent / "hook.log"


def log(msg: str):
    import time
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')} [stop] {msg}\n")
    except Exception:
        pass


def main():
    # Только для интерактивных сессий на компе
    if os.getenv("TELEGRAM_SESSION"):
        return

    try:
        raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        return

    session_id = data.get("session_id")
    if not session_id:
        return

    # Ищем топик, уже привязанный к этой же сессии (обновляем) или к None
    try:
        mapping = json.loads(SESSIONS_FILE.read_text(encoding="utf-8")) if SESSIONS_FILE.exists() else {}
    except Exception:
        return

    # Найти топик где session_id совпадает — обновить его
    updated = False
    for thread_key, sid in mapping.items():
        if sid == session_id:
            updated = True
            break  # уже актуален

    if not updated:
        log(f"Новая сессия {session_id[:8]} не привязана к топику. Используй /setsession в Telegram.")

    log(f"session_id={session_id[:8]} updated={updated}")


if __name__ == "__main__":
    main()
