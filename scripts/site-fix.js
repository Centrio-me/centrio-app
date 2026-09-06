require('dotenv').config()
// One-shot site recovery for centrio-web (HTTP 502).
// Single SSH session: diagnose -> ensure swap -> rebuild .next -> restart pm2 -> verify.
// Full output streamed to scripts/site-fix.out so progress survives flaky stdout.
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const LOG = path.join(__dirname, 'site-fix.out')
let buf = ''
function log (s) { buf += s + '\n'; try { fs.writeFileSync(LOG, buf) } catch (_) {} ; try { process.stdout.write(s + '\n') } catch (_) {} }
const CFG = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD, readyTimeout: 30000 }

function exec (c, cmd, label, timeoutMs) {
  return new Promise((res) => {
    let done = false
    const finish = (code, o) => { if (done) return; done = true; log(`\n[${label}] exit ${code}\n` + o.slice(-6000)); res({ code, o }) }
    c.exec(cmd, (e, s) => {
      if (e) { return finish(-1, 'exec err: ' + e.message) }
      let o = ''
      s.on('data', d => { o += d })
      s.stderr.on('data', d => { o += d })
      s.on('close', code => finish(code, o))
    })
    if (timeoutMs) setTimeout(() => finish(-2, 'TIMEOUT after ' + timeoutMs + 'ms'), timeoutMs)
  })
}

async function main () {
  log('=== site-fix start ' + new Date().toISOString() + ' ===')
  const c = new Client()
  const ok = await new Promise((resolve) => {
    let settled = false
    const d = (v) => { if (!settled) { settled = true; resolve(v) } }
    c.on('ready', () => d(true))
    c.on('error', (e) => { log('connect error: ' + e.message); d(false) })
    c.on('close', () => d(false))
    try { c.connect(CFG) } catch (e) { log('connect throw: ' + e.message); d(false) }
  })
  if (!ok) { log('SSH FAILED (still banned or unreachable)'); process.exit(1) }
  log('SSH READY')

  await exec(c, 'uptime; echo "--- mem ---"; free -h; echo "--- swap ---"; swapon --show 2>&1 || true; echo "--- node ---"; node -v; cd /var/www/centrio-web && echo "--- pkg build script ---" && node -e "console.log(require(\'./package.json\').scripts.build)" 2>&1', 'diag', 60000)
  await exec(c, 'cd /var/www/centrio-web; echo "BUILD_ID:"; cat .next/BUILD_ID 2>&1; echo "--- pm2 ---"; pm2 list 2>&1 | grep -Ei "centrio|web" || pm2 list 2>&1 | tail -20', 'state', 60000)
  await exec(c,
    'if [ -z "$(swapon --show 2>/dev/null)" ]; then ' +
    '(fallocate -l 3G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=3072) && ' +
    'chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo SWAP_ADDED; ' +
    'else echo SWAP_PRESENT; fi; free -h', 'swap', 120000)
  await exec(c,
    'cd /var/www/centrio-web && rm -rf .next .turbo node_modules/.cache 2>/dev/null; ' +
    'NODE_OPTIONS="--max-old-space-size=2048" npm run build 2>&1 | tail -45', 'build', 900000)
  await exec(c, 'cd /var/www/centrio-web; echo "BUILD_ID after:"; cat .next/BUILD_ID 2>&1; ls -la .next/ 2>&1 | head', 'verify', 60000)
  await exec(c, 'pm2 restart centrio-web 2>&1 | tail -4; sleep 3; pm2 list 2>&1 | grep -Ei "centrio|web"; echo "--- local curl ---"; curl -s -o /dev/null -w "localhost:3000 -> %{http_code}\\n" --max-time 10 http://127.0.0.1:3000/ 2>&1', 'restart', 90000)
  log('=== site-fix DONE ===')
  c.end()
}
main().catch(e => { log('FATAL: ' + e.message); process.exit(1) })
