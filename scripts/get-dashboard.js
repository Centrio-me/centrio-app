require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function main() {
  await sftp.connect(config);
  await sftp.get('/var/www/centrio-web/src/app/dashboard/page.tsx', 'server/dashboard-current.tsx');
  console.log('Downloaded');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
