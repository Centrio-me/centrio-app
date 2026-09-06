// Verify the freshly built asar: vpn-manager.js is clean, no worktree/python pollution.
const path = require('path')
const cp = require('child_process')
let asar = null
for (const cand of ['@electron/asar', 'asar']) {
  try { asar = require(cand); break } catch (_) {}
  try { asar = require(path.join(cp.execSync('npm root -g').toString().trim(), cand)); break } catch (_) {}
}
if (!asar) { console.log('NO_ASAR_MODULE'); process.exit(1) }
const AP = path.join('C:\\MessengerApps', 'dist', 'win-unpacked', 'resources', 'app.asar')
const files = asar.listPackage(AP)
const pkg = asar.extractFile(AP, 'package.json').toString('utf8')
console.log('asar:', AP)
console.log('VERSION =', (pkg.match(/"version":\s*"([^"]+)"/) || [])[1])
console.log('total entries:', files.length)
console.log('worktree entries:', files.filter(f => f.includes('.claude')).length)
console.log('.py entries:', files.filter(f => f.endsWith('.py')).length)
console.log('telegram-claude entries:', files.filter(f => f.toLowerCase().includes('telegram-claude')).length)
const vm = asar.extractFile(AP, 'vpn-manager.js').toString('utf8')
console.log('\nvpn-manager.js len:', vm.length)
console.log('first line:', JSON.stringify(vm.split('\n')[0]))
console.log('last non-empty line:', JSON.stringify(vm.trim().split('\n').slice(-1)[0]))
console.log('has python garbage:', /__main__|🤖 <b>Claude/.test(vm))
console.log('ends with exports brace:', vm.trim().endsWith('}'))
const idx = asar.extractFile(AP, 'index.html').toString('utf8')
console.log('index.html script:', (idx.match(/<script[^>]*src=["'][^"']*["']/i) || [])[0])
const bundle = asar.extractFile(AP, 'bundle.js').toString('utf8')
console.log('bundle.js len:', bundle.length, 'evals:', (bundle.match(/new Function|\beval\(/g) || []).length)
