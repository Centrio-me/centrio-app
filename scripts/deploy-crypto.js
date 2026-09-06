require('dotenv').config()
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const sftp = new SftpClient();
const config = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD };

const ROOT = '/var/www/centrio-web';

async function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    });
  });
}

async function main() {
  await sftp.connect(config);

  // 1. Create API dirs on server
  await runCmd(`mkdir -p ${ROOT}/src/app/api/create-crypto-payment`);
  await runCmd(`mkdir -p ${ROOT}/src/app/api/crypto-webhook`);

  // 2. Upload route files
  const files = [
    {
      local: path.join(__dirname, '..', 'landing', 'api', 'create-crypto-payment', 'route.ts'),
      remote: `${ROOT}/src/app/api/create-crypto-payment/route.ts`,
    },
    {
      local: path.join(__dirname, '..', 'landing', 'api', 'crypto-webhook', 'route.ts'),
      remote: `${ROOT}/src/app/api/crypto-webhook/route.ts`,
    },
  ];

  for (const { local, remote } of files) {
    await sftp.put(local, remote);
    console.log(`✓ Uploaded ${path.basename(remote)}`);
  }

  // SECURITY: previously hardcoded NOWPayments keys in plaintext here.
  // Now read from env — set NOWPAYMENTS_API_KEY / NOWPAYMENTS_PUBLIC_KEY
  // / NOWPAYMENTS_IPN_SECRET before running this script. The exposed
  // keys should be rotated from the NOWPayments dashboard regardless.
  if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_PUBLIC_KEY) {
    console.error('Missing NOWPAYMENTS_API_KEY / NOWPAYMENTS_PUBLIC_KEY in environment — aborting');
    process.exit(1);
  }
  // 3. Add env vars to .env.local on server (append if not present)
  const envContent = [
    `NOWPAYMENTS_API_KEY=${process.env.NOWPAYMENTS_API_KEY}`,
    `NOWPAYMENTS_PUBLIC_KEY=${process.env.NOWPAYMENTS_PUBLIC_KEY}`,
    process.env.NOWPAYMENTS_IPN_SECRET
      ? `NOWPAYMENTS_IPN_SECRET=${process.env.NOWPAYMENTS_IPN_SECRET}`
      : '# NOWPAYMENTS_IPN_SECRET=replace_with_your_ipn_secret',
  ].join('\n');

  await runCmd(`cat >> ${ROOT}/.env.local << 'ENVEOF'\n${envContent}\nENVEOF`);
  console.log('✓ Env vars appended to .env.local');

  // 4. Check .env.local
  await runCmd(`grep -i now ${ROOT}/.env.local || echo '(no matches)'`);

  // 5. Rebuild and restart
  console.log('\n🔨 Building...');
  await runCmd(`cd ${ROOT} && npm run build 2>&1 | tail -20`);
  await runCmd(`pm2 restart centrio-web 2>&1`);

  console.log('\n✅ Done! Crypto payment API is live.');
  await sftp.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
