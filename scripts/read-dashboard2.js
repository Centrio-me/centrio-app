require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function run(cmd) {
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
  // Get lines 200 to end
  console.log(await run('tail -n +200 /var/www/centrio-web/src/app/dashboard/page.tsx'));
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
