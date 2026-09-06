require('dotenv').config()
const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
const outFile = 'C:/MessengerApps/scripts/centrio-check-result.txt';
let output = '';

const cmd = [
  `python3 -c "import json; p=json.load(open('/var/www/centrio-web/package.json')); deps={**p.get('dependencies',{}), **p.get('devDependencies',{})}; print('=== DEPS CHECK ==='); print('tailwindcss:', 'tailwindcss' in deps); print('shadcn:', any('shadcn' in k for k in deps)); print('radix-ui:', any('@radix-ui' in k for k in deps)); print('next version:', deps.get('next','?'))" 2>&1`,
  `echo '=== TAILWIND CONFIG ==='; [ -f /var/www/centrio-web/tailwind.config.js ] && echo 'tailwind.config.js EXISTS' || echo 'tailwind.config.js NOT FOUND'; [ -f /var/www/centrio-web/tailwind.config.ts ] && echo 'tailwind.config.ts EXISTS' || echo 'tailwind.config.ts NOT FOUND'`,
  `echo '=== @TAILWIND DIRECTIVES ==='; grep -r '@tailwind' /var/www/centrio-web/src/ --include='*.css' -l 2>/dev/null || echo 'No @tailwind directives found'`,
  `echo '=== src/app/ CONTENTS ==='; ls /var/www/centrio-web/src/app/ 2>/dev/null || echo 'NOT FOUND'`,
  `echo '=== src/components/ CONTENTS ==='; ls /var/www/centrio-web/src/components/ 2>/dev/null || echo 'NOT FOUND'`,
  `echo '=== globals.css (first 30 lines) ==='; head -30 /var/www/centrio-web/src/app/globals.css 2>/dev/null || echo 'NOT FOUND'`,
].join('; ');

conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) {
      fs.writeFileSync(outFile, 'EXEC ERROR: ' + err.message);
      conn.end();
      return;
    }
    stream.on('data', d => { output += d.toString(); });
    stream.stderr.on('data', d => { output += '[STDERR] ' + d.toString(); });
    stream.on('close', (code) => {
      output += '\n[EXIT CODE: ' + code + ']';
      fs.writeFileSync(outFile, output);
      conn.end();
    });
  });
}).on('error', (e) => {
  fs.writeFileSync(outFile, 'CONN ERROR: ' + e.message);
}).connect({
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD
});
