// Consolidated backend deploy script — supersedes deploy-phase2-backend.js
// and deploy-phase3-backend.js, which were written for SFTP+password auth
// and could never actually run once the server moved to publickey-only SSH
// (~2026-06-27, see commit 3cbbdf2). This version uses key-based auth from
// the start.
//
// Usage:
//   UPLOAD_SSH_KEY_PATH=/path/to/private_key node scripts/deploy-backend.js
//
// If UPLOAD_SSH_KEY_PATH is not set, falls back to ~/.ssh/centrio_deploy
// (the conventional path — adjust if your key lives elsewhere). The
// matching public key must already be in the server's
// /root/.ssh/authorized_keys (or the relevant user's, if not deploying as
// root) — this script never sends a password.
//
// File → remote path mapping was reconstructed by diffing this repo's
// landing/*.js files against the live server on 2026-07-29 (see
// centrio-hardening.plan.md, Phase 1-3 deploy reconciliation). Confirmed via
// `ls /var/www/centrio-api/src/routes/` at that time — re-verify with the
// same command before trusting this blindly if a lot of time has passed.
require('dotenv').config()
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const os = require('os')

const HOST = process.env.UPLOAD_HOST || '31.128.44.165'
const PORT = Number(process.env.UPLOAD_PORT || 22)
const USER = process.env.UPLOAD_USER || 'root'
const KEY_PATH = process.env.UPLOAD_SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'centrio_deploy')

if (!fs.existsSync(KEY_PATH)) {
    console.error(`Private key not found at ${KEY_PATH}`)
    console.error('Set UPLOAD_SSH_KEY_PATH to the correct path, or generate one and install the .pub on the server first.')
    process.exit(1)
}

const REMOTE_BASE = '/var/www/centrio-api'

const UPLOADS = [
    { local: path.join(__dirname, '..', 'landing', 'lib', 'email.js'),           remote: `${REMOTE_BASE}/src/lib/email.js` },
    { local: path.join(__dirname, '..', 'landing', 'middleware', 'rateLimit.js'), remote: `${REMOTE_BASE}/src/middleware/rateLimit.js` },
    { local: path.join(__dirname, '..', 'landing', 'middleware', 'auth.js'),      remote: `${REMOTE_BASE}/src/middleware/auth.js` },
    { local: path.join(__dirname, '..', 'landing', 'admin-otp.js'),               remote: `${REMOTE_BASE}/src/utils/admin-otp.js` },
    { local: path.join(__dirname, '..', 'landing', 'payments-server.js'),        remote: `${REMOTE_BASE}/src/routes/payments.js` },
    { local: path.join(__dirname, '..', 'landing', 'auth-server.js'),            remote: `${REMOTE_BASE}/src/routes/auth.js` },
    { local: path.join(__dirname, '..', 'landing', 'user-route.js'),             remote: `${REMOTE_BASE}/src/routes/user.js` },
    { local: path.join(__dirname, '..', 'landing', 'admin-routes.js'),           remote: `${REMOTE_BASE}/src/routes/admin.js` },
    { local: path.join(__dirname, '..', 'landing', 'visitor-route.js'),          remote: `${REMOTE_BASE}/src/routes/visitors.js` },
    { local: path.join(__dirname, '..', 'landing', 'stats-route.js'),           remote: `${REMOTE_BASE}/src/routes/stats.js` },
    { local: path.join(__dirname, '..', 'landing', 'auto-renew-cron.js'),        remote: `${REMOTE_BASE}/src/cron/autoRenew.js` },
    // Confirmed live via `test -f` before adding, same as the entries above.
    { local: path.join(__dirname, '..', 'server-src', 'utils', 'tokens.js'),     remote: `${REMOTE_BASE}/src/utils/tokens.js` },
    // Added 2026-08-13 (Telegram tickets integration). tickets.js and
    // index.js existed live but were never wired into this deploy script —
    // confirmed byte-identical via diff before adding, so this backfill is
    // safe. From now on both are covered by the syntax-check + restart flow
    // below instead of relying on manual SSH edits.
    { local: path.join(__dirname, '..', 'landing', 'tickets-server.js'),         remote: `${REMOTE_BASE}/src/routes/tickets.js` },
    { local: path.join(__dirname, '..', 'landing', 'notes-route.js'),            remote: `${REMOTE_BASE}/src/routes/notes.js` },
    { local: path.join(__dirname, '..', 'landing', 'assistant-route.js'),        remote: `${REMOTE_BASE}/src/routes/assistant.js` },
    { local: path.join(__dirname, '..', 'landing', 'api-index-server.js'),       remote: `${REMOTE_BASE}/src/index.js` },
    { local: path.join(__dirname, '..', 'landing', 'telegram-webhook-route.js'), remote: `${REMOTE_BASE}/src/routes/telegram-webhook.js` },
    { local: path.join(__dirname, '..', 'landing', 'lib', 'telegram-bot.js'),    remote: `${REMOTE_BASE}/src/lib/telegram-bot.js` },
    // Added 2026-08-13 (news channel auto-posting). Static metadata mirror of
    // the POSTS array in landing/blog-index.tsx — see comment at the top of
    // blog-articles.js for why it's duplicated instead of imported.
    { local: path.join(__dirname, '..', 'landing', 'lib', 'blog-articles.js'),  remote: `${REMOTE_BASE}/src/lib/blog-articles.js` },
    // Корпоративная версия (TEAM) — Phase 1. Both new files — routes/org.js
    // and lib/org.js don't exist live yet (confirmed via `ls src/routes`
    // and `ls src/lib` on 2026-08-27). Requires the Organization/OrgMember/
    // OrgInvite/OrgAuditLog Prisma models to be pushed to the DB first (see
    // prisma/schema.prisma deploy step) — this script does NOT do that,
    // it must happen before running this script or centrio-api will crash
    // on first request touching these routes.
    { local: path.join(__dirname, '..', 'landing', 'lib', 'org.js'),      remote: `${REMOTE_BASE}/src/lib/org.js` },
    { local: path.join(__dirname, '..', 'landing', 'org-routes.js'),      remote: `${REMOTE_BASE}/src/routes/org.js` },
    // Онлайн-чат для сайта клиента (2026-09-11, Pro-фича). Both new files —
    // routes/chat-sites.js and routes/widget.js don't exist live yet.
    // Requires the ChatSite/ChatConversation/ChatMessage Prisma models to be
    // pushed to the DB first (this script does NOT do that).
    { local: path.join(__dirname, '..', 'landing', 'chat-sites-routes.js'), remote: `${REMOTE_BASE}/src/routes/chat-sites.js` },
    { local: path.join(__dirname, '..', 'landing', 'widget-routes.js'),     remote: `${REMOTE_BASE}/src/routes/widget.js` },
]

function exec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err)
            let out = ''
            stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()) })
            stream.stderr.on('data', d => { out += d.toString(); process.stderr.write(d.toString()) })
            stream.on('close', code => resolve({ out, code }))
        })
    })
}

function putFile(sftp, local, remote) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, err => err ? reject(err) : resolve())
    })
}

const conn = new Client()
conn.on('ready', async () => {
    console.log('=== Connected (publickey) ===\n')
    try {
        await exec(conn, `mkdir -p ${REMOTE_BASE}/src/lib ${REMOTE_BASE}/src/middleware`)

        const sftp = await new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp))
        })

        for (const { local, remote } of UPLOADS) {
            console.log(`Uploading ${path.basename(local)} → ${remote}`)
            await putFile(sftp, local, remote)
        }

        console.log('\nSyntax-checking deployed files...')
        const checkList = UPLOADS.map(u => u.remote).join(' ')
        const { code: checkCode } = await exec(conn, `cd ${REMOTE_BASE} && for f in ${checkList}; do node --check "$f" || exit 1; done && echo ALL_SYNTAX_OK`)
        if (checkCode !== 0) {
            throw new Error('Syntax check failed on one or more deployed files — NOT restarting the service. Fix and redeploy.')
        }

        console.log('\nRestarting centrio-api (as webapps user, with --update-env)...')
        await exec(conn, 'sudo -u webapps pm2 restart centrio-api --update-env')

        console.log('\nHealth check...')
        await exec(conn, "curl -s -o /dev/null -w 'plans: HTTP %{http_code}\\n' http://localhost:3001/api/payments/plans")

        console.log('\n✅ Backend deploy done.')
        conn.end()
        process.exit(0)
    } catch (err) {
        console.error('\nError:', err.message)
        conn.end()
        process.exit(1)
    }
}).on('error', err => {
    console.error('Connection error:', err.message)
    process.exit(1)
}).connect({
    host: HOST,
    port: PORT,
    username: USER,
    privateKey: fs.readFileSync(KEY_PATH),
    readyTimeout: 30000
})
