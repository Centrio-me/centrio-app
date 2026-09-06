require('dotenv').config()
// deploy-blog-pages.js — deploys blog comparison pages + layouts + main page + i18n to server
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();

const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';
const S = path.join(__dirname, '..', 'server');

function run(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', () => resolve(out));
      stream.on('data', d => (out += d));
      stream.stderr.on('data', d => (out += d));
    });
  });
}

async function main() {
  console.log('=== deploy-blog-pages ===\n');
  await sftp.connect(config);
  console.log('🔗 Connected\n');

  // i18n (with all blog keys)
  console.log('📤 lib/i18n.ts...');
  await sftp.put(path.join(S, 'i18n-new.ts'), `${WEB}/lib/i18n.ts`);
  console.log('  ✓');

  // Main page (with SiteFooter)
  console.log('📤 app/page.tsx (main page)...');
  await sftp.put(path.join(S, 'tmp_mainpage.tsx'), `${WEB}/app/page.tsx`);
  console.log('  ✓');

  // Ensure blog dirs exist
  await run('mkdir -p /var/www/centrio-web/src/app/blog/vs-rambox /var/www/centrio-web/src/app/blog/vs-franz /var/www/centrio-web/src/app/blog/vs-wavebox');

  // Blog page.tsx files (client components with useLang)
  console.log('📤 blog/vs-rambox/page.tsx...');
  await sftp.put(path.join(S, 'pages', 'blog-rambox.tsx'), `${WEB}/app/blog/vs-rambox/page.tsx`);
  console.log('  ✓');

  console.log('📤 blog/vs-franz/page.tsx...');
  await sftp.put(path.join(S, 'pages', 'blog-franz.tsx'), `${WEB}/app/blog/vs-franz/page.tsx`);
  console.log('  ✓');

  console.log('📤 blog/vs-wavebox/page.tsx...');
  await sftp.put(path.join(S, 'pages', 'blog-wavebox.tsx'), `${WEB}/app/blog/vs-wavebox/page.tsx`);
  console.log('  ✓');

  // Layout files (server components with metadata)
  console.log('📤 blog/vs-rambox/layout.tsx...');
  await sftp.put(path.join(S, 'layouts', 'blog-rambox-layout.tsx'), `${WEB}/app/blog/vs-rambox/layout.tsx`);
  console.log('  ✓');

  console.log('📤 blog/vs-franz/layout.tsx...');
  await sftp.put(path.join(S, 'layouts', 'blog-franz-layout.tsx'), `${WEB}/app/blog/vs-franz/layout.tsx`);
  console.log('  ✓');

  console.log('📤 blog/vs-wavebox/layout.tsx...');
  await sftp.put(path.join(S, 'layouts', 'blog-wavebox-layout.tsx'), `${WEB}/app/blog/vs-wavebox/layout.tsx`);
  console.log('  ✓');

  console.log('\n✅ All files uploaded. Building...\n');

  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -40');
  console.log(build);

  if (build.includes('Error') && !build.includes('Route')) {
    console.error('❌ Build may have failed — check output above');
    sftp.end();
    process.exit(1);
  }

  console.log('\n🔄 Restarting centrio-web...');
  const restart = await run('pm2 restart centrio-web 2>&1');
  console.log(restart);

  sftp.end();
  console.log('\n🎉 Deploy complete!');
}

main().catch(err => {
  console.error('❌', err.message || err);
  sftp.end();
  process.exit(1);
});
