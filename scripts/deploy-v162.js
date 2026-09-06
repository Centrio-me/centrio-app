require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const DL = '/var/www/centrio-downloads';
async function run(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', () => resolve(out));
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
    });
  });
}
const DIST = path.join(__dirname, '..', 'dist');
async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ пропуск ${label}`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}
async function main() {
  await sftp.connect(config);
  for (const f of ['Centrio Setup 1.6.2.exe', 'Centrio Setup 1.6.2.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.6.2.exe" | head -2'));
  console.log('✅ v1.6.2 задеплоен!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
