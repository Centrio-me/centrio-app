require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');

const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

async function main() {
  await sftp.connect(config);
  // Check download server directory
  const files = await sftp.list('/var/www/centrio-download');
  console.log('Files in /var/www/centrio-download:');
  files.forEach(f => console.log(' ', f.name, f.size ? `(${(f.size/1024/1024).toFixed(1)} MB)` : ''));
  await sftp.end();
}

main().catch(e => console.error(e.message));
