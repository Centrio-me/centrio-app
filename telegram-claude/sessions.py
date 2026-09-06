import json
import threading
from pathlib import Path
from typing import Optional

_SESSIONS_FILE = Path(__file__).parent / "sessions.json"
_lock = threading.Lock()


class SessionStore:
    def __init__(self):
        self._data: dict[str, Optional[str]] = self._load()

    def _load(self) -> dict:
        if _SESSIONS_FILE.exists():
            try:
                return json.loads(_SESSIONS_FILE.read_text(encoding="utf-8"))
            except Exception:
                return {}
        return {}

    def _save(self) -> None:
        with _lock:
            _SESSIONS_FILE.write_text(
                json.dumps(self._data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    @staticmethod
    def _key(thread_id: Optional[int]) -> str:
        return str(thread_id) if thread_id is not None else "main"

    def get(self, thread_id: Optional[int]) -> Optional[str]:
        self._data = self._load()  # всегда читаем актуальный файл
        return self._data.get(self._key(thread_id))

    def set(self, thread_id: Optional[int], session_id: str) -> None:
        self._data[self._key(thread_id)] = session_id
        self._save()

    def clear(self, thread_id: Optional[int]) -> None:
        self._data.pop(self._key(thread_id), None)
        self._save()

    def list_all(self) -> dict:
        return dict(self._data)
