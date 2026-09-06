require('dotenv').config()
// Деплой v1.5.23 — настройки сети, иконки мессенджеров, фикс папок
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';
const DL  = '/var/www/centrio-downloads';

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

const S    = path.join(__dirname, '..', 'server');
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

  await upload(path.join(S, 'i18n-new.ts'),              `${WEB}/lib/i18n.ts`,              'i18n.ts (v1.5.23)');
  await upload(path.join(S, 'components/SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`, 'SiteHeader');
  await upload(path.join(S, 'components/SiteFooter.tsx'), `${WEB}/components/SiteFooter.tsx`, 'SiteFooter');
  await upload(path.join(S, 'tmp_mainpage.tsx'),           `${WEB}/app/page.tsx`,              'Главная');
  await upload(path.join(S, 'download-translated.tsx'),    `${WEB}/app/download/page.tsx`,     'Загрузка');

  for (const f of ['Centrio Setup 1.5.23.exe', 'Centrio Setup 1.5.23.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }

  console.log('\n🔨 Сборка centrio-web...');
  console.log(await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -10'));

  console.log('🔄 Перезапуск centrio-web...');
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('🔍 Проверка установщика...');
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.5.23.exe" | head -2'));

  console.log('\n✅ v1.5.23 задеплоен!');
  await sftp.end();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
