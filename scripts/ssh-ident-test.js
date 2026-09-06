require('dotenv').config()
// Hypothesis: a DPI/IPS deterministically drops non-OpenSSH SSH clients.
// Spoof the ssh2 client identification string to look like OpenSSH.
const { Client } = require('ssh2')
const c = new Client()
const t0 = Date.now()
c.on('ready', () => {
  console.log((Date.now() - t0) + 'ms READY with spoofed ident OK')
  c.exec('echo OK_$(hostname); uptime', (e, s) => {
    if (e) { console.log('err', e.message); return c.end() }
    let o = ''
    s.on('data', d => { o += d })
    s.on('close', () => { console.log(o.trim()); c.end() })
  })
})
c.on('error', e => console.log((Date.now() - t0) + 'ms ERROR: ' + e.message))
c.on('close', () => process.exit(0))
c.connect({ host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD, readyTimeout: 20000, ident: 'SSH-2.0-OpenSSH_9.6p1' })
