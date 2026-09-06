"""
Telegram бот — удалённое управление Claude Code.
Каждый топик группы = отдельная сессия Claude Code.

Команды:
  /new [название]  — создать топик и начать новую сессию
  /clear           — сбросить сессию в текущем топике
  /status          — ID текущей сессии
  /sessions        — все активные сессии
  /setsession ID   — привязать session_id с компьютера к топику
"""
import logging
import os
import tempfile
import threading
import time
from typing import Optional

import telebot
from dotenv import load_dotenv
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup

import claude_runner
import hook_server
from sessions import SessionStore

load_dotenv()

# Все Claude-процессы, запущенные ботом, наследуют эти переменные
os.environ["TELEGRAM_SESSION"] = "1"
os.environ.setdefault("HOOK_PORT", "8765")
os.environ["NO_COLOR"] = "1"
os.environ["FORCE_COLOR"] = "0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BOT_TOKEN: str = os.environ["BOT_TOKEN"]
GROUP_ID: int = int(os.environ["GROUP_ID"])
ALLOWED_USER_ID: int = int(os.environ["ALLOWED_USER_ID"])
HOOK_PORT: int = int(os.getenv("HOOK_PORT", "8765"))
WORK_DIR: str = os.getenv("WORK_DIR", r"C:\MessengerApps")

MAX_MSG = 4000

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")
sessions = SessionStore()

# thread-local хранилище активного топика (для маршрутизации permission-запросов)
_active = threading.local()

# Whisper загружается лениво при первом голосовом сообщении
_whisper_model = None
_whisper_lock = threading.Lock()


# ─── Утилиты ──────────────────────────────────────────────────────────────────

def _allowed(uid: int) -> bool:
    return uid == ALLOWED_USER_ID


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _send(thread_id: Optional[int], text: str, **kw):
    chunks = [text[i:i + MAX_MSG] for i in range(0, max(len(text), 1), MAX_MSG)]
    for chunk in chunks:
        bot.send_message(GROUP_ID, chunk, message_thread_id=thread_id, **kw)


def _get_whisper():
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper_model


# ─── Permission request (вызывается из hook_server) ───────────────────────────

def _find_thread_for_session(session_id: str) -> Optional[int]:
    try:
        data = sessions._load()
        for tid, sid in data.items():
            if sid == session_id:
                return None if tid == "main" else int(tid)
    except Exception:
        pass
    return None


def send_permission_request(rid: str, data: dict):
    tool_name = _escape(str(data.get("tool_name", "Unknown")))
    tool_input = data.get("tool_input", {})

    if isinstance(tool_input, dict):
        details = "\n".join(
            f"  {_escape(str(k))}: {_escape(str(v))}"
            for k, v in list(tool_input.items())[:6]
        )
    else:
        details = _escape(str(tool_input)[:500])

    text = (
        f"🔐 <b>Запрос разрешения</b>\n\n"
        f"<b>Инструмент:</b> <code>{tool_name}</code>\n"
        f"<b>Параметры:</b>\n<pre>{details[:900]}</pre>"
    )

    kb = InlineKeyboardMarkup()
    kb.add(
        InlineKeyboardButton("✅ Разрешить", callback_data=f"perm:{rid}:allow"),
        InlineKeyboardButton("❌ Отклонить", callback_data=f"perm:{rid}:deny"),
    )

    thread_id = getattr(_active, "thread_id", None)
    if thread_id is None:
        session_id = data.get("session_id", "")
        if session_id:
            thread_id = _find_thread_for_session(session_id)

    bot.send_message(GROUP_ID, text, message_thread_id=thread_id, reply_markup=kb)


# ─── Команды ──────────────────────────────────────────────────────────────────

@bot.message_handler(
    func=lambda m: m.chat.id == GROUP_ID and m.text and m.text.startswith("/new")
)
def cmd_new(msg):
    if not _allowed(msg.from_user.id):
        return
    name = msg.text.removeprefix("/new").strip() or "Сессия"
    try:
        topic = bot.create_forum_topic(GROUP_ID, name)
        sessions.clear(topic.message_thread_id)
        bot.send_message(
            GROUP_ID,
            f"✅ <b>{_escape(name)}</b>\n\nНовая сессия Claude Code. Пиши сюда — отвечу.",
            message_thread_id=topic.message_thread_id,
        )
    except Exception as e:
        bot.reply_to(msg, f"❌ Не удалось создать топик: {_escape(str(e))}")


@bot.message_handler(
    func=lambda m: m.chat.id == GROUP_ID and m.text and m.text.startswith("/clear")
)
def cmd_clear(msg):
    if not _allowed(msg.from_user.id):
        return
    sessions.clear(msg.message_thread_id)
    bot.reply_to(msg, "🗑 Сессия сброшена. Следующее сообщение начнёт новый диалог.")


@bot.message_handler(
    func=lambda m: m.chat.id == GROUP_ID and m.text and m.text.startswith("/status")
)
def cmd_status(msg):
    if not _allowed(msg.from_user.id):
        return
    sid = sessions.get(msg.message_thread_id)
    if sid:
        bot.reply_to(
            msg,
            f"📎 <b>Текущая сессия:</b>\n<code>{sid}</code>\n\n"
            f"Чтобы продолжить на компьютере — вставь в терминал:\n"
            f"<code>claude --resume {sid}</code>",
        )
    else:
        bot.reply_to(msg, "Нет активной сессии. Напиши что-нибудь — начнётся новая.")


@bot.message_handler(
    func=lambda m: m.chat.id == GROUP_ID and m.text and m.text.startswith("/setsession")
)
def cmd_setsession(msg):
    if not _allowed(msg.from_user.id):
        return
    sid = (msg.text or "").removeprefix("/setsession").strip()
    if not sid:
        bot.reply_to(msg, "Укажи ID сессии: <code>/setsession SESSION_ID</code>")
        return
    sessions.set(msg.message_thread_id, sid)
    bot.reply_to(
        msg,
        f"✅ Топик привязан к сессии:\n<code>{sid}</code>",
    )


@bot.message_handler(
    func=lambda m: m.chat.id == GROUP_ID and m.text and m.text.startswith("/sessions")
)
def cmd_sessions(msg):
    if not _allowed(msg.from_user.id):
        return
    all_s = sessions.list_all()
    if not all_s:
        bot.reply_to(msg, "Нет активных сессий.")
        return
    lines = [
        f"• <b>{'main' if k == 'main' else f'топик {k}'}</b>: <code>{v or '—'}</code>"
        for k, v in all_s.items()
    ]
    bot.reply_to(msg, "📋 <b>Сессии:</b>\n" + "\n".join(lines))


# ─── Общая обработка сообщения (текст или расшифровка голоса) ─────────────────

def _process_message(msg, text: str):
    thread_id = msg.message_thread_id
    _active.thread_id = thread_id

    session_id = sessions.get(thread_id)
    short_sid = session_id[:8] if session_id else "новая"
    preview = text[:60].replace("\n", " ")

    thinking = bot.reply_to(
        msg,
        f"⏳ <i>Запускаю Claude…</i>\n"
        f"<code>сессия: {short_sid}</code>\n"
        f"<code>запрос: {_escape(preview)}…</code>",
    )

    stop_ticker = threading.Event()

    def _ticker():
        start = time.time()
        dots = ["⏳", "⌛"]
        i = 0
        while not stop_ticker.wait(15):
            elapsed = int(time.time() - start)
            i += 1
            try:
                bot.edit_message_text(
                    f"{dots[i % 2]} <i>Claude работает…</i> {elapsed}с\n"
                    f"<code>сессия: {short_sid}</code>",
                    GROUP_ID, thinking.message_id,
                )
            except Exception:
                pass

    threading.Thread(target=_ticker, daemon=True).start()

    try:
        output, new_sid = claude_runner.run_claude_turn(
            user_message=text,
            session_id=session_id,
            work_dir=WORK_DIR,
            hook_port=HOOK_PORT,
        )
        stop_ticker.set()

        if new_sid:
            sessions.set(thread_id, new_sid)

        bot.delete_message(GROUP_ID, thinking.message_id)

        if output:
            _send(thread_id, _escape(output))
        else:
            bot.send_message(
                GROUP_ID,
                "⚠️ Claude вернул пустой ответ. Попробуй /clear и начни новый диалог.",
                message_thread_id=thread_id,
            )

    except Exception as exc:
        stop_ticker.set()
        logger.exception("Claude PTY run failed")
        try:
            bot.edit_message_text(
                f"❌ Ошибка: <code>{_escape(str(exc))}</code>",
                GROUP_ID, thinking.message_id,
            )
        except Exception:
            pass
    finally:
        stop_ticker.set()
        _active.thread_id = None


# ─── Текстовые сообщения ──────────────────────────────────────────────────────

@bot.message_handler(
    func=lambda m: (
        m.chat.id == GROUP_ID
        and m.text
        and not m.text.startswith("/")
    )
)
def on_message(msg):
    if not _allowed(msg.from_user.id):
        return
    threading.Thread(target=_process_message, args=(msg, msg.text), daemon=True).start()


# ─── Голосовые сообщения ──────────────────────────────────────────────────────

@bot.message_handler(
    content_types=["voice"],
    func=lambda m: m.chat.id == GROUP_ID,
)
def on_voice(msg):
    if not _allowed(msg.from_user.id):
        return

    status = bot.reply_to(msg, "🎤 <i>Распознаю речь…</i>")

    try:
        file_info = bot.get_file(msg.voice.file_id)
        ogg_bytes = bot.download_file(file_info.file_path)

        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as f:
            f.write(ogg_bytes)
            ogg_path = f.name

        try:
            model = _get_whisper()
            segments, _ = model.transcribe(ogg_path, language="ru")
            text = " ".join(s.text for s in segments).strip()
        finally:
            try:
                os.unlink(ogg_path)
            except Exception:
                pass

        if not text:
            bot.edit_message_text("⚠️ Не удалось распознать речь", GROUP_ID, status.message_id)
            return

        bot.edit_message_text(f"🎤 <i>{_escape(text)}</i>", GROUP_ID, status.message_id)
        msg.text = text
        threading.Thread(target=_process_message, args=(msg, text), daemon=True).start()

    except Exception as exc:
        logger.exception("Voice processing failed")
        try:
            bot.edit_message_text(
                f"❌ Ошибка распознавания: <code>{_escape(str(exc))}</code>",
                GROUP_ID, status.message_id,
            )
        except Exception:
            pass


# ─── Кнопки разрешений ────────────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: c.data.startswith("perm:"))
def on_permission(call):
    if not _allowed(call.from_user.id):
        bot.answer_callback_query(call.id, "Нет доступа", show_alert=True)
        return

    parts = call.data.split(":", 2)
    if len(parts) != 3:
        bot.answer_callback_query(call.id, "Неверный формат")
        return

    _, rid, decision = parts
    hook_server.resolve(rid, decision)

    icon = "✅" if decision == "allow" else "❌"
    label = "Разрешено" if decision == "allow" else "Отклонено"

    try:
        bot.edit_message_text(
            (call.message.text or "") + f"\n\n{icon} <b>{label}</b>",
            call.message.chat.id,
            call.message.message_id,
            parse_mode="HTML",
        )
    except Exception:
        pass

    bot.answer_callback_query(call.id, f"{icon} {label}")


# ─── Запуск ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    hook_server.start(HOOK_PORT, send_permission_request)
    logger.info("Hook server started on port %d", HOOK_PORT)
    logger.info("Bot polling started. Group=%d, AllowedUser=%d", GROUP_ID, ALLOWED_USER_ID)

    bot.infinity_polling(allowed_updates=["message", "callback_query"])
