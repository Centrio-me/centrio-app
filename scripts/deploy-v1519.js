require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
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

const S = path.join(__dirname, '..', 'server');

async function main() {
  await sftp.connect(config);

  // 1. i18n.ts (new keys for all 5 languages + v1.5.19)
  console.log('📤 i18n.ts...');
  await sftp.put(path.join(S, 'i18n-new.ts'), `${WEB}/lib/i18n.ts`);
  console.log('✓');

  // 2. Main page (hero mockup + download section translated)
  console.log('📤 app/page.tsx...');
  await sftp.put(path.join(S, 'tmp_mainpage.tsx'), `${WEB}/app/page.tsx`);
  console.log('✓');

  // 3. Dashboard (full translation)
  console.log('📤 app/dashboard/page.tsx...');
  await sftp.put(path.join(S, 'dashboard-translated.tsx'), `${WEB}/app/dashboard/page.tsx`);
  console.log('✓');

  // 4. pricing page
  console.log('📤 pricing/page.tsx...');
  await sftp.put(path.join(S, 'pricing-translated.tsx'), `${WEB}/app/pricing/page.tsx`);
  console.log('✓');

  // 5. faq page
  console.log('📤 faq/page.tsx...');
  await sftp.put(path.join(S, 'faq-translated.tsx'), `${WEB}/app/faq/page.tsx`);
  console.log('✓');

  // 6. download page
  console.log('📤 download/page.tsx...');
  await sftp.put(path.join(S, 'download-translated.tsx'), `${WEB}/app/download/page.tsx`);
  console.log('✓');

  // 7. terms page
  console.log('📤 terms/page.tsx...');
  await sftp.put(path.join(S, 'terms-translated.tsx'), `${WEB}/app/terms/page.tsx`);
  console.log('✓');

  // 8. privacy page
  console.log('📤 privacy/page.tsx...');
  await sftp.put(path.join(S, 'privacy-translated.tsx'), `${WEB}/app/privacy/page.tsx`);
  console.log('✓');

  // 9. Build
  console.log('\n🔨 Building centrio-web...');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -30');
  console.log(build);
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('\n✅ v1.5.19 deployed! Translations complete.');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
