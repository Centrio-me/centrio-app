require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');

const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

async function tryList(path) {
  try {
    const files = await sftp.list(path);
    console.log(`\nFiles in ${path}:`);
    if (files.length === 0) console.log('  (empty)');
    files.forEach(f => console.log(' ', f.name, f.size ? `(${(f.size/1024/1024).toFixed(1)} MB)` : '[dir]'));
  } catch(e) {
    console.log(`  ${path}: ${e.message}`);
  }
}

async function main() {
  await sftp.connect(config);
  await tryList('/var/www/centrio-downloads/linux');
  await tryList('/var/www/centrio-downloads/mac');
  await tryList('/var/www/centrio-downloads/win');
  await sftp.end();
}

main().catch(e => console.error(e.message));
