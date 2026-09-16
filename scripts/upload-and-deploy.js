require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const path = require('path')

const config = {
    host: process.env.UPLOAD_HOST || '31.128.44.165',
    port: Number(process.env.UPLOAD_PORT || 22),
    username: process.env.UPLOAD_USER || 'root',
    password: process.env.UPLOAD_PASSWORD,
    readyTimeout: 30000
}

// BUGFIX (2026-09-16, "внимательно все ссылки поменяй... тоже все добавь
// туда, в скрипт этот" — live user request): this script targeted
// /var/www/centrio-web, which stopped being the live site at some earlier
// deploy — nginx has proxied centrio.me to the dated release folder
// /var/www/centrio-web-releases/20260913-01 (pm2 process centrio-web-v3)
// for a while now (confirmed via nginx config + pm2 exec cwd). Every path
// below pointed at a directory nothing actually serves; running this
// script silently deployed nothing. NOTE: this folder name is a snapshot,
// not a stable alias — there's no "current" symlink on the server, so
// when the next dated release folder rotates in, this constant needs
// updating by hand (grep this file for RELEASE_ROOT).
//
// The pre-existing 14 landing-page mappings below (layout/page/pricing/
// faq/privacy/terms/etc.) only had their path PREFIX fixed — their
// individual local↔remote correctness wasn't re-audited file by file
// (out of scope for this pass); the 18 blog entries after them (17 new
// articles + the blog index) are newly added and were verified against
// the real site's current EditorialArticle/EditorialIndex format earlier
// this session.
const RELEASE_ROOT = '/var/www/centrio-web-releases/20260913-01'
const PM2_PROCESS = 'centrio-web-v3'

const uploads = [
    {
        local: path.join(__dirname, '../landing/utils.ts'),
        remote: `${RELEASE_ROOT}/src/lib/utils.ts`
    },
    {
        local: path.join(__dirname, '../landing/multi-type-ripple-buttons.tsx'),
        remote: `${RELEASE_ROOT}/src/components/ui/multi-type-ripple-buttons.tsx`
    },
    {
        local: path.join(__dirname, '../landing/animated-glassy-pricing.tsx'),
        remote: `${RELEASE_ROOT}/src/components/ui/animated-glassy-pricing.tsx`
    },
    {
        local: path.join(__dirname, '../landing/hover-footer.tsx'),
        remote: `${RELEASE_ROOT}/src/components/ui/hover-footer.tsx`
    },
    {
        local: path.join(__dirname, '../landing/layout.tsx'),
        remote: `${RELEASE_ROOT}/src/app/layout.tsx`
    },
    {
        local: path.join(__dirname, '../landing/page.tsx'),
        remote: `${RELEASE_ROOT}/src/app/page.tsx`
    },
    {
        local: path.join(__dirname, '../landing/site-shell.tsx'),
        remote: `${RELEASE_ROOT}/src/components/ui/site-shell.tsx`
    },
    {
        local: path.join(__dirname, '../landing/download.tsx'),
        remote: `${RELEASE_ROOT}/src/app/download/page.tsx`
    },
    {
        // Colocated import for download.tsx's `./changelog-data` — same
        // local file uploaded to both this path and the pricing/ one below,
        // since Next.js relative imports resolve per-directory on the server.
        local: path.join(__dirname, '../landing/changelog-data.ts'),
        remote: `${RELEASE_ROOT}/src/app/download/changelog-data.ts`
    },
    {
        local: path.join(__dirname, '../landing/faq.tsx'),
        remote: `${RELEASE_ROOT}/src/app/faq/page.tsx`
    },
    {
        local: path.join(__dirname, '../landing/pricing.tsx'),
        remote: `${RELEASE_ROOT}/src/app/pricing/page.tsx`
    },
    {
        // Colocated import for pricing.tsx's `./changelog-data` — see note above.
        local: path.join(__dirname, '../landing/changelog-data.ts'),
        remote: `${RELEASE_ROOT}/src/app/pricing/changelog-data.ts`
    },
    {
        local: path.join(__dirname, '../landing/privacy.tsx'),
        remote: `${RELEASE_ROOT}/src/app/privacy/page.tsx`
    },
    {
        local: path.join(__dirname, '../landing/terms.tsx'),
        remote: `${RELEASE_ROOT}/src/app/terms/page.tsx`
    },
    // ── Blog: index + the 17 articles published 2026-09-15/16 ──────────
    {
        local: path.join(__dirname, '../landing/blog/page.tsx'),
        remote: `${RELEASE_ROOT}/src/app/blog/page.tsx`
    },
    ...[
        'what-is-messenger-aggregator', 'best-aggregator-windows', 'workspaces-folders-guide',
        'split-screen-guide', 'adblock-guide', 'chat-widget-guide', 'dark-mode-messengers',
        'notifications-guide', 'freelancer-aggregator', 'smm-manager-guide', 'what-is-max',
        'session-isolation-explained', 'transfer-to-new-computer', 'free-vs-pro',
        'add-custom-service', 'small-business-messengers', 'russian-services-one-place'
    ].map(slug => ({
        local: path.join(__dirname, `../landing/blog/${slug}/page.tsx`),
        remote: `${RELEASE_ROOT}/src/app/blog/${slug}/page.tsx`
    }))
]

console.log(`Connecting to ${config.host}:${config.port}...`)

const sftp = new SftpClient()

sftp.connect(config).then(async () => {
    console.log('SFTP connected.')

    for (const { local, remote } of uploads) {
        console.log(`Uploading ${local} → ${remote}`)
        await sftp.mkdir(path.posix.dirname(remote), true).catch(() => {})
        await sftp.put(local, remote)
        console.log(`  ✓ Uploaded`)
    }

    console.log('\nRunning build...')
    const cmd = `cd ${RELEASE_ROOT} && npm run build 2>&1 | tail -20 && pm2 restart ${PM2_PROCESS} && echo "=== DEPLOY OK ==="`

    return new Promise((resolve, reject) => {
        sftp.client.exec(cmd, (err, stream) => {
            if (err) return reject(err)
            stream.on('data', d => process.stdout.write(d.toString()))
            stream.stderr.on('data', d => process.stderr.write(d.toString()))
            stream.on('close', code => resolve(code))
        })
    })
}).then(async (code) => {
    console.log(`\nDone. Exit code: ${code}`)
    await sftp.end()
    process.exit(code || 0)
}).catch(async (err) => {
    console.error('Error:', err.message)
    try { await sftp.end() } catch (_) {}
    process.exit(1)
})
