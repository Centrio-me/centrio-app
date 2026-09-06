require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function main() {
  await sftp.connect(config);
  await sftp.get('/var/www/centrio-web/src/lib/i18n.ts', 'server/i18n.ts');
  console.log('Done');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
