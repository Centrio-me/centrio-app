require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    const ssh = sftp.client;
    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    });
  });
}

async function main() {
  await sftp.connect(config);
  await runCommand('cd /var/www/centrio-web && npm run build 2>&1 | tail -25');
  await runCommand('pm2 restart centrio-web 2>&1');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
