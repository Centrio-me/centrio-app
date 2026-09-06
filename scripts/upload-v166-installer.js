require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const DL   = '/var/www/centrio-downloads';
const DIST = path.join(__dirname, '..', 'dist');

function run(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', () => resolve(out));
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
    });
  });
}

async function main() {
  await sftp.connect(config);
  for (const f of ['Centrio Setup 1.6.18.exe', 'Centrio Setup 1.6.18.exe.blockmap', 'latest.yml']) {
    const local = path.join(DIST, f);
    console.log(`📤 ${f}...`);
    await sftp.put(local, `${DL}/${f}`);
    console.log('  ✓');
  }
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.6.18.exe" | head -2'));
  console.log('✅ installer uploaded!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
