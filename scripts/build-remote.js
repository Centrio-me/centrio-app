require('dotenv').config()
const { Client } = require('ssh2');

const config = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
};

const command = 'cd /var/www/centrio-web && npm run build 2>&1; pm2 restart centrio-web 2>&1; echo "=== DONE ==="';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected, running build...\n');
  conn.exec(command, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      console.log(`\nProcess exited with code: ${code}`);
      conn.end();
    });
    stream.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    stream.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
});

conn.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

conn.connect(config);
