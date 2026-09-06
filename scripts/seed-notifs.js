require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

// Write the seed script to a temp file, upload, then execute
const seedScript = `
const prisma = require('./src/utils/prisma');
async function main() {
  const existing = await prisma.appNotification.count();
  if (existing > 0) { console.log('already seeded: ' + existing); await prisma.$disconnect(); return; }
  await prisma.appNotification.createMany({ data: [
    { title: '\\u{1F389} \\u0414\\u043e\\u0431\\u0440\\u043e \\u043f\\u043e\\u0436\\u0430\\u043b\\u043e\\u0432\\u0430\\u0442\\u044c \\u0432 Centrio!', body: '\\u041f\\u0440\\u0438\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435 \\u0443\\u0441\\u0442\\u0430\\u043d\\u043e\\u0432\\u043b\\u0435\\u043d\\u043e. \\u0414\\u043e\\u0431\\u0430\\u0432\\u044c \\u043f\\u0435\\u0440\\u0432\\u044b\\u0439 \\u043c\\u0435\\u0441\\u0441\\u0435\\u043d\\u0434\\u0436\\u0435\\u0440 \\u0447\\u0435\\u0440\\u0435\\u0437 \\u043a\\u043d\\u043e\\u043f\\u043a\\u0443 \\u00ab+\\u00bb.', actionLabel: '\\u0421\\u043a\\u0430\\u0447\\u0430\\u0442\\u044c', actionUrl: 'https://centrio.me/download' },
    { title: '\\u{1F680} Centrio v1.5.18 \\u2014 \\u0447\\u0442\\u043e \\u043d\\u043e\\u0432\\u043e\\u0433\\u043e', body: '\\u0414\\u043e\\u0431\\u0430\\u0432\\u043b\\u0435\\u043d\\u0430 \\u0441\\u0431\\u043e\\u0440\\u043a\\u0430 \\u0434\\u043b\\u044f macOS \\u0438 Linux, \\u0438\\u0441\\u043f\\u0440\\u0430\\u0432\\u043b\\u0435\\u043d VPN.', actionLabel: '\\u041f\\u043e\\u0434\\u0440\\u043e\\u0431\\u043d\\u0435\\u0435', actionUrl: 'https://github.com/ArtemkaFreedom/centrio-app/blob/main/CHANGELOG.md' },
    { title: '\\u2728 \\u041f\\u043e\\u043f\\u0440\\u043e\\u0431\\u0443\\u0439 Centrio Pro', body: '\\u041d\\u0435\\u043e\\u0433\\u0440\\u0430\\u043d\\u0438\\u0447\\u0435\\u043d\\u043d\\u044b\\u0435 \\u043c\\u0435\\u0441\\u0441\\u0435\\u043d\\u0434\\u0436\\u0435\\u0440\\u044b, \\u043f\\u0430\\u043f\\u043a\\u0438, \\u0441\\u0438\\u043d\\u0445\\u0440\\u043e\\u043d\\u0438\\u0437\\u0430\\u0446\\u0438\\u044f. 199 \\u20bd \\u0432 \\u043c\\u0435\\u0441\\u044f\\u0446.', actionLabel: '\\u0422\\u0430\\u0440\\u0438\\u0444\\u044b', actionUrl: 'https://centrio.me/pricing' },
  ]});
  console.log('Seeded 3 notifications OK');
  await prisma.$disconnect();
}
main().catch(e => console.error(e.message));
`;

const tmpLocal = path.join(__dirname, '..', 'server', 'tmp_seed_notifs.js');

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

  // Write seed script locally, upload, execute
  fs.writeFileSync(tmpLocal, seedScript, 'utf8');
  await sftp.put(tmpLocal, '/var/www/centrio-api/tmp_seed_notifs.js');

  const result = await run('cd /var/www/centrio-api && node tmp_seed_notifs.js && rm tmp_seed_notifs.js');
  console.log(result.trim());

  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
