require('dotenv').config()
// Hypothesis: a per-source connlimit rule drops our connections because our
// retry bursts keep us above the concurrent-connection threshold. Stay silent
// for a cooldown window so old sockets drain, then make ONE single attempt.
const { Client } = require('ssh2')
const COOLDOWN = 80000
const CFG = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD, readyTimeout: 20000 }

function connectOnce () {
  return new Promise(resolve => {
    const c = new Client()
    let settled = false
    const done = v => { if (!settled) { settled = true; resolve(v) } }
    c.on('ready', () => {
      console.log('READY ✅ — single connection after cooldown succeeded')
      c.exec('echo OK_$(hostname); free -h | head -2; echo "--- BUILD_ID ---"; cat /var/www/centrio-web/.next/BUILD_ID 2>&1 | head -1; pm2 list 2>&1 | grep -Ei "centrio-web" || true; curl -s -o /dev/null -w "local3000=%{http_code}\\n" --max-time 8 http://127.0.0.1:3000/ 2>&1', (e, s) => {
        if (e) { console.log('exec err', e.message); c.end(); return done(true) }
        let o = ''
        s.on('data', d => { o += d })
        s.stderr.on('data', d => { o += d })
        s.on('close', () => { console.log(o.trim()); c.end(); done(true) })
      })
    })
    c.on('error', e => { console.log('ERROR: ' + e.message); done(false) })
    c.on('close', () => done(undefined))
    try { c.connect(CFG) } catch (e) { console.log('throw ' + e.message); done(false) }
  })
}

(async () => {
  console.log('cooldown ' + (COOLDOWN / 1000) + 's of total SSH silence...')
  await new Promise(r => setTimeout(r, COOLDOWN))
  console.log('single attempt @ ' + new Date().toISOString())
  const r = await connectOnce()
  if (r === true) { console.log('RESULT: CONNECTED'); process.exit(0) }
  console.log('RESULT: ' + (r === undefined ? 'dropped before ready (still blocked)' : 'error'))
  process.exit(1)
})()
