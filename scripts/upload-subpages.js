require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

const uploads = [
  { local: path.join(__dirname, '..', 'landing', 'download-windows.tsx'), remote: '/var/www/centrio-web/src/app/download/windows/page.tsx' },
  { local: path.join(__dirname, '..', 'landing', 'download-macos.tsx'),   remote: '/var/www/centrio-web/src/app/download/macos/page.tsx' },
  { local: path.join(__dirname, '..', 'landing', 'download-linux.tsx'),   remote: '/var/www/centrio-web/src/app/download/linux/page.tsx' },
];

async function main() {
  await sftp.connect(config);
  for (const { local, remote } of uploads) {
    try { await sftp.mkdir(remote.substring(0, remote.lastIndexOf('/')), true); } catch {}
    await sftp.put(local, remote);
    console.log(`✓ ${path.basename(local)}`);
  }
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
