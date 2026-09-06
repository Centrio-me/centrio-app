require('dotenv').config()
// Recover centrio-web after a failed/OOM-killed Next.js build (site is 502).
// Sequentially retries SSH connect (handshake throttling), then in ONE session:
//   - ensures swap exists (build was OOM-killed)
//   - rebuilds .next with a memory cap
//   - restarts the pm2 web process
// Progress is written to scripts/recover-web.out (stdout from node is unreliable here).
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const LOG = path.join(__dirname, 'recover-web.out')
let buf = ''
function log(s){ buf += s + '\n'; try { fs.writeFileSync(LOG, buf) } catch(_){} }
const CFG = { host:'31.128.44.165', port:22, username:'root', password:process.env.UPLOAD_PASSWORD, readyTimeout:30000 }

function connectOnce(){
  return new Promise((resolve) => {
    const c = new Client()
    let settled = false
    const done = (ok) => { if(!settled){ settled = true; resolve(ok ? c : null) } }
    c.on('ready', () => done(true))
    c.on('error', (e) => { log('  connect error: ' + e.message); done(false) })
    c.on('close', () => { if(!settled){ log('  closed during handshake'); done(false) } })
    try { c.connect(CFG) } catch(e){ log('  connect throw: ' + e.message); done(false) }
  })
}

function exec(c, cmd, label){
  return new Promise((res) => {
    c.exec(cmd, (e, s) => {
      if(e){ log(`[${label}] exec err: ${e.message}`); return res({code:-1,o:e.message}) }
      let o=''
      s.on('data', d => o += d)
      s.stderr.on('data', d => o += d)
      s.on('close', code => { log(`[${label}] exit ${code}\n${o.slice(-4000)}`); res({code,o}) })
    })
  })
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main(){
  log('=== recover-web start ' + new Date().toISOString() + ' ===')
  // fail2ban likely banned us from rapid reconnects. Wait out the ban window,
  // then try sparingly (one isolated attempt every 60s) so we don't re-trip it.
  const WAIT_BEFORE = 25 * 60 * 1000
  log(`waiting ${WAIT_BEFORE/1000}s for fail2ban ban to expire (sparse retries to avoid re-tripping)...`)
  await sleep(WAIT_BEFORE)
  let c = null
  for(let i=1; i<=8 && !c; i++){
    log(`connect attempt ${i} @ ${new Date().toISOString()}...`)
    c = await connectOnce()
    if(!c){ await sleep(150000) }
  }
  if(!c){ log('GAVE UP: could not establish SSH'); process.exit(1) }
  log('SSH READY')

  // 1. Identify pm2 web process
  await exec(c, 'pm2 jlist 2>/dev/null | head -c 4000', 'pm2-jlist')

  // 2. Memory + swap state
  await exec(c, 'free -h; echo "--- swap ---"; swapon --show 2>&1 || true', 'mem')

  // 3. Ensure swap (build was OOM-killed). Create 2G swapfile if none active.
  await exec(c,
    'if [ -z "$(swapon --show 2>/dev/null)" ]; then ' +
    'fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048; ' +
    'chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; echo SWAP_ADDED; ' +
    'else echo SWAP_PRESENT; fi; free -h', 'swap')

  // 4. Rebuild with memory cap
  await exec(c,
    'cd /var/www/centrio-web && rm -rf .next && ' +
    'NODE_OPTIONS="--max-old-space-size=1536" npm run build 2>&1 | tail -25', 'build')

  // 5. Verify build artifact then restart
  await exec(c, 'ls -la /var/www/centrio-web/.next/BUILD_ID 2>&1; cat /var/www/centrio-web/.next/BUILD_ID 2>&1', 'verify')
  await exec(c, 'pm2 restart centrio-web 2>&1 | tail -3; sleep 2; pm2 list | grep -Ei "centrio|web" || pm2 list', 'restart')

  log('=== DONE ===')
  c.end()
}
main().catch(e => { log('FATAL: ' + e.message); process.exit(1) })
