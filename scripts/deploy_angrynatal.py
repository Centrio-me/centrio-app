import paramiko
import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Force UTF-8 output on Windows consoles
if sys.stdout.encoding != "utf-8":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST = "31.128.44.165"
PORT = 22
USERNAME = "root"
PASSWORD = os.environ.get('UPLOAD_PASSWORD')

FILES = [
    (r"C:\AngryNatal\app\bot\keyboards\main.py",    "/var/www/angrynatal/app/bot/keyboards/main.py"),
    (r"C:\AngryNatal\app\bot\handlers\natal.py",    "/var/www/angrynatal/app/bot/handlers/natal.py"),
    (r"C:\AngryNatal\app\services\payments.py",     "/var/www/angrynatal/app/services/payments.py"),
]

def upload_files():
    print("[SFTP] Connecting...")
    transport = paramiko.Transport((HOST, PORT))
    transport.connect(username=USERNAME, password=PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)

    uploaded = []
    for local_path, remote_path in FILES:
        if not os.path.exists(local_path):
            print(f"  [ERROR] Local file not found: {local_path}")
            sys.exit(1)
        print(f"  Uploading {local_path} -> {remote_path}")
        sftp.put(local_path, remote_path)
        uploaded.append(remote_path)
        print(f"  [OK] {remote_path}")

    sftp.close()
    transport.close()
    print("[SFTP] All files uploaded.")
    return uploaded

def run_ssh_commands(commands):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("[SSH] Connecting...")
    client.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD)

    results = {}
    for cmd in commands:
        print(f"  Running: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()
        results[cmd] = {"stdout": out, "stderr": err}
        if out:
            print(f"  STDOUT:\n{out}")
        if err:
            print(f"  STDERR:\n{err}")

    client.close()
    return results

if __name__ == "__main__":
    uploaded = upload_files()

    print("\n[SSH] Restarting pm2 processes...")
    results = run_ssh_commands([
        "pm2 restart angrynatal-bot",
        "pm2 restart angrynatal-worker",
        "pm2 list",
    ])

    print("\n=== DEPLOY COMPLETE ===")
    print("Uploaded files:")
    for f in uploaded:
        print(f"  {f}")
    print("\npm2 list output:")
    print(results["pm2 list"]["stdout"])
