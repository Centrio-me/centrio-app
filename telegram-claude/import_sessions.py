"""
Одноразовый скрипт: создаёт Telegram-топики для существующих сессий Claude Code
и сохраняет маппинг в sessions.json.
"""
import json
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

load_dotenv()

BOT_TOKEN = os.environ["BOT_TOKEN"]
GROUP_ID = int(os.environ["GROUP_ID"])
API = f"https://api.telegram.org/bot{BOT_TOKEN}"

SESSIONS = [
    ("171eee83-5b1a-4f31-b57d-b08a56c3a857", "Price List XLS"),
    ("ea0cd23f-deb6-461f-b04c-6c9a8a0e5e6b", "Yatort CRM — разработка"),
    ("f92cb48a-09f3-4f1b-b7e8-ffa807125b79", "CRM + 1С интеграция"),
    ("4758782d-d974-4207-961d-278b54e9d85d", "CentrioPDF"),
    ("c38786fa-1dcc-4f90-8345-dfe64756c978", "Типография / Принтеры"),
    ("6ffe3dca-4862-4d92-aa3d-b61ecf386606", "AngryNatal Bot"),
    ("e8a23f3c-0b82-4e8c-ae65-cc3e1ebcb6d6", "Telegram Bot Setup"),
]

sessions_file = Path(__file__).parent / "sessions.json"
mapping = json.loads(sessions_file.read_text(encoding="utf-8")) if sessions_file.exists() else {}

for sid, name in SESSIONS:
    print(f"Создаю топик: {name}...")
    r = requests.post(f"{API}/createForumTopic", json={"chat_id": GROUP_ID, "name": name})
    data = r.json()
    if data.get("ok"):
        thread_id = data["result"]["message_thread_id"]
        mapping[str(thread_id)] = sid
        print(f"  OK thread_id={thread_id} -> {sid[:8]}")
        # Отправляем приветственное сообщение в топик
        requests.post(f"{API}/sendMessage", json={
            "chat_id": GROUP_ID,
            "message_thread_id": thread_id,
            "text": f"📎 Сессия <code>{sid}</code>\nПиши сюда — я продолжу диалог с этого момента.",
            "parse_mode": "HTML",
        })
        time.sleep(0.5)
    else:
        print(f"  ERR: {data.get('description')}")

sessions_file.write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\nГотово. Записано {len(mapping)} сессий в sessions.json")
