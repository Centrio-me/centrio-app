require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');

const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

async function tryList(path) {
  try {
    const files = await sftp.list(path);
    console.log(`\nFiles in ${path}:`);
    files.forEach(f => console.log(' ', f.name, f.size ? `(${(f.size/1024/1024).toFixed(1)} MB)` : '[dir]'));
  } catch(e) {
    console.log(`  ${path}: ${e.message}`);
  }
}

async function main() {
  await sftp.connect(config);

  // Try common paths
  await tryList('/var/www');
  await tryList('/var/www/html');
  await tryList('/var/www/centrio-web');
  await tryList('/var/www/centrio-web/public');

  await sftp.end();
}

main().catch(e => console.error(e.message));
