require('dotenv').config()
// sshd is dropping connections under MaxStartups pressure (bot brute-force flood).
// The drop is random, so retry the full SSH handshake until one slips through.
const { Client } = require('ssh2')
const CFG = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD, readyTimeout: 20000 }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function attempt (i) {
  return new Promise(resolve => {
    const c = new Client()
    let settled = false
    const done = v => { if (!settled) { settled = true; resolve(v) } }
    c.on('ready', () => {
      console.log(`attempt ${i}: READY ✅`)
      c.exec('echo OK_$(hostname); uptime; echo "--- site ---"; cat /var/www/centrio-web/.next/BUILD_ID 2>&1 | head -1; curl -s -o /dev/null -w "local3000=%{http_code}\\n" --max-time 8 http://127.0.0.1:3000/ 2>&1', (e, s) => {
        if (e) { console.log('exec err', e.message); c.end(); return done(true) }
        let o = ''
        s.on('data', d => { o += d })
        s.stderr.on('data', d => { o += d })
        s.on('close', () => { console.log(o.trim()); c.end(); done(true) })
      })
    })
    c.on('error', e => { console.log(`attempt ${i}: ${e.message}`); done(false) })
    c.on('close', () => done(undefined))
    try { c.connect(CFG) } catch (e) { console.log(`attempt ${i}: throw ${e.message}`); done(false) }
  })
}

(async () => {
  for (let i = 1; i <= 15; i++) {
    const r = await attempt(i)
    if (r === true) { console.log('CONNECTED on attempt ' + i); process.exit(0) }
    if (r === undefined) console.log(`attempt ${i}: dropped before ready (MaxStartups)`)
    await sleep(1500)
  }
  console.log('GAVE UP after 15 attempts')
  process.exit(1)
})()
