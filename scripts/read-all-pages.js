require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
async function main() {
  await sftp.connect(config);
  const pages = [
    ['/var/www/centrio-web/src/app/faq/page.tsx',                 'server/pages/faq.tsx'],
    ['/var/www/centrio-web/src/app/privacy/page.tsx',             'server/pages/privacy.tsx'],
    ['/var/www/centrio-web/src/app/terms/page.tsx',               'server/pages/terms.tsx'],
    ['/var/www/centrio-web/src/app/blog/vs-rambox/page.tsx',      'server/pages/blog-rambox.tsx'],
    ['/var/www/centrio-web/src/app/blog/vs-franz/page.tsx',       'server/pages/blog-franz.tsx'],
    ['/var/www/centrio-web/src/app/download/page.tsx',            'server/pages/download.tsx'],
  ];
  const fs = require('fs');
  fs.mkdirSync('server/pages', { recursive: true });
  for (const [remote, local] of pages) {
    await sftp.get(remote, local);
    console.log('✓', local);
  }
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
