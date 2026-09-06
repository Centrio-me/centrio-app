import os
from dotenv import load_dotenv
load_dotenv()
import paramiko
import time

host = "31.128.44.165"
port = 22
username = "root"
password = os.environ.get('UPLOAD_PASSWORD')

local_path = r"C:\AngryNatal\app\bot\keyboards\natal.py"
remote_path = "/var/www/angrynatal/app/bot/keyboards/natal.py"

# Connect SSH
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port=port, username=username, password=password, timeout=15)
print("SSH connected")

# Upload file via SFTP
sftp = ssh.open_sftp()
sftp.put(local_path, remote_path)
sftp.close()
print(f"File uploaded: {local_path} -> {remote_path}")

# Restart bot
stdin, stdout, stderr = ssh.exec_command("pm2 restart angrynatal-bot")
out = stdout.read().decode()
err = stderr.read().decode()
print("Restart stdout:", out.encode("ascii", "replace").decode())
if err:
    print("Restart stderr:", err.encode("ascii", "replace").decode())

# Wait ~3 seconds
time.sleep(3)

# Check pm2 list
stdin2, stdout2, stderr2 = ssh.exec_command("pm2 list")
pm2_out = stdout2.read().decode()
print("PM2 LIST OUTPUT:")
print(pm2_out.encode("ascii", "replace").decode())

ssh.close()
