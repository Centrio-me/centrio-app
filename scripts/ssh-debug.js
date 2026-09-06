require('dotenv').config()
// Verbose ssh2 diagnostic: log every protocol step + the real error, no early exit.
const { Client } = require('ssh2')
const c = new Client()
const t0 = Date.now()
const T = () => (Date.now() - t0) + 'ms '
let gotError = false
c.on('banner', m => console.log(T() + 'BANNER ' + JSON.stringify(String(m).slice(0, 60))))
c.on('greeting', m => console.log(T() + 'GREETING ' + JSON.stringify(String(m).slice(0, 60))))
c.on('handshake', neg => console.log(T() + 'HANDSHAKE OK ' + JSON.stringify(neg)))
c.on('ready', () => { console.log(T() + 'READY OK'); c.end() })
c.on('error', e => { gotError = true; console.log(T() + 'ERROR level=' + (e.level || '?') + ' msg=' + e.message) })
c.on('close', () => { console.log(T() + 'CLOSE (gotError=' + gotError + ')'); process.exit(0) })
c.connect({
  host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD,
  readyTimeout: 25000,
  ident: 'SSH-2.0-OpenSSH_9.6p1',
  debug: m => console.log(T() + 'DBG ' + m)
})
