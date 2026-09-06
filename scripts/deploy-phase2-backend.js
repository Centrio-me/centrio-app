require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const path = require('path')

// SUPERSEDED 2026-07-29: key-based SSH access was restored and this file's
// UPLOADS list (plus the Phase 3 list below) was folded into
// scripts/deploy-backend.js, which uses publickey auth via ssh2 directly
// instead of UPLOAD_PASSWORD. Use that script for real deploys. Kept here
// only as a historical record of the original Phase 2 file mapping.
//
// NOTE: as of 2026-07-18 this cannot actually be run — the server only
// accepts SSH publickey auth (password auth was disabled around the
// 2026-06-27 CI switch, see .github/workflows/build.yml + commit 3cbbdf2).
// UPLOAD_PASSWORD-based scripts are dead until someone with the deploy key
// runs this, or password auth is re-enabled. Kept here (not run) so the
// upload step exists and is correct once access is restored — see
// centrio-hardening.plan.md, Phase 2.
const config = {
    host: process.env.UPLOAD_HOST || '31.128.44.165',
    port: Number(process.env.UPLOAD_PORT || 22),
    username: process.env.UPLOAD_USER || 'root',
    password: process.env.UPLOAD_PASSWORD,
    readyTimeout: 30000
}

const sftp = new SftpClient()

function exec(cmd) {
    return new Promise((resolve, reject) => {
        let out = ''
        sftp.client.exec(cmd, (err, stream) => {
            if (err) return reject(err)
            stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()) })
            stream.stderr.on('data', d => { out += d.toString(); process.stderr.write(d.toString()) })
            stream.on('close', code => resolve({ out, code }))
        })
    })
}

const UPLOADS = [
    { local: path.join(__dirname, '..', 'landing', 'lib', 'email.js'),        remote: '/var/www/centrio-api/src/lib/email.js' },
    { local: path.join(__dirname, '..', 'landing', 'payments-server.js'),     remote: '/var/www/centrio-api/src/routes/payments.js' },
    { local: path.join(__dirname, '..', 'landing', 'user-route.js'),          remote: '/var/www/centrio-api/src/routes/user.js' },
    { local: path.join(__dirname, '..', 'landing', 'admin-routes.js'),        remote: '/var/www/centrio-api/src/routes/admin.js' },
    { local: path.join(__dirname, '..', 'landing', 'auto-renew-cron.js'),     remote: '/var/www/centrio-api/src/cron/autoRenew.js' },
]

sftp.connect(config).then(async () => {
    console.log('=== Connected ===\n')

    // 1. Make sure src/lib exists (new directory, not created by prior deploys)
    await exec('mkdir -p /var/www/centrio-api/src/lib')

    // 2. Upload all Phase 2 files
    for (const { local, remote } of UPLOADS) {
        console.log(`Uploading ${path.basename(local)} → ${remote}`)
        await sftp.put(local, remote)
    }

    // 3. Optionally set email provider credentials, if provided locally
    if (process.env.RESEND_API_KEY) {
        await exec(`grep -q "RESEND_API_KEY" /var/www/centrio-api/.env || echo '
RESEND_API_KEY=${process.env.RESEND_API_KEY}
EMAIL_FROM=${process.env.EMAIL_FROM || 'Centrio <noreply@centrio.me>'}' >> /var/www/centrio-api/.env`)
        console.log('✓ RESEND_API_KEY appended to .env')
    } else {
        console.log('⚠ RESEND_API_KEY not set locally — email sending will no-op on server until it is configured in /var/www/centrio-api/.env')
    }

    // 4. Restart API
    console.log('\nRestarting centrio-api...')
    await exec('pm2 restart centrio-api && sleep 1 && pm2 list | grep centrio-api')

    console.log('\n✅ Phase 2 backend deploy done.')
    await sftp.end()
    process.exit(0)
}).catch(async err => {
    console.error('\nError:', err.message)
    try { await sftp.end() } catch (_) {}
    process.exit(1)
})
