require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function main() {
  await sftp.connect(config);
  await sftp.get('/var/www/centrio-web/src/app/page.tsx',        'server/main-page-current.tsx');
  await sftp.get('/var/www/centrio-web/src/app/layout.tsx',      'server/layout-current.tsx');
  await sftp.get('/var/www/centrio-web/src/app/dashboard/page.tsx', 'server/dashboard-server.tsx');
  console.log('Downloaded all');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
