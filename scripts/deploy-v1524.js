require('dotenv').config()
// Деплой v1.5.24 — sidebar DnD: перетаскивание в/из папок, порядок сохраняется
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
  console.log('Подключено к серверу\n');

  for (const f of ['Centrio Setup 1.5.24.exe', 'Centrio Setup 1.5.24.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }

  console.log('\n🔍 Проверка установщика...');
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.5.24.exe" | head -2'));

  console.log('\n✅ v1.5.24 задеплоен!');
  await sftp.end();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
