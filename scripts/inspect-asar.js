// Extract shipped renderer/main files from the installed app.asar and scan for
// eval-class sinks, to compare the SHIPPED build against current clean source.
const path = require('path')
const fs = require('fs')
const cp = require('child_process')

const AP = 'C:\\Program Files\\Centrio\\resources\\app.asar'

let asar = null
for (const cand of ['@electron/asar', 'asar']) {
  try { asar = require(cand); break } catch (_) {}
  try { asar = require(path.join(cp.execSync('npm root -g').toString().trim(), cand)); break } catch (_) {}
}
if (!asar) { console.log('NO_ASAR_MODULE'); process.exit(1) }

const files = asar.listPackage(AP)
const sep = '\\'
const want = files.filter(f =>
  f.endsWith(sep + 'bundle.js') ||
  f.endsWith(sep + 'vpn-manager.js') ||
  f.endsWith(sep + 'package.json') === false && false ||
  f.endsWith(sep + 'vpn-bind.js') ||
  f === sep + 'package.json' ||
  f === sep + 'index.html'
)
console.log('--- candidate files in asar ---')
want.forEach(f => console.log('  ' + f))

function get (p) {
  try { return asar.extractFile(AP, p).toString('utf8') } catch (e) { return 'ERR:' + e.message }
}

const pkg = get('package.json')
console.log('\nVERSION =', (pkg.match(/"version":\s*"([^"]+)"/) || [])[1])

const idx = get('index.html')
const scriptTag = (idx.match(/<script[^>]*src=["'][^"']*["'][^>]*>/gi) || [])
console.log('index.html scripts:', scriptTag.join(' | '))

const targets = ['bundle.js', 'vpn-manager.js', 'renderer\\vpn-bind.js']
for (const p of targets) {
  const c = get(p)
  const safe = p.replace(/[\\\/]/g, '_')
  fs.writeFileSync(path.join(require('os').tmpdir(), 'ship_' + safe), c)
  const evals = (c.match(/new Function|\beval\(/g) || []).length
  const exec = (c.match(/executeJavaScript/g) || []).length
  console.log(`${p}: len=${c.length} evals=${evals} executeJavaScript=${exec}`)
}
console.log('\nwrote shipped files to', require('os').tmpdir())
