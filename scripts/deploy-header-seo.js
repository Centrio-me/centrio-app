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

  // 1. Upload shared components
  console.log('📤 Uploading shared components...');
  await run(`mkdir -p ${WEB}/components`);
  await sftp.put(path.join(__dirname, '..', 'server', 'components', 'SiteHeader.tsx'), `${WEB}/components/SiteHeader.tsx`);
  await sftp.put(path.join(__dirname, '..', 'server', 'components', 'SeoFooter.tsx'),  `${WEB}/components/SeoFooter.tsx`);
  console.log('✓ SiteHeader.tsx, SeoFooter.tsx');

  // 2. Update global layout (Yandex Metrika + SEO)
  console.log('📤 Global layout (Metrika)...');
  await sftp.put(path.join(__dirname, '..', 'server', 'layout-new.tsx'), `${WEB}/app/layout.tsx`);
  console.log('✓ layout.tsx');

  // 3. Patch each page server-side using Node
  // We download, modify, re-upload in JS
  const pagesToPatch = [
    {
      file: `${WEB}/app/pricing/page.tsx`,
      // Remove old nav and add SiteHeader
      removePattern: /(\s*\{\/\* NAV \*\/\}[\s\S]*?<\/nav>|<nav className="nav-back">[\s\S]*?<\/nav>)/,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
      siteHeaderTag: '<SiteHeader />',
      seoFooterBefore: '</>\n  )\n}',
    },
    {
      file: `${WEB}/app/faq/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
    {
      file: `${WEB}/app/privacy/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
    {
      file: `${WEB}/app/terms/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
    {
      file: `${WEB}/app/blog/vs-rambox/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
    {
      file: `${WEB}/app/blog/vs-franz/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
    {
      file: `${WEB}/app/download/page.tsx`,
      removeNavRegex: true,
      addImports: ["import SiteHeader from '@/components/SiteHeader'", "import SeoFooter from '@/components/SeoFooter'"],
    },
  ];

  for (const page of pagesToPatch) {
    const tmpLocal = `/tmp/centrio_patch_${Date.now()}.tsx`;
    const localTmp = path.join(__dirname, '..', 'server', 'tmp_patch.tsx');

    // Download
    await sftp.get(page.file, localTmp);
    let content = require('fs').readFileSync(localTmp, 'utf8');

    // Check if already patched
    if (content.includes("import SiteHeader")) {
      console.log(`  ⏭ ${page.file} already patched`);
      continue;
    }

    // Add imports after first import line
    const firstImport = content.indexOf('\nimport ');
    const insertPos = content.indexOf('\n', firstImport + 1);
    const imports = "\nimport SiteHeader from '@/components/SiteHeader'\nimport SeoFooter from '@/components/SeoFooter'";
    content = content.slice(0, insertPos) + imports + content.slice(insertPos);

    // Remove existing nav block (various patterns)
    // Pattern 1: {/* NAV */}\n<nav ...>...</nav>
    content = content.replace(/\s*\{\/\*\s*NAV\s*\*\/\}[\s\S]*?<\/nav>/m, '\n      <SiteHeader />');

    // Pattern 2: standalone <nav style=... (if not replaced above)
    if (!content.includes('<SiteHeader />')) {
      content = content.replace(/<nav\s[^>]*>[\s\S]*?<\/nav>/m, '<SiteHeader />');
    }

    // Remove .nav-back and .nav-link CSS classes from inline style blocks
    content = content.replace(/\s*\.nav-back\s*\{[^}]*\}/g, '');
    content = content.replace(/\s*\.nav-link\s*\{[^}]*\}/g, '');
    content = content.replace(/\s*\.nav-link:hover\s*\{[^}]*\}/g, '');

    // Add SeoFooter before last </> or </main> or </div> before closing export
    // Find the last closing fragment before the final }
    const lastClose = content.lastIndexOf('</>');
    if (lastClose !== -1) {
      content = content.slice(0, lastClose) + '      <SeoFooter />\n    </>' + content.slice(lastClose + 3);
    } else {
      // Try </main>
      const lastMain = content.lastIndexOf('</main>');
      if (lastMain !== -1) {
        content = content.slice(0, lastMain) + '<SeoFooter />\n      </main>' + content.slice(lastMain + 7);
      }
    }

    require('fs').writeFileSync(localTmp, content, 'utf8');
    await sftp.put(localTmp, page.file);
    console.log(`  ✓ Patched: ${page.file.split('/').pop()}`);
  }

  // 4. Also patch pricing page (has different structure)
  {
    const localTmp = path.join(__dirname, '..', 'server', 'tmp_patch.tsx');
    const pricingFile = `${WEB}/app/pricing/page.tsx`;
    await sftp.get(pricingFile, localTmp);
    let c = require('fs').readFileSync(localTmp, 'utf8');

    if (!c.includes('SeoFooter')) {
      // Remove the old nav (pricing has nav-back class)
      c = c.replace(/\s*\{\/\*\s*NAV\s*\*\/\}[\s\S]*?<\/nav>/m, '\n      <SiteHeader />');
      if (!c.includes('<SiteHeader />')) {
        c = c.replace(/<nav className="nav-back">[\s\S]*?<\/nav>/, '<SiteHeader />');
      }
      // Add SeoFooter before last </>
      const lc = c.lastIndexOf('</>');
      if (lc !== -1) {
        c = c.slice(0, lc) + '      <SeoFooter />\n    </>' + c.slice(lc + 3);
      }
      require('fs').writeFileSync(localTmp, c, 'utf8');
      await sftp.put(localTmp, pricingFile);
      console.log('  ✓ Patched: pricing/page.tsx');
    }
  }

  // 5. Build and restart
  console.log('\n🔨 Building...');
  console.log(await run('cd /var/www/centrio-web && npm run build 2>&1 | tail -20'));
  console.log(await run('pm2 restart centrio-web 2>&1 | tail -5'));

  console.log('\n✅ Done! Header + SEO text + Metrika on all pages.');
  await sftp.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
