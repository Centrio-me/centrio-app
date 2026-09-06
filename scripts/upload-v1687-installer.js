require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();

const host = process.env.UPLOAD_HOST || '31.128.44.165';
const password = process.env.UPLOAD_PASSWORD;
const config = { host, port: 22, username: 'root', password, readyTimeout: 30000 };
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
  for (const f of ['Centrio Setup 1.6.87.exe', 'Centrio Setup 1.6.87.exe.blockmap', 'latest.yml']) {
    const local = path.join(DIST, f);
    console.log(`📤 ${f}...`);
    await sftp.put(local, `${DL}/${f}`);
    console.log('  ✓');
  }
  const check = await run('curl -sI "https://download.centrio.me/latest.yml" | head -3');
  console.log(check);
  const yml = await run('cat /var/www/centrio-downloads/latest.yml');
  console.log('latest.yml on server:\n' + yml);
  console.log('✅ v1.6.87 installer uploaded!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
