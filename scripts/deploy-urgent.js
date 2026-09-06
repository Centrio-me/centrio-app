require('dotenv').config()
// Deploy: urgent tasks — dashboard lang, footer redesign, new pages, stats fix, i18n
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';
const API = '/var/www/centrio-api/src';

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
  console.log('🔗 Connected\n');

  // 1. i18n (new footer keys for all 5 languages)
  console.log('📤 lib/i18n.ts...');
  await sftp.put(path.join(S, 'i18n-new.ts'), `${WEB}/lib/i18n.ts`);
  console.log('✓');

  // 2. Dashboard (language switcher + currency + notif fix)
  console.log('📤 app/dashboard/page.tsx...');
  await sftp.put(path.join(S, 'dashboard-translated.tsx'), `${WEB}/app/dashboard/page.tsx`);
  console.log('✓');

  // 3. SiteFooter (new 5-column layout + newsletter)
  console.log('📤 components/SiteFooter.tsx...');
  await sftp.put(path.join(S, 'components', 'SiteFooter.tsx'), `${WEB}/components/SiteFooter.tsx`);
  console.log('✓');

  // 4. /features page
  console.log('📤 app/features/page.tsx...');
  await run(`mkdir -p ${WEB}/app/features`);
  await sftp.put(path.join(S, 'pages', 'features.tsx'), `${WEB}/app/features/page.tsx`);
  console.log('✓');

  // 5. /blog/top-apps page
  console.log('📤 app/blog/top-apps/page.tsx...');
  await run(`mkdir -p ${WEB}/app/blog/top-apps`);
  await sftp.put(path.join(S, 'pages', 'blog-topapps.tsx'), `${WEB}/app/blog/top-apps/page.tsx`);
  console.log('✓');

  // 6. /blog/vs-wavebox page
  console.log('📤 app/blog/vs-wavebox/page.tsx...');
  await run(`mkdir -p ${WEB}/app/blog/vs-wavebox`);
  await sftp.put(path.join(S, 'pages', 'blog-wavebox.tsx'), `${WEB}/app/blog/vs-wavebox/page.tsx`);
  console.log('✓');

  // 7. Stats API (appNotifReceived fix)
  console.log('📤 centrio-api: routes/stats.js...');
  await sftp.put(path.join(S, 'api', 'stats.js'), `${API}/routes/stats.js`);
  console.log('✓');

  // 8. Notifications API (add /subscribe endpoint)
  console.log('📤 centrio-api: routes/notifications.js...');
  await sftp.put(path.join(S, 'api', 'notifications.js'), `${API}/routes/notifications.js`);
  console.log('✓');

  // 9. Restart centrio-api first
  console.log('\n🔄 Restarting centrio-api...');
  console.log(await run('pm2 restart centrio-api 2>&1 | tail -4'));

  // 10. Build centrio-web
  console.log('\n🔨 Building centrio-web...');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -40');
  console.log(build);

  // 11. Restart centrio-web
  console.log('🔄 Restarting centrio-web...');
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('\n✅ Urgent tasks deployed!');
  console.log('   • Dashboard: language switcher + currency + notif fix');
  console.log('   • SiteFooter: 5-column layout + newsletter');
  console.log('   • /features, /blog/top-apps, /blog/vs-wavebox — new pages');
  console.log('   • Stats API: appNotifReceived fix');
  console.log('   • Notifications API: /subscribe endpoint');
  await sftp.end();
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
