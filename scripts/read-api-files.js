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

  for (const f of ['payments.js', 'user.js', 'index.js', 'auth.js']) {
    console.log(`\n${'='.repeat(60)}\n=== ${f} ===\n${'='.repeat(60)}`);
    console.log(await run(`cat /var/www/centrio-api/src/routes/${f} 2>/dev/null || cat /var/www/centrio-api/src/${f} 2>/dev/null`));
  }

  console.log('\n=== .env or config ===');
  console.log(await run('cat /var/www/centrio-api/.env 2>/dev/null | grep -v "SECRET\\|PASSWORD\\|KEY" || echo "(hidden)"'));

  console.log('\n=== DB schema (users table) ===');
  console.log(await run('grep -r "CREATE TABLE\\|pro\\|subscription\\|expires" /var/www/centrio-api/src --include="*.js" | grep -v node_modules | head -30'));

  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
