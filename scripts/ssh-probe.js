require('dotenv').config()
const { Client } = require('ssh2')
const c = new Client()
const t0 = Date.now()
const ev = (n, x) => console.log((Date.now() - t0) + 'ms ' + n + (x ? ': ' + x : ''))
c.on('banner', b => ev('banner', JSON.stringify(b).slice(0, 80)))
c.on('handshake', () => ev('handshake-ok'))
c.on('ready', () => {
  ev('ready')
  c.exec('echo OK_$(hostname); uptime', (e, s) => {
    if (e) { ev('exec-err', e.message); return c.end() }
    let o = ''
    s.on('data', d => { o += d })
    s.on('close', () => { ev('exec', o.trim()); c.end() })
  })
})
c.on('error', e => ev('error', (e.level || '') + ' / ' + e.message))
c.on('close', () => { ev('close'); process.exit(0) })
c.connect({ host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD, readyTimeout: 25000 })
