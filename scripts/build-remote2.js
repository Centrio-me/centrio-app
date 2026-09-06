require('dotenv').config()
const { Client } = require('ssh2');
const fs = require('fs');

const config = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
};

const command = 'cd /var/www/centrio-web && npm run build 2>&1 | tail -30; pm2 restart centrio-web 2>&1; echo "=== BUILD COMPLETE ==="';

const log = fs.createWriteStream('C:\\Temp\\build-log.txt', { flags: 'w' });

const conn = new Client();

conn.on('ready', () => {
  log.write('SSH connected, running build...\n');
  conn.exec(command, (err, stream) => {
    if (err) {
      log.write('Exec error: ' + err.message + '\n');
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      log.write('\nProcess exited with code: ' + code + '\n');
      conn.end();
      log.end(() => process.exit(0));
    });
    stream.on('data', (data) => {
      log.write(data.toString());
    });
    stream.stderr.on('data', (data) => {
      log.write('[STDERR] ' + data.toString());
    });
  });
});

conn.on('error', (err) => {
  log.write('Connection error: ' + err.message + '\n');
  log.end(() => process.exit(1));
});

conn.connect(config);
