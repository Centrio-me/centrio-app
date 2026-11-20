// node save-fixture.js <tab name in the sidebar> — the «Сохранить изображение» path on every kind of picture of fixture-server.js
const fs = require('fs')
const DIR = 'C:/tmp/img-save-test'
const tabName = process.argv[2] || 'Yandex Mail'
const only = process.argv[3] ? process.argv[3].split(',') : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function conn(t) {
  return new Promise((resolve) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map(); const logs = []
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.method === 'Runtime.consoleAPICalled') { const x = (j.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' '); if (x.includes('[imgsave]')) logs.push(x.slice(0, 160)) } if (pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id) } }
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : r.result }
    ws.onopen = async () => { await send('Runtime.enable'); resolve({ send, ev, ws, logs }) }
  })
}
const CASES = [
  ['same', '#same'], ['xo-cors', '#xo-cors'], ['xo-nocors', '#xo-nocors'], ['blob', '#blob'], ['canvas', '#cv'], ['data', '#dataimg'],
  ['css-bg', '#bgdiv'], ['iframe', '#ifr'], ['no-ext', '#noext'], ['lie.jpg', '#lie'], ['overlay', '#overlay'], ['big', '#bigimg'], ['cookie', '#cookie']
]
const magic = (b) => (b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'PNG' : b.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'JPEG' : b.slice(0, 4).toString() === 'RIFF' ? 'WEBP' : 'other')
;(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json()
  const host = await conn(list.find((x) => x.type === 'page' && /index\.html/.test(x.url)))
  await host.ev(`(function(){var it=[...document.querySelectorAll('.messenger-item')].find(e=>(e.getAttribute('title')||e.textContent||'').trim().startsWith(${JSON.stringify(tabName)}));if(it)it.click();return !!it})()`)
  await sleep(3500)
  let guest = null, gurl = ''
  for (const g of list.filter((x) => x.type === 'webview' && (x.url.includes('instagram') || x.url.includes('127.0.0.1:38501')))) { guest = await conn(g); gurl = g.url; break }
  if (!guest) { console.log('no visible tab'); process.exit(1) }
  console.log('tab:', gurl.slice(0, 50))
  await guest.send('Page.enable')
  await guest.send('Page.bringToFront'); await guest.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await guest.send('Page.navigate', { url: 'http://127.0.0.1:38501/fixture' })
  await sleep(4000)
  const rows = []
  for (const [name, sel] of CASES) {
    if (only && !only.includes(name)) continue
    const r = await guest.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`)
    if (!r) { rows.push(`${name.padEnd(10)} no element`); continue }
    await host.ev(`document.dispatchEvent(new CustomEvent('close-all-popups'))`)
    await sleep(300)
    const before = new Set(fs.readdirSync(DIR))
    const click = async () => {
      await guest.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y })
      await guest.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'right', clickCount: 1 })
      await guest.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'right', clickCount: 1 })
    }
    await click(); await sleep(150); await click(); await sleep(900)
    let menu = { shown: false, image: false, first: [] }
    for (let k = 0; k < 15; k++) {
      menu = JSON.parse(await host.ev("(function(){var m=document.getElementById(\"webviewContextMenu\");var shown=m&&m.classList.contains(\"show\");var all=[].slice.call(m?m.querySelectorAll(\".context-item\"):[]);var it=all.filter(function(e){return /Сохранить изображение|Save image/i.test(e.innerText||\"\")})[0];if(it)it.click();return JSON.stringify({shown:!!shown,image:!!it})})()"))
      if (menu.image) break
      await sleep(200)
    }
    await sleep(3200)
    const fresh = fs.readdirSync(DIR).filter((f) => !before.has(f))
    let res = 'NOT SAVED'
    if (fresh.length) { const f = fresh[0]; const b = fs.readFileSync(DIR + '/' + f); res = `saved ${f.split('.').pop()} content=${magic(b)} ${b.length}B` }
    const lg = host.logs.splice(0).concat(guest.logs.splice(0))
    rows.push(`${name.padEnd(10)} menu=${menu.shown ? (menu.image ? 'IMAGE' : 'other') : 'none'}  ${res}${lg.length ? '   | ' + lg.join(' ; ').slice(0, 150) : ''}`)
  }
  console.log(rows.join('\n'))
  process.exit(0)
})()
