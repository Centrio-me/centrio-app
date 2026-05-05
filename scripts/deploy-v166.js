const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: 'j2KHHxjz5_A)' };
const DL  = '/var/www/centrio-downloads';
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

// Paths relative to repo root (not script dir)
const ROOT   = path.join(__dirname, '..', '..');  // ../../ from worktree/scripts = MessengerApps
const DIST   = path.join(ROOT, 'dist');
const S      = path.join(__dirname, '..', 'server'); // worktree/server (has updated files)

async function upload(local, remote, label) {
  if (!fs.existsSync(local)) { console.log(`  ⚠ skip ${label}`); return; }
  console.log(`📤 ${label}...`);
  await sftp.put(local, remote);
  console.log('  ✓');
}

async function main() {
  await sftp.connect(config);
  console.log('Connected\n');

  // 1. Installer files (from main repo dist/)
  console.log('── Installer ──');
  for (const f of ['Centrio Setup 1.6.6.exe', 'Centrio Setup 1.6.6.exe.blockmap', 'latest.yml']) {
    await upload(path.join(DIST, f), `${DL}/${f}`, f);
  }

  // 2. Site files (from worktree server/)
  console.log('\n── Site files ──');

  // Components
  await upload(path.join(S, 'components', 'SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`,  'SiteHeader.tsx');
  await upload(path.join(S, 'components', 'SiteFooter.tsx'), `${WEB}/components/SiteFooter.tsx`,  'SiteFooter.tsx');
  await upload(path.join(S, 'components', 'SeoFooter.tsx'),  `${WEB}/components/SeoFooter.tsx`,   'SeoFooter.tsx');

  // Main page
  await upload(path.join(S, 'tmp_mainpage.tsx'), `${WEB}/app/page.tsx`, 'app/page.tsx');

  // Download page + layout
  await upload(path.join(S, 'download-translated.tsx'),              `${WEB}/app/download/page.tsx`,   'download/page.tsx');
  await upload(path.join(S, 'seo-layouts', 'download-layout.tsx'),   `${WEB}/app/download/layout.tsx`, 'download/layout.tsx');

  // i18n
  await upload(path.join(S, 'i18n-new.ts'), `${WEB}/lib/i18n.ts`, 'lib/i18n.ts');

  // Blog pages
  await upload(path.join(S, 'pages', 'blog-rambox.tsx'),  `${WEB}/app/blog/vs-rambox/page.tsx`,  'blog/vs-rambox');
  await upload(path.join(S, 'pages', 'blog-franz.tsx'),   `${WEB}/app/blog/vs-franz/page.tsx`,   'blog/vs-franz');
  await upload(path.join(S, 'pages', 'blog-wavebox.tsx'), `${WEB}/app/blog/vs-wavebox/page.tsx`, 'blog/vs-wavebox');
  await upload(path.join(S, 'pages', 'blog-topapps.tsx'), `${WEB}/app/blog/top-apps/page.tsx`,   'blog/top-apps');

  // Features
  await upload(path.join(S, 'pages', 'features.tsx'), `${WEB}/app/features/page.tsx`, 'features/page.tsx');

  // 3. Build + restart
  console.log('\n── Build & restart ──');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -10');
  console.log(build);
  const pm2 = await run('pm2 restart centrio-web && echo "pm2 ok"');
  console.log(pm2);

  // 4. Verify
  console.log('\n── Verify ──');
  console.log(await run('curl -sI "https://download.centrio.me/Centrio%20Setup%201.6.6.exe" | head -2'));
  const oldVerCheck = await run('grep -r "1\\.5\\." /var/www/centrio-web/src --include="*.tsx" --include="*.ts" -l 2>/dev/null | head -5');
  if (oldVerCheck.trim()) console.log('⚠ Old versions still on server:', oldVerCheck);
  else console.log('✅ No old versions on server');

  console.log('\n✅ v1.6.6 deployed!');
  await sftp.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
