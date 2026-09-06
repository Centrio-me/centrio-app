require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');

const sftp = new SftpClient();

const config = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
};

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    // Access the underlying ssh2 Client from sftp
    const ssh = sftp.client;
    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    });
  });
}

async function main() {
  try {
    await sftp.connect(config);
    console.log('Connected via SFTP (ssh2-sftp-client)\n');
    console.log('Running: npm run build...\n');
    const result = await runCommand('cd /var/www/centrio-web && npm run build 2>&1 | tail -30');
    console.log('\n--- Build exit code:', result.code);

    console.log('\nRestarting pm2...');
    const pm2 = await runCommand('pm2 restart centrio-web 2>&1');
    console.log('pm2 exit:', pm2.code);

    await sftp.end();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
