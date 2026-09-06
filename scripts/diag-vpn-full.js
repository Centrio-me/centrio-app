// Full main-process VPN path repro against the real subscription URL.
// Stubs electron + electron-store so vpn-manager.js loads outside Electron.
const os = require('os'), path = require('path'), Module = require('module')
const TMP = path.join(os.tmpdir(), 'vpn-diag'); require('fs').mkdirSync(TMP, { recursive: true })

const orig = Module._load
Module._load = function (req, parent, isMain) {
  if (req === 'electron') {
    const app = { getPath: () => TMP, on: () => {}, whenReady: () => Promise.resolve(), getVersion: () => '1.7.0', isReady: () => true }
    return { app, shell: {}, ipcMain: { handle: () => {}, on: () => {} }, BrowserWindow: class {}, session: { defaultSession: {} } }
  }
  if (req === 'electron-store') {
    return class Store { constructor(){ this.m = {} } get(k,d){ return k in this.m ? this.m[k] : d } set(k,v){ this.m[k]=v } }
  }
  return orig.apply(this, arguments)
}

const URL = 'https://flupdp.com/xpN99D1Kq0VRv86T'

async function run () {
  const vpn = require('../vpn-manager.js')
  console.log('exports:', Object.keys(vpn))
  console.log('--- fetchSubscription ---')
  const items = await vpn.fetchSubscription(URL)
  console.log('items:', items.length)
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    console.log(`  [${i}] name=${JSON.stringify(it.parsed && it.parsed.name)} type=${it.parsed && it.parsed.outbound && it.parsed.outbound.type}`)
  }
  console.log('--- buildSingboxConfig for each parsed outbound ---')
  for (let i = 0; i < items.length; i++) {
    try {
      if (vpn.buildSingboxConfig) vpn.buildSingboxConfig(items[i].parsed.outbound)
      // also re-stringify to mimic writeFileSync
      JSON.stringify(items[i].parsed)
    } catch (e) {
      console.log(`  CONFIG ERR [${i}] ${e.constructor.name}: ${e.message}\n${e.stack}`)
    }
  }
  console.log('--- re-parse primary link directly (unguarded) ---')
  try {
    if (vpn.parseVpnLink) vpn.parseVpnLink(items[0].link)
  } catch (e) { console.log('parse primary ERR:', e.constructor.name, e.message) }
  console.log('DONE OK')
}

run().catch(e => { console.log('THROW:', e.constructor.name + ': ' + e.message); console.log(e.stack) })
