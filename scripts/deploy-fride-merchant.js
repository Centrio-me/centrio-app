require('dotenv').config()
// Деплой: активация FRIDE-оплаты с реальным Merchant ID
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs   = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const API = '/var/www/centrio-api';
const L   = path.join(__dirname, '..', 'landing');

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

async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ пропуск ${label}`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}

async function main() {
  await sftp.connect(config);
  console.log('Подключено к серверу\n');

  await upload(
    path.join(L, 'payments-server.js'),
    `${API}/src/routes/payments.js`,
    'payments.js — FRIDE Merchant ID активирован'
  );

  console.log('\n🔄 Перезапуск centrio-api...');
  console.log(await run('pm2 restart centrio-api 2>&1 | tail -5'));

  console.log('\n🔍 Проверка FRIDE эндпоинта...');
  const check = await run(
    'curl -s -o /dev/null -w "%{http_code}" -X POST https://centrio.me/api/payments/fride-create ' +
    '-H "Content-Type: application/json" -d \'{"plan":"month"}\''
  );
  console.log('  HTTP статус (без авторизации, ожидаем 401):', check);

  console.log('\n✅ FRIDE Merchant ID задеплоен!');
  console.log('   Merchant ID: 7dc7e217-0041-48b9-98b0-94a02ffd67c0');
  console.log('   Маршрут:     POST /api/payments/fride-create');
  console.log('   Вебхук:      POST /api/payments/fride-webhook');

  await sftp.end();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
