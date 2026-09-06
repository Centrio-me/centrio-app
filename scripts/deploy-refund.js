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

async function main() {
  await sftp.connect(config);

  // Create refund directory
  console.log('📁 Creating /refund directory...');
  await run(`mkdir -p ${WEB}/app/refund`);
  console.log('✓');

  // Upload page
  console.log('📤 Uploading refund/page.tsx...');
  await sftp.put(path.join(__dirname, '..', 'server', 'refund-page.tsx'), `${WEB}/app/refund/page.tsx`);
  console.log('✓');

  // Upload layout
  console.log('📤 Uploading refund/layout.tsx...');
  await sftp.put(path.join(__dirname, '..', 'server', 'seo-layouts', 'refund-layout.tsx'), `${WEB}/app/refund/layout.tsx`);
  console.log('✓');

  // Build
  console.log('\n🔨 Building centrio-web...');
  console.log(await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -20'));
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('\n✅ Done! https://centrio.me/refund');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
