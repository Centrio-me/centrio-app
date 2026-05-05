const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: 'j2KHHxjz5_A)' };
const DL = '/var/www/centrio-downloads';
const WEB = '/var/www/centrio-web/src';

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
const SERVER = path.join(__dirname, '..', 'server');

async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ skip ${label}`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}

async function main() {
  await sftp.connect(config);

  // 1. Upload installer files
  console.log('\n── Installer files ──');
  for (const f of ['Centrio Setup 1.6.6.exe', 'Centrio Setup 1.6.6.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }

  // 2. Upload site files
  console.log('\n── Site files ──');
  const siteFiles = [
    ['components/SiteHeader.tsx',           'components/SiteHeader.tsx'],
    ['components/SiteFooter.tsx',           'components/SiteFooter.tsx'],
    ['components/SeoFooter.tsx',            'components/SeoFooter.tsx'],
    ['tmp_mainpage.tsx',                    'tmp_mainpage.tsx'],
    ['download-translated.tsx',             'download-translated.tsx'],
    ['seo-layouts/download-layout.tsx',     'seo-layouts/download-layout.tsx'],
    ['i18n-new.ts',                         'i18n-new.ts'],
    ['i18n.ts',                             'i18n.ts'],
    ['pages/blog-franz.tsx',                'pages/blog-franz.tsx'],
    ['pages/blog-rambox.tsx',               'pages/blog-rambox.tsx'],
    ['pages/blog-topapps.tsx',              'pages/blog-topapps.tsx'],
    ['pages/blog-wavebox.tsx',              'pages/blog-wavebox.tsx'],
    ['pages/features.tsx',                  'pages/features.tsx'],
  ];

  for (const [local, remote] of siteFiles) {
    await upload(path.join(SERVER, local), `${WEB}/${remote}`, remote);
  }

  // 3. Rebuild and restart
  console.log('\n── Build & restart ──');
  const buildOut = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -5');
  console.log(buildOut);
  const restartOut = await run('pm2 restart centrio-web && echo "pm2 restarted"');
  console.log(restartOut);

  // 4. Verify
  console.log('\n── Verify ──');
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.6.6.exe" | head -3'));
  console.log(await run('curl -s "https://centrio.me" | grep -o "1\\.6\\.[0-9]" | head -3'));

  // 5. Check for old versions on server
  const oldCheck = await run('grep -r "1\\.5\\." /var/www/centrio-web/src --include="*.tsx" --include="*.ts" -l 2>/dev/null | head -5');
  if (oldCheck.trim()) {
    console.log('⚠ Files still with old version:', oldCheck);
  } else {
    console.log('✅ No old versions found on server');
  }

  console.log('\n✅ v1.6.6 deployed!');
  await sftp.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
