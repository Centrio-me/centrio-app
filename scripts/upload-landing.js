require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');

const sftp = new SftpClient();

const config = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
};

const uploads = [
  {
    local: path.join(__dirname, '..', 'landing', 'page.tsx'),
    remote: '/var/www/centrio-web/src/app/page.tsx',
  },
  {
    local: path.join(__dirname, '..', 'landing', 'pricing.tsx'),
    remote: '/var/www/centrio-web/src/app/pricing/page.tsx',
  },
  {
    local: path.join(__dirname, '..', 'landing', 'download.tsx'),
    remote: '/var/www/centrio-web/src/app/download/page.tsx',
  },
];

async function main() {
  try {
    console.log('Connecting to server...');
    await sftp.connect(config);
    console.log('Connected!');

    for (const { local, remote } of uploads) {
      console.log(`Uploading ${path.basename(local)} → ${remote}`);
      const remoteDir = remote.substring(0, remote.lastIndexOf('/'));
      try {
        await sftp.mkdir(remoteDir, true);
      } catch (e) {
        // directory may already exist, ignore
      }
      await sftp.put(local, remote);
      console.log(`  ✓ Done`);
    }

    // Read and update layout.tsx favicon
    console.log('\nReading layout.tsx...');
    const layoutPath = '/var/www/centrio-web/src/app/layout.tsx';
    const layoutContent = await sftp.get(layoutPath);
    const layoutStr = layoutContent.toString('utf8');

    if (!layoutStr.includes("icons:")) {
      const updated = layoutStr.replace(
        /export const metadata.*?\{/s,
        (match) => match
      ).replace(
        /(export const metadata[^=]*=\s*\{)/,
        `$1\n  icons: { icon: '/logo.png' },`
      );
      if (updated !== layoutStr) {
        await sftp.put(Buffer.from(updated, 'utf8'), layoutPath);
        console.log('  ✓ layout.tsx favicon updated');
      } else {
        console.log('  ℹ layout.tsx — icons already set or pattern not matched, skipping');
      }
    } else {
      console.log('  ℹ layout.tsx already has icons field');
    }

    await sftp.end();
    console.log('\nAll files uploaded successfully!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
