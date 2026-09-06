require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');

const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

const uploads = [
  { local: path.join(__dirname, '..', 'landing', 'page.tsx'),     remote: '/var/www/centrio-web/src/app/page.tsx' },
  { local: path.join(__dirname, '..', 'landing', 'i18n.ts'),      remote: '/var/www/centrio-web/src/lib/i18n.ts' },
  { local: path.join(__dirname, '..', 'landing', 'download.tsx'), remote: '/var/www/centrio-web/src/app/download/page.tsx' },
];

async function main() {
  await sftp.connect(config);
  console.log('Connected!\n');
  for (const { local, remote } of uploads) {
    const remoteDir = remote.substring(0, remote.lastIndexOf('/'));
    try { await sftp.mkdir(remoteDir, true); } catch {}
    await sftp.put(local, remote);
    console.log(`✓ ${path.basename(local)} → ${remote}`);
  }
  await sftp.end();
  console.log('\nAll uploaded.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
