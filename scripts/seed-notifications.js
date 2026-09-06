require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

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

async function main() {
  await sftp.connect(config);

  // Check current notifications count
  const count = await run(`cd /var/www/centrio-api && node -e "
const prisma = require('./src/utils/prisma');
prisma.appNotification.count().then(c => { console.log('count:', c); prisma.\$disconnect(); });
"`);
  console.log(count.trim());

  if (count.includes('count: 0')) {
    console.log('Seeding notifications...');
    const seed = await run(`cd /var/www/centrio-api && node -e "
const prisma = require('./src/utils/prisma');
async function main() {
  await prisma.appNotification.createMany({ data: [
    {
      title: '🎉 Добро пожаловать в Centrio!',
      body: 'Приложение установлено. Добавь первый мессенджер через кнопку «+» в боковой панели.',
      actionLabel: 'Скачать приложение',
      actionUrl: 'https://centrio.me/download',
    },
    {
      title: '🚀 Centrio v1.5.18 — что нового',
      body: 'Добавлена сборка для macOS и Linux, исправлен VPN, улучшена синхронизация. Обновление доступно автоматически.',
      actionLabel: 'Подробнее',
      actionUrl: 'https://github.com/ArtemkaFreedom/centrio-app/blob/main/CHANGELOG.md',
    },
    {
      title: '✨ Попробуй Centrio Pro',
      body: 'Получи неограниченное количество мессенджеров, папки и облачную синхронизацию. Первый месяц — 199 ₽.',
      actionLabel: 'Узнать о Pro',
      actionUrl: 'https://centrio.me/pricing',
    },
  ]});
  console.log('Seeded 3 notifications');
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
"`);
    console.log(seed.trim());
  } else {
    console.log('Notifications already exist, skipping seed.');
  }

  // Upload fixed stats.js
  console.log('Uploading stats.js fix...');
  await sftp.put('server/api/stats.js', '/var/www/centrio-api/src/routes/stats.js');
  console.log('✓ stats.js');

  // Restart centrio-api
  const restart = await run('pm2 restart centrio-api 2>&1 | tail -3');
  console.log(restart.trim());

  console.log('✅ Done');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
