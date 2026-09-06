require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const DL   = '/var/www/centrio-downloads';
const DIST = path.join(__dirname, '..', 'dist');

async function main() {
  await sftp.connect(config);
  for (const f of ['Centrio Setup 1.6.80.exe', 'Centrio Setup 1.6.80.exe.blockmap', 'latest.yml']) {
    const local = path.join(DIST, f);
    console.log(`📤 ${f}...`);
    await sftp.put(local, `${DL}/${f}`);
    console.log('  ✓');
  }
  console.log('✅ installer 1.6.80 uploaded!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
