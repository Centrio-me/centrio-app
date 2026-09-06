"""Запускает один тёрн Claude Code синхронно через subprocess."""
import json
import logging
import os
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)
TIMEOUT = 660  # секунд на один тёрн (10 мин + буфер)


def run_claude_turn(
    user_message: str,
    session_id: Optional[str],
    work_dir: str,
    hook_port: int,
) -> tuple[str, Optional[str]]:
    cmd = ["claude", "--print", user_message, "--output-format", "stream-json", "--verbose", "--permission-mode", "default"]
    if session_id:
        cmd += ["--resume", session_id]

    env = {
        **os.environ,
        "TELEGRAM_SESSION": "1",
        "HOOK_PORT": str(hook_port),
        "NO_COLOR": "1",
        "TERM": "dumb",
    }

    logger.info("claude run: session=%s cmd=%s", session_id, " ".join(cmd[:4]))
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=work_dir,
        env=env,
        timeout=TIMEOUT,
        stdin=subprocess.DEVNULL,
    )

    logger.info("claude exit_code=%d stdout_len=%d", result.returncode, len(result.stdout))
    if result.stderr.strip():
        logger.warning("Claude stderr: %s", result.stderr[:1000])
    if not result.stdout.strip():
        logger.warning("Claude stdout is empty!")

    return _parse(result.stdout, session_id)


def _parse(stdout: str, fallback_sid: Optional[str]) -> tuple[str, Optional[str]]:
    result_text = ""
    session_id = fallback_sid

    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        t = data.get("type", "")
        if t == "system" and data.get("subtype") == "init":
            session_id = data.get("session_id", session_id)
        elif t == "result":
            session_id = data.get("session_id", session_id)
            result_text = data.get("result", "")

    return result_text.strip(), session_id
