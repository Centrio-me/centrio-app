require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const DL = '/var/www/centrio-downloads';
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
const DIST = path.join(__dirname, '..', 'dist');
async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ skip ${label}`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}
async function main() {
  await sftp.connect(config);
  for (const f of ['Centrio Setup 1.6.5.exe', 'Centrio Setup 1.6.5.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }
  // Fix nginx timeout for large file downloads
  const nginxFix = `
grep -q "send_timeout 300" /etc/nginx/nginx.conf || sed -i '/tcp_nopush on;/a\\tsend_timeout 300s;\n\tkeepalive_timeout 300s;\n\tclient_header_timeout 60s;\n\tclient_body_timeout 300s;' /etc/nginx/nginx.conf && nginx -t && systemctl reload nginx && echo "nginx reloaded"
`;
  console.log(await run(nginxFix));
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.6.5.exe" | head -3'));
  console.log('✅ v1.6.5 deployed!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
