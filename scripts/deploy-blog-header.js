require('dotenv').config()
// Деплой: blog pages + SiteHeader mobile fix
// blog/vs-rambox, blog/vs-franz, components/SiteHeader
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

  // 1. SiteHeader (mobile icon fix)
  console.log('📤 components/SiteHeader.tsx...');
  await sftp.put(path.join(S, 'components', 'SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`);
  console.log('✓');

  // 2. blog/vs-rambox/page.tsx
  console.log('📤 blog/vs-rambox/page.tsx...');
  await run(`mkdir -p ${WEB}/app/blog/vs-rambox`);
  await sftp.put(path.join(S, 'pages', 'blog-rambox.tsx'), `${WEB}/app/blog/vs-rambox/page.tsx`);
  console.log('✓');

  // 3. blog/vs-franz/page.tsx
  console.log('📤 blog/vs-franz/page.tsx...');
  await run(`mkdir -p ${WEB}/app/blog/vs-franz`);
  await sftp.put(path.join(S, 'pages', 'blog-franz.tsx'), `${WEB}/app/blog/vs-franz/page.tsx`);
  console.log('✓');

  // 4. Build
  console.log('\n🔨 Building centrio-web...');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -40');
  console.log(build);
  const pm2out = await run('pm2 restart centrio-web 2>&1 | tail -3');
  console.log(pm2out);

  console.log('\n✅ Deployed: blog pages + mobile header!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
