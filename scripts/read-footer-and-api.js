require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
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
  fs.mkdirSync('server/api', { recursive: true });
  await sftp.get('/var/www/centrio-api/src/routes/notifications.js', 'server/api/notifications.js');
  await sftp.get('/var/www/centrio-api/src/routes/stats.js',         'server/api/stats.js');
  console.log('=== notifications.js ===');
  console.log(fs.readFileSync('server/api/notifications.js','utf8'));
  console.log('\n=== stats.js ===');
  console.log(fs.readFileSync('server/api/stats.js','utf8'));
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
