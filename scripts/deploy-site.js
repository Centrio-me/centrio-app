/**
 * deploy-site.js <version>
 *
 * Bumps the version everywhere it's hardcoded on the live centrio.me site,
 * regenerates and uploads the changelog, rebuilds Next.js and restarts pm2.
 *
 * Usage:
 *   node scripts/deploy-site.js 1.6.95
 *   node scripts/deploy-site.js          ← auto-reads version from package.json
 *
 * REWRITTEN (2026-09-30, live request: "почини скрипт" — after the v2.9.6
 * deploy silently missed the real site): this script used to upload local
 * `landing/*.tsx` copies over the live files. That broke on 2026-09-26 when
 * a separate redesign session switched nginx's proxy_pass to a NEW release
 * directory (`/var/www/centrio-web-releases/20260926-links02`, run under a
 * SEPARATE root-owned pm2 daemon on port 3009) without updating this
 * script — which kept deploying to the old `/var/www/centrio-web` (port
 * 3000, `webapps`-daemon pm2), a target nginx no longer proxies to at all.
 * Every run since then reported success (upload OK, build OK, pm2 restart
 * OK) while changing nothing a visitor could see — see Obsidian
 * Centrio/Деплой.md, "🔴 2026-09-30 (v2.9.6)" for the full incident.
 *
 * The live site's actual page/component files (`page.tsx`,
 * `components/centrio-<locale>/sections.tsx`, `content/translations/*.json`) have
 * ALSO diverged structurally from the `landing/` copies tracked in this
 * repo (different i18n architecture, `latest-release.json`, per-locale
 * route folders, ~60 blog pages vs. 26 here) — uploading `landing/*.tsx`
 * over them would silently regress the live redesign back to the old
 * structure. So this rewrite no longer uploads whole page files at all: it
 * edits the version-literal EXACTLY IN PLACE on the live server (same
 * "search for the known old-version substring, never a digit regex"
 * technique the 2026-08-26 fix already established — see
 * `bumpVersionRemote`'s comment), and only uploads `changelog-data.ts`,
 * which genuinely is a self-contained generated data file.
 *
 * If the live release directory changes again (another redesign, another
 * `-linksNN`/`-seoNN` folder), update LIVE_WEB_ROOT + PM2_PROCESS below —
 * and re-run `grep -rl 'OLD.VERSION.HERE' src/` on the server to rebuild
 * VERSION_LITERAL_REMOTE_FILES, since the file set is NOT the same as
 * `landing/`'s.
 */

const SftpClient    = require('ssh2-sftp-client')
const fs             = require('fs')
const path           = require('path')
const { execFileSync } = require('child_process')

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

const ROOT = path.join(__dirname, '..')

// The directory nginx's `location /` for centrio.me actually proxies to
// (verify with `grep -A2 'location /' /etc/nginx/sites-enabled/centrio` —
// the file WITHOUT a `.bak-*`/`.pre-*` suffix — and cross-check the
// resulting port against `ps -fp <pid of that port>` on the server; do not
// trust a pm2 process name alone, there are several stale look-alikes).
const LIVE_WEB_ROOT = '/var/www/centrio-web-releases/20260926-links02'

// The pm2 process serving LIVE_WEB_ROOT, and the daemon that owns it.
// 2026-09-30 finding: this one lives under a plain `pm2` (root's own
// daemon) — NOT `sudo -u webapps pm2`, which is a different daemon
// entirely and won't even see this process (see header comment above and
// the 2026-08-26 note further down for the mirror-image version of this
// same class of bug).
const PM2_PROCESS = 'centrio-web-links02'

// Every file on the LIVE server known to hardcode the current version as a
// literal string (verified 2026-09-30 via `grep -rl '2.9.4' src/` on
// LIVE_WEB_ROOT). This list describes the LIVE server's file layout, which
// has diverged from `landing/`'s — do NOT assume it matches a `landing/`
// filename list like the old VERSION_LITERAL_FILES did.
const VERSION_LITERAL_REMOTE_FILES = [
    'src/lib/i18n.ts',
    'src/components/centrio/sections.tsx',
    'src/components/centrio-en/sections.tsx',
    'src/components/centrio-fr/sections.tsx',
    'src/components/centrio-it/sections.tsx',
    'src/components/centrio-zh/sections.tsx',
    'src/content/translations/home-ru.json',
    'src/content/translations/home-en.json',
    'src/content/translations/home-fr.json',
    'src/content/translations/home-it.json',
    'src/content/translations/home-zh.json',
    'src/content/translations/pages-ru.json',
    'src/content/translations/pages-en.json',
    'src/content/translations/pages-fr.json',
    'src/content/translations/pages-it.json',
    'src/content/translations/pages-zh.json',
    'src/app/download/page.tsx',
    'src/app/layout.tsx',
]

// changelog-data.ts is NOT a simple literal — it's a historical array
// (source of truth is CHANGELOG.md, regenerated via scripts/gen-changelog-data.js).
// Genuinely self-contained (no other live-site imports diverge around it),
// so this is still safe to regenerate locally and upload whole.
const CHANGELOG_DATA_REMOTES = [
    `${LIVE_WEB_ROOT}/src/app/download/changelog-data.ts`,
    `${LIVE_WEB_ROOT}/src/app/pricing/changelog-data.ts`,
]

// ── Helpers ───────────────────────────────────────────────────────────────
function readFile(p) { return fs.readFileSync(p, 'utf8') }

function getVersion() {
    const arg = process.argv[2]
    if (arg && /^\d+\.\d+\.\d+$/.test(arg)) return arg
    const pkg = JSON.parse(readFile(path.join(ROOT, 'package.json')))
    return pkg.version
}

// Regenerates landing/changelog-data.ts from the root CHANGELOG.md via the
// existing one-off script, and returns its content ready to upload. Keeps
// this file (and its checked-in landing/ copy) as the one changelog
// pipeline, whatever the live page structure does elsewhere.
function regenerateChangelogData() {
    execFileSync('node', [path.join(ROOT, 'scripts', 'gen-changelog-data.js')], { cwd: ROOT, stdio: 'pipe' })
    const genPath = path.join(ROOT, 'dist-changelog-data.ts')
    const header =
        `// Копия для сайта (Тарифы + Скачать), сгенерирована из корневого CHANGELOG.md\n` +
        `// через scripts/gen-changelog-data.js. Источник истины — CHANGELOG.md /\n` +
        `// #changelogPopup в index.html. При выходе новой версии обнови их, затем\n` +
        `// перегенерируй этот файл и скопируй в landing/changelog-data.ts.\n` +
        `// Деплоится в две колокейшн-точки (src/app/pricing/ и src/app/download/) —\n` +
        `// см. scripts/deploy-site.js.\n`
    const body = readFile(genPath)
    const startIdx = body.indexOf('export interface')
    const content = header + body.slice(startIdx)
    fs.writeFileSync(path.join(ROOT, 'landing', 'changelog-data.ts'), content, 'utf8')
    fs.unlinkSync(genPath)
    return content
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

// Bumps the version on the LIVE server in place, via a small Node script
// uploaded to /tmp and executed there, then deleted. Deliberately does the
// substitution ON THE SERVER (not "download, edit locally, re-upload") —
// there is no reliable local copy of these files to edit; the live server
// is the only place they exist.
//
// 2026-08-26 bug this technique still guards against: a blind
// digit-triplet regex is greedy and doesn't know where a version number
// actually starts — in a string like `Setup%202.1.0.exe` it happily
// matches "202.1.0" (swallowing the "20" that's part of "%20"), corrupting
// the URL. The only reliable fix is an exact literal-substring replace of
// the known old version string, never an open-ended digit pattern —
// `content.split(oldVersion).join(newVersion)`, same as here.
async function bumpVersionRemote(sftp, oldVersion, newVersion) {
    const remoteFiles = VERSION_LITERAL_REMOTE_FILES.map((f) => `${LIVE_WEB_ROOT}/${f}`)
    const script =
        `const fs = require('fs')\n` +
        `const files = ${JSON.stringify(remoteFiles)}\n` +
        `const OLD = ${JSON.stringify(oldVersion)}\n` +
        `const NEW = ${JSON.stringify(newVersion)}\n` +
        `for (const f of files) {\n` +
        `  const before = fs.readFileSync(f, 'utf8')\n` +
        `  const count = before.split(OLD).length - 1\n` +
        `  fs.writeFileSync(f, before.split(OLD).join(NEW), 'utf8')\n` +
        `  console.log(f, '->', count, 'replacements')\n` +
        `}\n`
    const remoteTmp = '/tmp/centrio-deploy-site-bump-version.js'
    await sftp.put(Buffer.from(script, 'utf8'), remoteTmp)
    await runCommand(sftp, `node ${remoteTmp}`)
    await runCommand(sftp, `rm -f ${remoteTmp}`)
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
    const version = getVersion()
    console.log(`\n🚀 Deploying centrio.me — v${version}\n`)
    console.log(`   target: ${LIVE_WEB_ROOT} (pm2 process "${PM2_PROCESS}", root daemon)\n`)

    console.log('🔌 Connecting to server...')
    const sftp = new SftpClient()
    await sftp.connect(SFTP_CONFIG)

    // 1. Detect the current live version from the server itself (source of
    // truth — never guessed locally, the live file set has its own history).
    console.log('\n🔎 Detecting current live version...')
    const livePageTsx = (await sftp.get(`${LIVE_WEB_ROOT}/src/app/download/page.tsx`)).toString('utf8')
    const oldVersion = livePageTsx.match(/WIN_VERSION\s*=\s*'([^']+)'/)?.[1]
    if (!oldVersion) {
        throw new Error(`Could not detect WIN_VERSION in ${LIVE_WEB_ROOT}/src/app/download/page.tsx — has the live page structure changed again? Update this script's detection regex.`)
    }
    if (oldVersion === version) {
        console.log(`  ⚠ live version is already ${version} — proceeding anyway (re-deploy / rebuild only)`)
    } else {
        console.log(`  ✓ live version: ${oldVersion} → ${version}`)
    }

    // 2. Bump the version in place on the live files.
    console.log('\n📝 Bumping version on live files...')
    await bumpVersionRemote(sftp, oldVersion, version)

    // 3. Regenerate + upload changelog-data.ts.
    console.log('\n📰 Regenerating changelog-data.ts from CHANGELOG.md...')
    regenerateChangelogData()
    const localChangelog = path.join(ROOT, 'landing', 'changelog-data.ts')
    for (const remotePath of CHANGELOG_DATA_REMOTES) {
        await sftp.put(localChangelog, remotePath)
    }
    console.log(`  ✓ changelog-data.ts → ${CHANGELOG_DATA_REMOTES.join(', ')}`)

    console.log(`\n  ⚠ latest-release.json (${LIVE_WEB_ROOT}/src/app/download/latest-release.json) is NOT auto-updated —`)
    console.log(`    it needs hand-written ru/en/zh/fr/it release highlights for the download hero.`)
    console.log(`    Edit it on the server (or scp a new one) if this release should show fresh hero notes.`)

    // 4. Rebuild.
    console.log('\n🗑  Clearing Next.js cache...')
    await runCommand(sftp, `rm -rf ${LIVE_WEB_ROOT}/.next && echo cleared`)

    console.log('🔨 Building...')
    const build = await runCommand(sftp, `cd ${LIVE_WEB_ROOT} && npm run build 2>&1 | tail -20`)
    if (build.code !== 0) {
        throw new Error(`Build failed (exit ${build.code}) — see output above. Not restarting pm2 on a failed build.`)
    }

    // 5. Restart pm2.
    // See header comment: PM2_PROCESS lives in root's OWN pm2 daemon, not
    // `webapps`'s — the mirror-image of the 2026-08-26 bug (where the app's
    // process was in `webapps`'s daemon and restarting as root was the
    // no-op). Always verify which daemon owns which process before
    // "fixing" this line again; don't assume either one.
    console.log(`\n♻️  Restarting pm2 (${PM2_PROCESS})...`)
    await runCommand(sftp, `pm2 restart ${PM2_PROCESS} 2>&1 | tail -8`)

    await sftp.end()

    console.log(`\n✅ centrio.me updated to v${version}`)
    console.log(`   Win:   https://download.centrio.me/Centrio%20Setup%20${version}.exe`)
    console.log(`   Mac:   https://download.centrio.me/mac/Centrio-${version}.dmg`)
    console.log(`   Linux: https://download.centrio.me/linux/Centrio-${version}.AppImage`)
    console.log(`   deb:   https://download.centrio.me/linux/messengerapp_${version}_amd64.deb`)
    console.log(`\n   Verify live (this exact check is what caught the 2026-09-30 incident):`)
    console.log(`   curl -s https://centrio.me/download | grep -oE 'Setup%20[0-9.]+'`)
}

main().catch(e => {
    console.error('\n❌ Deploy failed:', e.message)
    process.exit(1)
})
