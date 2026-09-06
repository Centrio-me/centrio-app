import os
from dotenv import load_dotenv
load_dotenv()
import sys, io, paramiko

# Force UTF-8 output so pm2's unicode symbols don't crash on Windows cp1251
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST     = "31.128.44.165"
PORT     = 22
USERNAME = "root"
PASSWORD = os.environ.get('UPLOAD_PASSWORD')

COMMANDS = [
    "pm2 restart angrynatal-bot",
    "pm2 restart angrynatal-worker",
    "pm2 list",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("[SSH] Connecting...")
client.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD)

for cmd in COMMANDS:
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        print(out)
    if err:
        print("[STDERR]", err)

client.close()
print("\n[SSH] Done.")
