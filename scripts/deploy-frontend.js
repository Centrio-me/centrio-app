// Frontend (centrio-web / landing site) deploy script — key-based auth via
// ssh2, mirroring scripts/deploy-backend.js.
//
// Supersedes scripts/deploy-landing-redesign.js, which had two real bugs
// found during the 2026-07-29 version-consistency fix:
//   1. It only uploaded page.tsx — download/page.tsx, lib/i18n.ts, and
//      components/SiteFooter.tsx (all of which also need to change on a
//      real release) were never covered by it.
//   2. It restarted with plain `pm2 restart centrio-web` as root. On this
//      server every app process (including centrio-web) runs under the
//      `webapps` system user in its own pm2 daemon — root's own `pm2 list`
//      is a completely separate, empty instance. That command would have
//      either silently no-op'd or spawned a stray root-owned duplicate
//      process, never touching the real running site.
// Kept deploy-landing-redesign.js as a historical record with a
// deprecation notice rather than deleting it.
//
// Usage:
//   UPLOAD_SSH_KEY_PATH=/path/to/private_key node scripts/deploy-frontend.js
//
// Falls back to ~/.ssh/centrio_deploy if UPLOAD_SSH_KEY_PATH is unset (same
// convention as deploy-backend.js).
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

const REMOTE_BASE = '/var/www/centrio-web'

// File → remote path mapping confirmed live 2026-07-29 (`find /var/www/centrio-web/src`).
//
// 2026-07-29 version-consistency fix round 2: a wider grep across the whole
// live src/ tree (not just the 4 files below) turned up "1.6.6" hardcoded in
// 8 more files — including two literal broken download links
// (Centrio%20Setup%201.6.6.exe returns 404; the real file on disk is
// 1.7.9.exe) on SiteHeader (every page) and the /features and /blog/top-apps
// CTAs. All were previously live-only, never tracked in this repo.
const UPLOADS = [
    { local: path.join(__dirname, '..', 'landing', 'page.tsx'),            remote: `${REMOTE_BASE}/src/app/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'download.tsx'),        remote: `${REMOTE_BASE}/src/app/download/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'i18n.ts'),             remote: `${REMOTE_BASE}/src/lib/i18n.ts` },
    // Was never covered by this script — page.tsx imports GlassPricingSection
    // from here, but the file only ever existed live on the server (never
    // synced), so local edits to it silently never reached production.
    // Found 2026-08-14 while redesigning the pricing section's off-brand
    // cyan/glassmorphic styling.
    { local: path.join(__dirname, '..', 'landing', 'animated-glassy-pricing.tsx'), remote: `${REMOTE_BASE}/src/components/ui/animated-glassy-pricing.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'SiteFooter.tsx'),      remote: `${REMOTE_BASE}/src/components/SiteFooter.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'SiteHeader.tsx'),      remote: `${REMOTE_BASE}/src/components/SiteHeader.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'SeoFooter.tsx'),       remote: `${REMOTE_BASE}/src/components/SeoFooter.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'features.tsx'),        remote: `${REMOTE_BASE}/src/app/features/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'download-layout.tsx'), remote: `${REMOTE_BASE}/src/app/download/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-rambox.tsx'),  remote: `${REMOTE_BASE}/src/app/blog/vs-rambox/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-franz.tsx'),   remote: `${REMOTE_BASE}/src/app/blog/vs-franz/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-wavebox.tsx'), remote: `${REMOTE_BASE}/src/app/blog/vs-wavebox/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-top-apps.tsx'),   remote: `${REMOTE_BASE}/src/app/blog/top-apps/page.tsx` },
    // Added for the v1.9.0 version-string sweep — confirmed live on the
    // server (`test -f`) before being added here, same as the entries above.
    { local: path.join(__dirname, '..', 'landing', 'layout.tsx'),         remote: `${REMOTE_BASE}/src/app/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-ferdium.tsx'),               remote: `${REMOTE_BASE}/src/app/blog/vs-ferdium/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-who-needs-it.tsx'),             remote: `${REMOTE_BASE}/src/app/blog/who-needs-it/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-is-it-safe.tsx'),               remote: `${REMOTE_BASE}/src/app/blog/is-it-safe/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-stop-switching-tabs.tsx'),      remote: `${REMOTE_BASE}/src/app/blog/stop-switching-tabs/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-messenger-vpn-guide.tsx'),      remote: `${REMOTE_BASE}/src/app/blog/messenger-vpn-guide/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-remote-team-messengers.tsx'),   remote: `${REMOTE_BASE}/src/app/blog/remote-team-messengers/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-how-to-combine-messengers.tsx'), remote: `${REMOTE_BASE}/src/app/blog/how-to-combine-messengers/page.tsx` },
    // Real YooKassa card-binding flow (replaces the fake mockup built only
    // for YooKassa's recurring-payments approval screenshots) — confirmed
    // live path via `test -f` before adding, same as the entries above.
    { local: path.join(__dirname, '..', 'landing', 'dashboard-server.tsx'), remote: `${REMOTE_BASE}/src/app/dashboard/page.tsx` },
    // Confirmed live via `test -f` before adding, same as the entries above.
    { local: path.join(__dirname, '..', 'landing', 'admin-server.tsx'),     remote: `${REMOTE_BASE}/src/app/admin/page.tsx` },
    // Корпоративная версия (TEAM) — Phase 1 self-service console. Following
    // the same "-server.tsx is the only live file, no stale non-suffixed
    // twin" convention as dashboard-server.tsx/admin-server.tsx above
    // (see dashboard.tsx / admin-page.tsx for the stale twins that convention
    // is deliberately avoiding here — those are NOT deployed by any script).
    { local: path.join(__dirname, '..', 'landing', 'team-server.tsx'),        remote: `${REMOTE_BASE}/src/app/team/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'team-invite-server.tsx'), remote: `${REMOTE_BASE}/src/app/team/invite/page.tsx` },
    // authStore.ts's OrgSummary shape addition — was never in this script's
    // UPLOADS at all (confirmed live path via `find` before adding), same
    // silent-drift bug class as every other "confirmed live via find, never
    // in UPLOADS" entry above. Without this, team-server.tsx/team-invite-
    // server.tsx/dashboard-server.tsx would all import a stale User type
    // with no orgSummary field.
    { local: path.join(__dirname, '..', 'landing', 'authStore.ts'),          remote: `${REMOTE_BASE}/src/store/authStore.ts` },
    // Added for the v2.0.0 changelog widget — pricing.tsx was previously only
    // covered by scripts/upload-and-deploy.js, not this script. changelog-data.ts
    // is uploaded twice (colocated) because Next.js relative imports (`./changelog-data`)
    // resolve per-directory on the server; both pricing/page.tsx and download/page.tsx import it.
    { local: path.join(__dirname, '..', 'landing', 'pricing.tsx'),          remote: `${REMOTE_BASE}/src/app/pricing/page.tsx` },
    // Was missing entirely — /faq/page.tsx had never been covered by any
    // deploy script, so the 2026-08-13 mobile-responsiveness edit to
    // faq.tsx never reached production despite the deploy run "succeeding"
    // (it just silently rebuilt without this file's changes).
    { local: path.join(__dirname, '..', 'landing', 'faq.tsx'),              remote: `${REMOTE_BASE}/src/app/faq/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'changelog-data.ts'),    remote: `${REMOTE_BASE}/src/app/pricing/changelog-data.ts` },
    { local: path.join(__dirname, '..', 'landing', 'changelog-data.ts'),    remote: `${REMOTE_BASE}/src/app/download/changelog-data.ts` },
    // 2026-08-13 SEO batch: branded 404 (was previously untracked — the live
    // site had no src/app/not-found.tsx at all, so unmatched URLs fell back
    // to Next.js's default unbranded English 404) + 4 new blog articles +
    // the blog index and sitemap files that list them. blog-index.tsx and
    // sitemap.ts were confirmed live at these paths via `test -f` but were
    // never covered by any deploy script before this — every prior edit to
    // them must have been applied by hand over SSH.
    { local: path.join(__dirname, '..', 'landing', 'not-found.tsx'),        remote: `${REMOTE_BASE}/src/app/not-found.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-index.tsx'),       remote: `${REMOTE_BASE}/src/app/blog/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'sitemap.ts'),           remote: `${REMOTE_BASE}/src/app/sitemap.ts` },
    // robots.ts — replaces public/robots.txt, which was uploaded by hand
    // and never lived in git. Same directory as sitemap.ts, so no mkdir
    // needed; Next.js serves it at /robots.txt.
    { local: path.join(__dirname, '..', 'landing', 'robots.ts'),            remote: `${REMOTE_BASE}/src/app/robots.ts` },
    { local: path.join(__dirname, '..', 'landing', 'blog-multiple-accounts.tsx'),       remote: `${REMOTE_BASE}/src/app/blog/multiple-accounts/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-telegram-vpn-block.tsx'),      remote: `${REMOTE_BASE}/src/app/blog/telegram-vpn-block/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-best-aggregators.tsx'),        remote: `${REMOTE_BASE}/src/app/blog/best-messenger-aggregators/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-social-media-one-place.tsx'),  remote: `${REMOTE_BASE}/src/app/blog/all-social-media-one-place/page.tsx` },
    // 2026-08-13: found while investigating a live 404 on referral links —
    // register.tsx (the /auth/register page, confirmed live via `find`)
    // existed on the server but was never covered by any deploy script,
    // meaning it could only ever be updated by hand over SSH. Adding it here
    // so the dashboard-server.tsx referral-link fix (same commit) actually
    // reaches this file's directory too, and so it doesn't silently drift
    // again in the future.
    { local: path.join(__dirname, '..', 'landing', 'register.tsx'),       remote: `${REMOTE_BASE}/src/app/auth/register/page.tsx` },
    // 2026-08-13 SEO audit: these 7 *-layout.tsx files hold per-page
    // metadata (title/description/canonical) for client-component pages
    // that can't export metadata themselves (faq.tsx, pricing.tsx,
    // terms.tsx, refund.tsx, blog-vs-{rambox,franz,wavebox}.tsx are all
    // 'use client'). None were ever in this script's UPLOADS — only old
    // one-off scripts (deploy-seo-and-ui.js, deploy-blog-pages.js,
    // deploy-refund.js) ever uploaded them. Confirmed all 7 live via
    // `test -e` before adding (all present, all currently in sync — this is
    // a latent-risk fix, not a live-bug fix: nothing is broken today, but
    // the *next* edit to any of these files would silently fail to deploy
    // via this script, same bug class as faq.tsx/register.tsx before it.
    { local: path.join(__dirname, '..', 'landing', 'faq-layout.tsx'),            remote: `${REMOTE_BASE}/src/app/faq/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'pricing-layout.tsx'),        remote: `${REMOTE_BASE}/src/app/pricing/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'terms-layout.tsx'),          remote: `${REMOTE_BASE}/src/app/terms/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'refund-layout.tsx'),         remote: `${REMOTE_BASE}/src/app/refund/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-rambox-layout.tsx'), remote: `${REMOTE_BASE}/src/app/blog/vs-rambox/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-franz-layout.tsx'),  remote: `${REMOTE_BASE}/src/app/blog/vs-franz/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-wavebox-layout.tsx'), remote: `${REMOTE_BASE}/src/app/blog/vs-wavebox/layout.tsx` },
    // 2026-08-13 SEO batch: dynamic 1200x630 OG banner route (see
    // og-image-route.tsx for details). New route, doesn't exist live yet —
    // deploy-frontend.js's `mkdir -p` step below needs the parent dir too.
    { local: path.join(__dirname, '..', 'landing', 'og-image-route.tsx'),  remote: `${REMOTE_BASE}/src/app/api/og/route.tsx` },
    // IndexNow key-verification file — must be served at exactly
    // /d551cf74fb5d05ca3e40986dd9a78353.txt. Folder name IS the key value
    // (see indexnow-key-route.ts). Paired with scripts/indexnow-submit.js.
    { local: path.join(__dirname, '..', 'landing', 'indexnow-key-route.ts'), remote: `${REMOTE_BASE}/src/app/d551cf74fb5d05ca3e40986dd9a78353.txt/route.ts` },
    // 2026-08-13 SEO batch: DEFAULT_OG_IMAGE fallback, imported by 25 pages
    // (blog posts, pricing, faq, features, download) for their own openGraph
    // metadata — was never in this script's UPLOADS at all (confirmed live
    // path via `find` before adding), same silent-drift bug class as
    // faq.tsx/register.tsx/the 7 *-layout.tsx files above. Without this
    // entry, today's fix swapping the 176x176 /logo.png fallback for the
    // dynamic 1200x630 /api/og banner would never have reached production.
    { local: path.join(__dirname, '..', 'landing', 'seo.ts'),               remote: `${REMOTE_BASE}/src/lib/seo.ts` },
    // 2026-08-13 SEO batch: new article targeting the MAX-transition keyword
    // cluster (keyword-strategist agent's #1 priority — high, currently
    // rising RU demand, underserved software-solution angle). Also updates
    // faq.tsx (FAQPage schema) and blog-index.tsx/sitemap.ts, both already
    // covered by their own UPLOADS entries above. NOTE: landing/lib/
    // blog-articles.js (the admin-news-tab mirror of this same list) was
    // also updated but deploys separately via scripts/deploy-backend.js,
    // not this script — see that file's UPLOADS.
    { local: path.join(__dirname, '..', 'landing', 'blog-max-transition.tsx'), remote: `${REMOTE_BASE}/src/app/blog/max-transition/page.tsx` },
    // 2026-08-13: new article on account-ban risk (WhatsApp/Telegram) —
    // addresses a real user concern search query, positions Centrio as a
    // safe official-webview wrapper vs. modified/unofficial clients.
    { local: path.join(__dirname, '..', 'landing', 'blog-whatsapp-telegram-ban-risk.tsx'), remote: `${REMOTE_BASE}/src/app/blog/whatsapp-telegram-ban-risk/page.tsx` },
    // 2026-08-13: vs-station (captures "Station alternative" traffic — Station
    // was discontinued by its developer in 2023) and vs-shift (rounds out
    // comparison coverage for the remaining aggregator from best-messenger-aggregators.tsx).
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-station.tsx'), remote: `${REMOTE_BASE}/src/app/blog/vs-station/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'blog-vs-shift.tsx'),   remote: `${REMOTE_BASE}/src/app/blog/vs-shift/page.tsx` },
    // 2026-08-17: restoring crypto (NOWPayments) checkout — these two API
    // routes and their shared rate-limit helper were written earlier but
    // never made it into this script's UPLOADS, so they never actually
    // reached the server (confirmed via `find` — neither route existed
    // live). New routes, so the mkdir -p step below needs their parent
    // dirs too, same as og/route.tsx above.
    { local: path.join(__dirname, '..', 'landing', 'api', 'create-crypto-payment', 'route.ts'), remote: `${REMOTE_BASE}/src/app/api/create-crypto-payment/route.ts` },
    { local: path.join(__dirname, '..', 'landing', 'api', 'crypto-webhook', 'route.ts'),         remote: `${REMOTE_BASE}/src/app/api/crypto-webhook/route.ts` },
    { local: path.join(__dirname, '..', 'landing', 'lib', 'rateLimit.ts'),                        remote: `${REMOTE_BASE}/src/lib/rateLimit.ts` },
    // 2026-08-17: site-nav.ts (COMPARE_LINKS/MAIN_NAV single-source-of-truth
    // file) was never in this script's UPLOADS at all — confirmed via a
    // failed build ("Export LOCALIZED_ROUTES doesn't exist") that the live
    // copy was a stale original never touched since it was first created.
    // Same silent-drift bug class as every other "confirmed live via find,
    // never in UPLOADS" entry above.
    { local: path.join(__dirname, '..', 'landing', 'site-nav.ts'), remote: `${REMOTE_BASE}/src/lib/site-nav.ts` },
    // 2026-08-17: multi-language SEO Phase 1 — real crawlable /en /zh /fr /it
    // routes for the homepage (previously all 5 languages rendered at the
    // same URL via client-side-only ?lang state, so Google only ever
    // indexed Russian). New routes, need mkdir -p below. layout.tsx and
    // sitemap.ts already covered by their own UPLOADS entries above, also
    // touched by this change (hreflang + locale sitemap entries).
    { local: path.join(__dirname, '..', 'landing', 'home-en.tsx'),        remote: `${REMOTE_BASE}/src/app/en/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-en-layout.tsx'), remote: `${REMOTE_BASE}/src/app/en/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-zh.tsx'),        remote: `${REMOTE_BASE}/src/app/zh/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-zh-layout.tsx'), remote: `${REMOTE_BASE}/src/app/zh/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-fr.tsx'),        remote: `${REMOTE_BASE}/src/app/fr/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-fr-layout.tsx'), remote: `${REMOTE_BASE}/src/app/fr/layout.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-it.tsx'),        remote: `${REMOTE_BASE}/src/app/it/page.tsx` },
    { local: path.join(__dirname, '..', 'landing', 'home-it-layout.tsx'), remote: `${REMOTE_BASE}/src/app/it/layout.tsx` },
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
        // og-image-route.tsx is a new route (api/og/) that has never existed
        // on the server before — sftp.fastPut fails if the remote directory
        // doesn't exist yet, unlike every other UPLOADS entry whose parent
        // dir was already there. mkdir -p is a no-op for every dir that
        // already exists, so this is safe to run unconditionally.
        // blog/max-transition/, blog/whatsapp-telegram-ban-risk/, blog/vs-station/
        // and blog/vs-shift/ are the same situation — brand new blog post routes.
        // team/ and team/invite/ are new routes too (Корпоративная версия
        // Phase 1) — neither directory exists live yet, same situation as
        // the other new-route dirs below.
        await exec(conn, `mkdir -p ${REMOTE_BASE}/src/app/api/og ${REMOTE_BASE}/src/app/d551cf74fb5d05ca3e40986dd9a78353.txt ${REMOTE_BASE}/src/app/blog/max-transition ${REMOTE_BASE}/src/app/blog/whatsapp-telegram-ban-risk ${REMOTE_BASE}/src/app/blog/vs-station ${REMOTE_BASE}/src/app/blog/vs-shift ${REMOTE_BASE}/src/app/api/create-crypto-payment ${REMOTE_BASE}/src/app/api/crypto-webhook ${REMOTE_BASE}/src/app/en ${REMOTE_BASE}/src/app/zh ${REMOTE_BASE}/src/app/fr ${REMOTE_BASE}/src/app/it ${REMOTE_BASE}/src/app/team/invite`)

        const sftp = await new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp))
        })

        for (const { local, remote } of UPLOADS) {
            console.log(`Uploading ${path.basename(local)} → ${remote}`)
            await putFile(sftp, local, remote)
        }

        // fastPut over SFTP as root leaves files root-owned; the build step
        // below runs as `webapps` and needs read access, and everything else
        // under REMOTE_BASE is webapps:webapps — restore that ownership.
        console.log('\nFixing ownership of uploaded files (root → webapps)...')
        const chownList = UPLOADS.map(u => u.remote).join(' ')
        await exec(conn, `chown webapps:webapps ${chownList}`)

        console.log('\nBuilding Next.js (this takes ~2-3 min)...')
        const { code: buildCode } = await exec(conn,
            `cd ${REMOTE_BASE} && sudo -u webapps NODE_OPTIONS="--max-old-space-size=1024" npm run build`
        )
        if (buildCode !== 0) {
            throw new Error('Build failed — NOT restarting the service. Fix and redeploy.')
        }

        console.log('\nRestarting centrio-web (as webapps user, with --update-env)...')
        await exec(conn, 'sudo -u webapps pm2 restart centrio-web --update-env')

        // The health check below runs curl against the just-restarted process.
        // Without this pause it reliably races the port bind and reports a
        // false-negative HTTP 000 — hit twice during manual testing on
        // 2026-07-29 before adding this.
        await new Promise(resolve => setTimeout(resolve, 3000))

        console.log('\nHealth check...')
        await exec(conn, "curl -s -o /dev/null -w 'site: HTTP %{http_code}\\n' http://localhost:3000/")
        await exec(conn, "sleep 2 && curl -s -o /dev/null -w 'download page: HTTP %{http_code}\\n' http://localhost:3000/download")

        console.log('\n✅ Frontend deploy done.')
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
