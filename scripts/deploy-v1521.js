require('dotenv').config()
// Деплой v1.5.21 — VPN per-app, FRIDE оплата, переключатель языков в ЛК
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';
const API = '/var/www/centrio-api';
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
const L    = path.join(__dirname, '..', 'landing');
const DIST = path.join(__dirname, '..', 'dist');

async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ пропуск ${label} (файл не найден)`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}

async function main() {
  await sftp.connect(config);
  console.log('Подключено к серверу\n');

  // ── Сайт (Next.js) ────────────────────────────────────────────
  await upload(path.join(S, 'i18n-new.ts'),              `${WEB}/lib/i18n.ts`,                   'i18n.ts (версии v1.5.21, новые «что нового»)');
  await upload(path.join(S, 'dashboard-translated.tsx'),  `${WEB}/app/dashboard/page.tsx`,        'dashboard — FRIDE + переключатель языков');
  await upload(path.join(S, 'components/SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`,     'SiteHeader — ссылка на v1.5.21');
  await upload(path.join(S, 'components/SiteFooter.tsx'), `${WEB}/components/SiteFooter.tsx`,     'SiteFooter — версия v1.5.21');
  await upload(path.join(S, 'tmp_mainpage.tsx'),           `${WEB}/app/page.tsx`,                  'Главная страница — версия v1.5.21');
  await upload(path.join(S, 'download-translated.tsx'),    `${WEB}/app/download/page.tsx`,         'Страница загрузки — v1.5.21');

  // ── API (Express) ──────────────────────────────────────────────
  await upload(path.join(L, 'payments-server.js'), `${API}/src/routes/payments.js`, 'payments.js — маршруты FRIDE');

  // ── Установщик Electron ────────────────────────────────────────
  for (const f of ['Centrio Setup 1.5.21.exe', 'Centrio Setup 1.5.21.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }

  // ── Сборка и перезапуск ───────────────────────────────────────
  console.log('\n🔨 Сборка centrio-web...');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -25');
  console.log(build);

  console.log('🔄 Перезапуск centrio-web...');
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -4'));

  console.log('🔄 Перезапуск centrio-api...');
  console.log(await run('pm2 restart centrio-api 2>&1 | tail -4'));

  // ── Проверка установщика ────────────────────────────────────────
  console.log('🔍 Проверка доступности установщика...');
  const check = await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.5.21.exe" | head -2');
  console.log(check);

  console.log('\n✅ v1.5.21 задеплоен!');
  console.log('   • VPN per-app переключатели');
  console.log('   • Контекстное меню: Use VPN / Don\'t use VPN');
  console.log('   • Убран нерабочий звук уведомлений');
  console.log('   • Оплата через FRIDE в ЛК');
  console.log('   • Переключатель языков в ЛК');
  console.log('   • Уведомление об обновлении придёт через latest.yml');

  await sftp.end();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
