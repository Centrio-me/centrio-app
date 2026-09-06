require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

const FILES = [
  {
    local:  path.join(__dirname, '../landing/download.tsx'),
    remote: '/var/www/centrio-web/src/app/download/page.tsx',
  },
];

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    });
  });
}

async function main() {
  console.log('🔌 Connecting...');
  await sftp.connect(config);

  console.log('📤 Uploading files...');
  for (const f of FILES) {
    await sftp.put(f.local, f.remote);
    console.log(`  ✓ ${path.basename(f.local)} → ${f.remote}`);
  }

  // Patch version string in i18n.ts on server (avoid overwriting blog keys)
  console.log('🔧 Patching i18n.ts version...');
  await runCommand(
    "sed -i \"s/dl_win_sub: 'v[0-9.]\\+ · Windows 10\\/11'/dl_win_sub: 'v1.6.94 · Windows 10\\/11'/g\" " +
    "/var/www/centrio-web/src/app/i18n.ts"
  );

  console.log('\n🔨 Building...');
  await runCommand('cd /var/www/centrio-web && npm run build 2>&1 | tail -30');

  console.log('\n♻️  Restarting pm2...');
  await runCommand('pm2 restart centrio-web 2>&1');

  console.log('\n✅ Landing deployed!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
