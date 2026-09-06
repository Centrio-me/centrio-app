require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const path = require('path')

// SUPERSEDED 2026-07-29: see scripts/deploy-backend.js (key-based auth,
// includes this file's visitors.js mapping — confirmed correct via live
// `ls`). Kept only as a historical record.
//
// NOTE: same blocker as scripts/deploy-phase2-backend.js — the server only
// accepts SSH publickey auth (password auth disabled ~2026-06-27, see commit
// 3cbbdf2 + .github/workflows/build.yml). No private key for this server
// exists locally, so this cannot actually be run this session. Kept here,
// correct and ready, for when access is restored — see
// centrio-hardening.plan.md, Phase 3.
//
// REMOTE PATH CAVEAT: unlike the Phase 2 files, this repo has no prior deploy
// script that ever recorded where landing/visitor-route.js lives on the
// server. The path below (`routes/visitors.js`) is inferred by following the
// exact naming convention Phase 2 confirmed for the other route files
// (user-route.js -> routes/user.js, admin-routes.js -> routes/admin.js,
// payments-server.js -> routes/payments.js). Whoever runs this with real
// access should double-check the actual filename (e.g. `ls
// /var/www/centrio-api/src/routes/`) before trusting this blindly.
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
    { local: path.join(__dirname, '..', 'landing', 'visitor-route.js'), remote: '/var/www/centrio-api/src/routes/visitors.js' }
]

sftp.connect(config).then(async () => {
    console.log('=== Connected ===\n')

    console.log('Before uploading, verify the real remote filename for the visitors route:')
    console.log('  ls /var/www/centrio-api/src/routes/ | grep -i visit')
    console.log('If it differs from "visitors.js", edit UPLOADS above before re-running.\n')

    for (const { local, remote } of UPLOADS) {
        console.log(`Uploading ${path.basename(local)} → ${remote}`)
        await sftp.put(local, remote)
    }

    console.log('\nRestarting centrio-api...')
    await exec('pm2 restart centrio-api && sleep 1 && pm2 list | grep centrio-api')

    console.log('\n✅ Phase 3 backend deploy done.')
    await sftp.end()
    process.exit(0)
}).catch(async err => {
    console.error('\nError:', err.message)
    try { await sftp.end() } catch (_) {}
    process.exit(1)
})
