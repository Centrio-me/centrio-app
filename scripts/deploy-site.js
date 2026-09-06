/**
 * deploy-site.js <version>
 *
 * Updates all version references in landing files, uploads to server,
 * rebuilds Next.js and restarts pm2.
 *
 * Usage:
 *   node scripts/deploy-site.js 1.6.95
 *   node scripts/deploy-site.js          ← auto-reads version from package.json
 */

const SftpClient = require('ssh2-sftp-client')
const fs         = require('fs')
const path       = require('path')

// ── Config ────────────────────────────────────────────────────────────────
const SFTP_CONFIG = {
    host:        '31.128.44.165',
    port:        22,
    username:    'root',
    privateKey:  require('fs').readFileSync(require('path').join(require('os').homedir(), '.ssh', 'id_ed25519_cliqly')),
    readyTimeout: 60000,
    retries:      3,
    retry_factor: 2,
    retry_minTimeout: 2000
}

const ROOT           = path.join(__dirname, '..')
const DOWNLOAD_TSX   = path.join(ROOT, 'landing', 'download.tsx')
const I18N_TS        = path.join(ROOT, 'landing', 'i18n.ts')
const SITE_SHELL_TSX = path.join(ROOT, 'landing', 'site-shell.tsx')

// Remote paths
const REMOTE_DOWNLOAD   = '/var/www/centrio-web/src/app/download/page.tsx'
const REMOTE_I18N       = '/var/www/centrio-web/src/lib/i18n.ts'
const REMOTE_SITE_SHELL = '/var/www/centrio-web/src/components/ui/site-shell.tsx'
const REMOTE_WEB        = '/var/www/centrio-web'

// 2026-08-26: audit found 24 more files hardcoding the version/download-link
// as a bare literal (e.g. `const WIN_DOWNLOAD = '...Setup%202.1.0.exe'`),
// none of which this script touched — every release since they were added
// (blog pages didn't exist yet when this script was first written) shipped
// with a stale version number on all of them. Every file below was
// hand-verified this session to contain semver-triplet numbers ONLY as a
// "current app version" reference (no unrelated third-party version
// strings) — see Obsidian Centrio/Деплой.md for the audit note. If a new
// file is added later that mentions the version, add it here too, or the
// same drift bug (already documented once in SiteFooter.tsx's own comment)
// will just happen again.
const VERSION_LITERAL_FILES = [
    // [local landing/ filename, remote path(s)]
    ['SiteHeader.tsx',                        ['/var/www/centrio-web/src/components/SiteHeader.tsx']],
    ['SiteFooter.tsx',                        ['/var/www/centrio-web/src/components/SiteFooter.tsx']],
    ['SeoFooter.tsx',                         ['/var/www/centrio-web/src/components/SeoFooter.tsx']],
    ['features.tsx',                          ['/var/www/centrio-web/src/app/features/page.tsx']],
    ['download-layout.tsx',                   ['/var/www/centrio-web/src/app/download/layout.tsx']],
    ['layout.tsx',                            ['/var/www/centrio-web/src/app/layout.tsx']],
    ['page.tsx',                              ['/var/www/centrio-web/src/app/page.tsx']],
    ['blog-best-aggregators.tsx',              ['/var/www/centrio-web/src/app/blog/best-messenger-aggregators/page.tsx']],
    ['blog-how-to-combine-messengers.tsx',     ['/var/www/centrio-web/src/app/blog/how-to-combine-messengers/page.tsx']],
    ['blog-is-it-safe.tsx',                    ['/var/www/centrio-web/src/app/blog/is-it-safe/page.tsx']],
    ['blog-max-transition.tsx',                ['/var/www/centrio-web/src/app/blog/max-transition/page.tsx']],
    ['blog-messenger-vpn-guide.tsx',           ['/var/www/centrio-web/src/app/blog/messenger-vpn-guide/page.tsx']],
    ['blog-multiple-accounts.tsx',             ['/var/www/centrio-web/src/app/blog/multiple-accounts/page.tsx']],
    ['blog-remote-team-messengers.tsx',        ['/var/www/centrio-web/src/app/blog/remote-team-messengers/page.tsx']],
    ['blog-social-media-one-place.tsx',        ['/var/www/centrio-web/src/app/blog/all-social-media-one-place/page.tsx']],
    ['blog-stop-switching-tabs.tsx',           ['/var/www/centrio-web/src/app/blog/stop-switching-tabs/page.tsx']],
    ['blog-telegram-vpn-block.tsx',            ['/var/www/centrio-web/src/app/blog/telegram-vpn-block/page.tsx']],
    ['blog-top-apps.tsx',                      ['/var/www/centrio-web/src/app/blog/top-apps/page.tsx']],
    ['blog-vs-ferdium.tsx',                    ['/var/www/centrio-web/src/app/blog/vs-ferdium/page.tsx']],
    ['blog-vs-franz.tsx',                      ['/var/www/centrio-web/src/app/blog/vs-franz/page.tsx']],
    ['blog-vs-rambox.tsx',                     ['/var/www/centrio-web/src/app/blog/vs-rambox/page.tsx']],
    ['blog-vs-shift.tsx',                      ['/var/www/centrio-web/src/app/blog/vs-shift/page.tsx']],
    ['blog-vs-station.tsx',                    ['/var/www/centrio-web/src/app/blog/vs-station/page.tsx']],
    ['blog-vs-wavebox.tsx',                    ['/var/www/centrio-web/src/app/blog/vs-wavebox/page.tsx']],
    ['blog-whatsapp-telegram-ban-risk.tsx',    ['/var/www/centrio-web/src/app/blog/whatsapp-telegram-ban-risk/page.tsx']],
    ['blog-who-needs-it.tsx',                  ['/var/www/centrio-web/src/app/blog/who-needs-it/page.tsx']],
]

// changelog-data.ts is NOT a simple literal — it's a historical array
// (source of truth is CHANGELOG.md, regenerated via scripts/gen-changelog-data.js).
// This script only uploads whatever's already committed in landing/changelog-data.ts
// as-is; adding the new version's entry is a separate, deliberate step
// (run gen-changelog-data.js, merge the new entries in by hand at the top
// of the array — don't overwrite older history).
const CHANGELOG_DATA_TS = path.join(ROOT, 'landing', 'changelog-data.ts')
const CHANGELOG_DATA_REMOTES = [
    '/var/www/centrio-web/src/app/download/changelog-data.ts',
    '/var/www/centrio-web/src/app/pricing/changelog-data.ts',
]

// ── Helpers ───────────────────────────────────────────────────────────────
function readFile(p)           { return fs.readFileSync(p, 'utf8') }
function writeFile(p, content) { fs.writeFileSync(p, content, 'utf8') }

function getVersion() {
    const arg = process.argv[2]
    if (arg && /^\d+\.\d+\.\d+$/.test(arg)) return arg
    const pkg = JSON.parse(readFile(path.join(ROOT, 'package.json')))
    return pkg.version
}

function updateDownloadTsx(version) {
    let content = readFile(DOWNLOAD_TSX)
    const before = content.match(/const VERSION = '([^']+)'/)?.[1]
    content = content.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`)
    writeFile(DOWNLOAD_TSX, content)
    console.log(`  ✓ download.tsx: ${before} → ${version}`)
    return before
}

function updateI18n(version) {
    let content = readFile(I18N_TS)

    // Update dl_win_sub in all 5 locales
    const winMatches = (content.match(/dl_win_sub:\s*'[^']+'/g) || []).length
    content = content.replace(
        /dl_win_sub:\s*'v[\d.]+ · Windows 10\/11'/g,
        `dl_win_sub: 'v${version} · Windows 10/11'`
    )

    // Update dl_hero_date in all 5 locales
    const MONTHS = {
        ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
        en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        fr: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
        it: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
    }
    const now  = new Date()
    const m    = now.getMonth()
    const year = now.getFullYear()
    content = content.replace(/dl_hero_date:\s*'[^']*'/g, (match, offset) => {
        // Detect language by context (look backwards for lang key indicators)
        const before = content.slice(Math.max(0, offset - 3000), offset)
        if (before.lastIndexOf("it: {") > before.lastIndexOf("fr: {") &&
            before.lastIndexOf("it: {") > before.lastIndexOf("zh: {")) return `dl_hero_date: '${MONTHS.it[m]} ${year}'`
        if (before.lastIndexOf("fr: {") > before.lastIndexOf("zh: {")) return `dl_hero_date: '${MONTHS.fr[m]} ${year}'`
        if (before.lastIndexOf("zh: {") > before.lastIndexOf("en: {")) return `dl_hero_date: '${year}年${m+1}月'`
        if (before.lastIndexOf("en: {") > before.lastIndexOf("ru: {")) return `dl_hero_date: '${MONTHS.en[m]} ${year}'`
        return `dl_hero_date: '${MONTHS.ru[m]} ${year}'`
    })

    writeFile(I18N_TS, content)
    console.log(`  ✓ i18n.ts: updated dl_win_sub in ${winMatches} locales + dl_hero_date`)
}

// Replaces every literal occurrence of the OLD version string (e.g. "2.1.0")
// with the new version. Deliberately NOT a generic /\d+\.\d+\.\d+/ scan.
//
// 2026-08-26 bug (found + fixed same day): a blind digit-triplet regex is
// greedy and does not know where a version number actually starts — in a
// string like `Setup%202.1.0.exe` it happily matches "202.1.0" (swallowing
// the "20" that's actually part of the "%20" space-encoding right before the
// real version, since '%' isn't a digit either, so a not-preceded-by-digit
// lookbehind doesn't help). Replacing that whole match with "2.4.0" corrupted
// the URL into `Setup%2.4.0.exe`. The only reliable fix is to search for the
// EXACT previous version string (oldVersion, sourced from download.tsx's own
// anchored `const VERSION = '...'` match, the one place we know for certain)
// and replace just that literal substring — same technique as the manual
// `sed 's/2\.1\.0/2.4.0/g'` fix applied earlier the same day, which worked
// precisely because it searched for a known literal, not an open-ended
// digit pattern.
function updateVersionLiteralFile(filename, oldVersion, newVersion) {
    const localPath = path.join(ROOT, 'landing', filename)
    let content = readFile(localPath)
    const escaped = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const found = new RegExp(escaped, 'g').test(content)
    content = content.split(oldVersion).join(newVersion)
    writeFile(localPath, content)
    return found
}

async function runCommand(sftp, cmd) {
    return new Promise((resolve, reject) => {
        sftp.client.exec(cmd, (err, stream) => {
            if (err) return reject(err)
            let out = ''
            stream.on('data',        (d) => { out += d; process.stdout.write(d) })
            stream.stderr.on('data', (d) => { out += d; process.stderr.write(d) })
            stream.on('close', (code) => resolve({ code, out }))
        })
    })
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
    const version = getVersion()
    console.log(`\n🚀 Deploying centrio.me/download — v${version}\n`)

    // 1. Update local files
    console.log('📝 Updating local files...')
    const oldVersion = updateDownloadTsx(version)
    updateI18n(version)
    for (const [filename] of VERSION_LITERAL_FILES) {
        if (!oldVersion) {
            console.log(`  ⚠ ${filename}: skipped — could not detect old version from download.tsx`)
            continue
        }
        const found = updateVersionLiteralFile(filename, oldVersion, version)
        console.log(`  ✓ ${filename}: ${found ? oldVersion : '(no match found)'} → ${version}`)
    }

    // 2. Connect SFTP
    console.log('\n🔌 Connecting to server...')
    const sftp = new SftpClient()
    await sftp.connect(SFTP_CONFIG)

    // 3. Upload landing files
    console.log('📤 Uploading files...')
    await sftp.put(DOWNLOAD_TSX, REMOTE_DOWNLOAD)
    console.log(`  ✓ download.tsx → ${REMOTE_DOWNLOAD}`)
    await sftp.put(I18N_TS, REMOTE_I18N)
    console.log(`  ✓ i18n.ts → ${REMOTE_I18N}`)
    await sftp.put(SITE_SHELL_TSX, REMOTE_SITE_SHELL)
    console.log(`  ✓ site-shell.tsx → ${REMOTE_SITE_SHELL}`)

    for (const [filename, remotePaths] of VERSION_LITERAL_FILES) {
        const localPath = path.join(ROOT, 'landing', filename)
        for (const remotePath of remotePaths) {
            await sftp.put(localPath, remotePath)
        }
        console.log(`  ✓ ${filename} → ${remotePaths.join(', ')}`)
    }

    console.log(`  ↷ changelog-data.ts: uploading as-is (not auto-regenerated — see comment above)`)
    for (const remotePath of CHANGELOG_DATA_REMOTES) {
        await sftp.put(CHANGELOG_DATA_TS, remotePath)
    }
    console.log(`  ✓ changelog-data.ts → ${CHANGELOG_DATA_REMOTES.join(', ')}`)

    // 5. Clear Next.js cache & rebuild
    console.log('\n🗑  Clearing Next.js cache...')
    await runCommand(sftp, `rm -rf ${REMOTE_WEB}/.next && echo cleared`)

    console.log('🔨 Building...')
    await runCommand(sftp, `cd ${REMOTE_WEB} && npm run build 2>&1 | tail -20`)

    // 6. Restart pm2
    // 2026-08-26: `pm2 restart centrio-web` as root is a SILENT NO-OP — the
    // process is actually managed by a pm2 daemon running under the
    // `webapps` user (PM2_HOME=/home/webapps/.pm2), not root's own
    // /root/.pm2. Root's pm2 has zero processes registered at all (its own
    // dump.pm2 is `[]`). Discovered because the site kept serving a build
    // from before the rebuild despite this line reporting no error — pm2 as
    // root happily "succeeds" at restarting nothing. Always target the
    // webapps daemon explicitly.
    console.log('♻️  Restarting pm2 (webapps daemon)...')
    await runCommand(sftp, 'sudo -u webapps PM2_HOME=/home/webapps/.pm2 pm2 restart centrio-web 2>&1 | tail -5')

    await sftp.end()

    console.log(`\n✅ centrio.me/download updated to v${version}`)
    console.log(`   Win:   https://download.centrio.me/Centrio%20Setup%20${version}.exe`)
    console.log(`   Mac:   https://download.centrio.me/mac/Centrio-${version}.dmg`)
    console.log(`   Linux: https://download.centrio.me/linux/Centrio-${version}.AppImage`)
    console.log(`   deb:   https://download.centrio.me/linux/messengerapp_${version}_amd64.deb`)
}

main().catch(e => {
    console.error('\n❌ Deploy failed:', e.message)
    process.exit(1)
})
