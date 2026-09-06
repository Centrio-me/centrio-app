// DEPRECATED 2026-07-29 — superseded by scripts/deploy-frontend.js.
// Kept only as a historical record. Two real bugs found during the
// 2026-07-29 version-consistency fix:
//   1. Only uploads page.tsx — every other file that actually needs to
//      change on a release (download/page.tsx, lib/i18n.ts,
//      components/SiteFooter.tsx, and more found in a later pass) was
//      never covered by it.
//   2. Restarts with plain `pm2 restart centrio-web` as root. On this
//      server every app process (including centrio-web) runs under the
//      `webapps` system user in its own pm2 daemon — root's own `pm2 list`
//      is a completely separate, empty instance. That command would have
//      either silently no-op'd or spawned a stray root-owned duplicate
//      process, never touching the real running site.
// Use scripts/deploy-frontend.js instead.
const SftpClient = require('ssh2-sftp-client')
const fs = require('fs')
const path = require('path')

const sftp = new SftpClient()
const KEY_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519_cliqly')

const SSH = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  privateKey: fs.readFileSync(KEY_PATH),
  readyTimeout: 30000,
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', d => { out += d; process.stdout.write(d) })
      stream.stderr.on('data', d => { errOut += d; process.stderr.write(d) })
      stream.on('close', code => {
        if (code !== 0 && errOut) console.warn('[STDERR]', errOut.trim())
        resolve({ code, out })
      })
    })
  })
}

async function main() {
  console.log('Connecting with SSH key...')
  await sftp.connect(SSH)
  console.log('Connected!\n')

  // Upload new page.tsx
  const localPage = path.join(__dirname, '..', 'landing', 'page.tsx')
  const remotePage = '/var/www/centrio-web/src/app/page.tsx'
  console.log(`Uploading page.tsx...`)
  await sftp.put(localPage, remotePage)
  console.log('✓ page.tsx uploaded\n')

  // Build
  console.log('Building Next.js (this takes ~2-3 min)...')
  const buildResult = await exec(
    'cd /var/www/centrio-web && NODE_OPTIONS="--max-old-space-size=1024" npm run build 2>&1 | tail -30'
  )

  if (buildResult.code !== 0) {
    console.error('\nBuild failed! Exit code:', buildResult.code)
    await sftp.end()
    process.exit(1)
  }

  console.log('\nRestarting centrio-web...')
  await exec('pm2 restart centrio-web 2>&1')
  console.log('\n✓ Deployed successfully!')

  await sftp.end()
}

main().catch(async err => {
  console.error('Error:', err.message)
  try { await sftp.end() } catch (_) {}
  process.exit(1)
})
