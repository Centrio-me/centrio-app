require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';

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

  // 1. Upload updated SiteHeader (with i18n translations)
  console.log('📤 SiteHeader (translated)...');
  await sftp.put(path.join(__dirname,'..','server','components','SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`);
  console.log('✓');

  // 2. Upload SiteFooter component
  console.log('📤 SiteFooter...');
  await sftp.put(path.join(__dirname,'..','server','components','SiteFooter.tsx'), `${WEB}/components/SiteFooter.tsx`);
  console.log('✓');

  // 3. Patch all pages to add SiteFooter (replace old footer / add before last </>)
  const pages = [
    `${WEB}/app/pricing/page.tsx`,
    `${WEB}/app/faq/page.tsx`,
    `${WEB}/app/privacy/page.tsx`,
    `${WEB}/app/terms/page.tsx`,
    `${WEB}/app/blog/vs-rambox/page.tsx`,
    `${WEB}/app/blog/vs-franz/page.tsx`,
    `${WEB}/app/download/page.tsx`,
  ];

  const localTmp = path.join(__dirname, '..', 'server', 'tmp_patch2.tsx');
  for (const file of pages) {
    await sftp.get(file, localTmp);
    let c = fs.readFileSync(localTmp, 'utf8');

    if (c.includes('SiteFooter')) {
      console.log(`  ⏭ ${file.split('/').pop()} already has SiteFooter`);
      continue;
    }

    // Add SiteFooter import
    const firstImport = c.indexOf('\nimport ');
    if (firstImport !== -1) {
      const pos = c.indexOf('\n', firstImport + 1);
      c = c.slice(0, pos) + "\nimport SiteFooter from '@/components/SiteFooter'" + c.slice(pos);
    }

    // Replace SeoFooter with SiteFooter if present
    c = c.replace(/<SeoFooter\s*\/>/g, '<SiteFooter />');

    // If no SeoFooter, add SiteFooter before last </>
    if (!c.includes('<SiteFooter />')) {
      const lc = c.lastIndexOf('</>');
      if (lc !== -1) {
        c = c.slice(0, lc) + '      <SiteFooter />\n    </>' + c.slice(lc + 3);
      }
    }

    fs.writeFileSync(localTmp, c, 'utf8');
    await sftp.put(localTmp, file);
    console.log(`  ✓ Footer added: ${file.split('/').pop()}`);
  }

  // 4. Seed notifications + fix stats.js
  console.log('\n📤 stats.js fix...');
  await sftp.put(path.join(__dirname,'..','server','api','stats.js'), '/var/www/centrio-api/src/routes/stats.js');
  console.log('✓');

  console.log('\n🌱 Seeding notifications...');
  const seedResult = await run(`cd /var/www/centrio-api && node -e "
const prisma = require('./src/utils/prisma');
async function main() {
  const existing = await prisma.appNotification.count();
  if (existing > 0) { console.log('already seeded:', existing); await prisma.\$disconnect(); return; }
  await prisma.appNotification.createMany({ data: [
    { title: '🎉 Добро пожаловать в Centrio!', body: 'Приложение установлено. Добавь первый мессенджер через кнопку «+» в боковой панели.', actionLabel: 'Скачать', actionUrl: 'https://centrio.me/download' },
    { title: '🚀 Centrio v1.5.18 — что нового', body: 'Добавлена сборка для macOS и Linux, исправлен VPN, улучшена синхронизация. Обновление доступно автоматически.', actionLabel: 'Подробнее', actionUrl: 'https://github.com/ArtemkaFreedom/centrio-app/blob/main/CHANGELOG.md' },
    { title: '✨ Попробуй Centrio Pro', body: 'Неограниченные мессенджеры, папки, облачная синхронизация. Первый месяц — 199 ₽ или криптовалютой.', actionLabel: 'Тарифы', actionUrl: 'https://centrio.me/pricing' },
  ]});
  console.log('Seeded 3 notifications ✓');
  await prisma.\$disconnect();
}
main().catch(e => console.error(e.message));
" 2>&1`);
  console.log(seedResult.trim());

  // 5. Restart centrio-api
  console.log('\n🔄 Restart centrio-api...');
  await run('pm2 restart centrio-api 2>&1');
  console.log('✓');

  // 6. Build centrio-web
  console.log('\n🔨 Building centrio-web...');
  console.log(await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -20'));
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('\n✅ All done!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
