"""
Читает Claude Code сессии и постит в каждый топик:
- краткое описание (первое сообщение пользователя)
- последние 2 обмена без кода и tool-вызовов
"""
import json
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
GROUP_ID = int(os.environ["GROUP_ID"])
API = f"https://api.telegram.org/bot{BOT_TOKEN}"

SESSIONS_MAP = {
    "21": ("171eee83-5b1a-4f31-b57d-b08a56c3a857", "Price List XLS"),
    "23": ("ea0cd23f-deb6-461f-b04c-6c9a8a0e5e6b", "Yatort CRM"),
    "25": ("f92cb48a-09f3-4f1b-b7e8-ffa807125b79", "CRM + 1С"),
    "27": ("4758782d-d974-4207-961d-278b54e9d85d", "CentrioPDF"),
    "29": ("c38786fa-1dcc-4f90-8345-dfe64756c978", "Типография"),
    "31": ("6ffe3dca-4862-4d92-aa3d-b61ecf386606", "AngryNatal"),
    "33": ("e8a23f3c-0b82-4e8c-ae65-cc3e1ebcb6d6", "Telegram Bot"),
}

BASE = Path(r"C:\Users\TechnoDisk\.claude\projects\C--MessengerApps")


def extract_text(content) -> str:
    """Вытащить только текст из content, пропустить tool_use / tool_result."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text", "").strip()
                if t:
                    parts.append(t)
        return "\n".join(parts)
    return ""


def clean(text: str, max_len: int = 600) -> str:
    """Убрать код, длинные технические строки, обрезать."""
    # Убрать блоки кода
    text = re.sub(r"```[\s\S]*?```", "[фрагмент кода]", text)
    # Убрать длинный инлайн-код
    text = re.sub(r"`[^`]{80,}`", "[код]", text)
    # Убрать строки вида "path/to/file.ext:123"
    text = re.sub(r"\S+\.\w{2,4}:\d+", "", text)
    # Схлопнуть пустые строки
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    if len(text) > max_len:
        text = text[:max_len].rsplit(" ", 1)[0] + "…"
    return text


def read_exchanges(session_path: Path, n: int = 2):
    """
    Вернуть (первое_сообщение_юзера, [(role, text), ...] последних n обменов).
    """
    all_exchanges = []
    first_user = None

    with open(session_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue

            role_type = d.get("type")
            if role_type not in ("user", "assistant"):
                continue

            text = extract_text(d.get("message", {}).get("content", ""))
            if not text or len(text) < 10:
                continue

            # Пропустить технические сообщения (начало сессии, system prompts)
            if text.startswith("This session is being continued") or text.startswith("<context>"):
                continue

            role = "👤" if role_type == "user" else "🤖"

            if first_user is None and role_type == "user":
                first_user = text

            all_exchanges.append((role, text))

    # Берём последние n*2 (n вопросов + n ответов)
    last = all_exchanges[-(n * 2):] if len(all_exchanges) >= n * 2 else all_exchanges[-4:]
    return first_user, last


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def send(thread_id: int, text: str):
    r = requests.post(f"{API}/sendMessage", json={
        "chat_id": GROUP_ID,
        "message_thread_id": thread_id,
        "text": text,
        "parse_mode": "HTML",
    })
    time.sleep(0.6)
    if not r.json().get("ok"):
        print(f"  ! Ошибка отправки: {r.json().get('description')}")


def main():
    for thread_id_str, (sid, label) in SESSIONS_MAP.items():
        thread_id = int(thread_id_str)
        path = BASE / f"{sid}.jsonl"
        print(f"\n[{label}] thread={thread_id}")

        if not path.exists():
            print("  Файл не найден, пропуск.")
            continue

        first_user, exchanges = read_exchanges(path, n=2)

        # ── Блок 1: резюме ──────────────────────────────────────────────────
        if first_user:
            summary_text = (
                f"📋 <b>О чём эта сессия:</b>\n\n"
                f"{escape(clean(first_user, max_len=500))}"
            )
            send(thread_id, summary_text)
            print("  Резюме отправлено.")

        # ── Блок 2: последние сообщения ──────────────────────────────────────
        if exchanges:
            lines = ["💬 <b>Последние сообщения:</b>"]
            for role, text in exchanges:
                cleaned = escape(clean(text, max_len=400))
                lines.append(f"\n{role} {cleaned}")
            send(thread_id, "\n".join(lines))
            print("  Последние сообщения отправлены.")

    print("\nГотово.")


if __name__ == "__main__":
    main()
