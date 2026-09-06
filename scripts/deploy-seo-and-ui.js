require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };
const WEB = '/var/www/centrio-web/src';

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

  // 1. Upload fixed dashboard (currency fix)
  console.log('📤 Dashboard (currency fix)...');
  await sftp.put(path.join(__dirname, '..', 'server', 'dashboard.tsx'),
    `${WEB}/app/dashboard/page.tsx`);
  console.log('✓');

  // 2. Upload new main page (redesigned download section)
  console.log('📤 Main page (new download section)...');
  await sftp.put(path.join(__dirname, '..', 'server', 'main-page-new.tsx'),
    `${WEB}/app/page.tsx`);
  console.log('✓');

  // 3. Upload new global layout (SEO)
  console.log('📤 Global layout (SEO)...');
  await sftp.put(path.join(__dirname, '..', 'server', 'layout-new.tsx'),
    `${WEB}/app/layout.tsx`);
  console.log('✓');

  // 4. Upload per-page SEO layouts
  console.log('📤 Per-page SEO layouts...');
  const layouts = [
    { local: 'seo-layouts/pricing-layout.tsx',  remote: `${WEB}/app/pricing/layout.tsx` },
    { local: 'seo-layouts/download-layout.tsx',  remote: `${WEB}/app/download/layout.tsx` },
    { local: 'seo-layouts/faq-layout.tsx',       remote: `${WEB}/app/faq/layout.tsx` },
    { local: 'seo-layouts/privacy-layout.tsx',   remote: `${WEB}/app/privacy/layout.tsx` },
  ];
  for (const { local, remote } of layouts) {
    await sftp.put(path.join(__dirname, '..', 'server', local), remote);
    console.log(`  ✓ ${local}`);
  }

  // 5. Create sitemap.xml
  console.log('📤 Sitemap...');
  await run(`cat > /var/www/centrio-web/public/sitemap.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://centrio.me/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://centrio.me/download</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>
  <url><loc>https://centrio.me/pricing</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>
  <url><loc>https://centrio.me/faq</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://centrio.me/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://centrio.me/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://centrio.me/blog/vs-rambox</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://centrio.me/blog/vs-franz</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
</urlset>
EOF`);
  console.log('✓');

  // 6. Create robots.txt
  console.log('📤 Robots.txt...');
  await run(`cat > /var/www/centrio-web/public/robots.txt << 'EOF'
User-agent: *
Allow: /

Sitemap: https://centrio.me/sitemap.xml

Disallow: /dashboard
Disallow: /auth/
Disallow: /admin/
Disallow: /payment/
EOF`);
  console.log('✓');

  // 7. Build and restart
  console.log('\n🔨 Building centrio-web...');
  console.log(await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -20'));
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -5'));

  console.log('\n✅ All done!');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
