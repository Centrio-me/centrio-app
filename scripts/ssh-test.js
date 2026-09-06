require('dotenv').config()
const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected!');
  conn.exec('echo hello && ls /var/www/centrio-web', (err, stream) => {
    if (err) throw err;
    stream
      .on('close', (code, signal) => {
        console.log('Done, code=' + code);
        conn.end();
      })
      .on('data', (data) => {
        console.log('STDOUT: ' + data);
      })
      .stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
  });
}).on('error', err => {
  console.log('ERR: ' + err.message);
}).connect({
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
});
