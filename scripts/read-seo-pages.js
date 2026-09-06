require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function main() {
  await sftp.connect(config);
  await sftp.get('/var/www/centrio-web/src/app/pricing/page.tsx',   'server/pricing-page.tsx');
  await sftp.get('/var/www/centrio-web/src/app/download/page.tsx',  'server/download-page.tsx');
  await sftp.get('/var/www/centrio-web/src/app/faq/page.tsx',       'server/faq-page.tsx');
  await sftp.get('/var/www/centrio-web/src/app/privacy/page.tsx',   'server/privacy-page.tsx');
  console.log('Done');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
