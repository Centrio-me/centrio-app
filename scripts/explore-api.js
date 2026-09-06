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

  console.log('=== PM2 list ===');
  console.log(await run('pm2 list'));

  console.log('\n=== centrio-api location ===');
  console.log(await run('pm2 show centrio-api 2>&1 | grep -E "script|cwd|root"'));

  console.log('\n=== centrio-api dir structure ===');
  console.log(await run('ls $(pm2 show centrio-api 2>&1 | grep "script path" | awk \'{print $NF}\' | xargs dirname) 2>/dev/null || ls /var/www/centrio-api/ 2>/dev/null || find /var/www -name "*.js" -path "*/api/*" -maxdepth 4 | head -30'));

  console.log('\n=== find Pro activation in centrio-api ===');
  console.log(await run('grep -r "pro\\|Pro\\|subscription\\|activate" /var/www/centrio-api/ --include="*.js" -l 2>/dev/null | head -20'));

  console.log('\n=== find Pro activation in centrio-web ===');
  console.log(await run('grep -r "pro\\|yookassa\\|payment" /var/www/centrio-web/src --include="*.ts" -l 2>/dev/null | head -20'));

  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
