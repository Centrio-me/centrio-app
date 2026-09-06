"""HTTP сервер для перехвата PreToolUse хуков от Claude Code."""
import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

_pending: dict[str, dict] = {}
_bot_callback = None


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # подавляем лишние логи

    def do_POST(self):
        if self.path == "/hook/permission":
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            rid = str(uuid.uuid4())
            _pending[rid] = {"decision": None}
            if _bot_callback:
                threading.Thread(target=_bot_callback, args=(rid, data), daemon=True).start()
            self._send(200, {"request_id": rid})
        else:
            self._send(404, {"error": "not found"})

    def do_GET(self):
        if self.path.startswith("/hook/decision/"):
            rid = self.path.rsplit("/", 1)[-1]
            entry = _pending.get(rid)
            if not entry:
                self._send(404, {"error": "not found"})
                return
            if entry["decision"] is None:
                self._send(202, {"status": "pending"})
                return
            decision = entry["decision"]
            _pending.pop(rid, None)
            self._send(200, {"decision": decision})
        else:
            self._send(404, {"error": "not found"})

    def _send(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def resolve(rid: str, decision: str):
    if rid in _pending:
        _pending[rid]["decision"] = decision


def start(port: int, bot_callback):
    global _bot_callback
    _bot_callback = bot_callback
    server = HTTPServer(("127.0.0.1", port), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
