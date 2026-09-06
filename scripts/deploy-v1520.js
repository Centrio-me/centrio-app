require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';
const API = '/var/www/centrio-api';

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

const S = path.join(__dirname, '..', 'server');
const L = path.join(__dirname, '..', 'landing');

async function main() {
  await sftp.connect(config);

  // ── Web (Next.js) ──────────────────────────────────────────────
  console.log('📤 i18n.ts...');
  await sftp.put(path.join(S, 'i18n-new.ts'), `${WEB}/lib/i18n.ts`);
  console.log('✓');

  console.log('📤 dashboard/page.tsx (FRIDE payment + i18n)...');
  await sftp.put(path.join(S, 'dashboard-translated.tsx'), `${WEB}/app/dashboard/page.tsx`);
  console.log('✓');

  // ── API (Express) ──────────────────────────────────────────────
  console.log('📤 payments-server.js (FRIDE routes)...');
  await sftp.put(path.join(L, 'payments-server.js'), `${API}/src/routes/payments.js`);
  console.log('✓');

  // ── Electron installer ────────────────────────────────────────
  const distDir = path.join(__dirname, '..', 'dist');
  const dlDir = '/var/www/centrio-downloads';
  for (const f of ['Centrio Setup 1.5.20.exe', 'Centrio Setup 1.5.20.exe.blockmap', 'latest.yml']) {
    const local = path.join(distDir, f);
    const remote = `${dlDir}/${f}`;
    const fs = require('fs');
    if (!fs.existsSync(local)) { console.log(`  ⚠ skip ${f} (not found)`); continue; }
    console.log(`📤 ${f}...`);
    await sftp.put(local, remote);
    console.log('✓');
  }

  // ── Build & restart ───────────────────────────────────────────
  console.log('\n🔨 Building centrio-web...');
  const build = await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -30');
  console.log(build);

  console.log('🔄 Restarting centrio-web...');
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -3'));

  console.log('🔄 Restarting centrio-api...');
  console.log(await run('pm2 restart centrio-api 2>&1 | tail -3'));

  console.log('\n✅ v1.5.20 deployed!');
  console.log('   • FRIDE payment integration');
  console.log('   • Dashboard language switcher');
  console.log('   • VPN per-app settings');
  console.log('   • Context menu: VPN toggle (no proxy)');
  console.log('   • Removed notification sound settings');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
