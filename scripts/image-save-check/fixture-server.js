// node fixture-server.js — a page with every kind of picture messengers use, on two origins (38501 page, 38502 «CDN»)
const http = require('http')
const zlib = require('zlib')
// a tiny valid PNG made of a gradient, 320x240
function png(w, h, seed) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w + seed) & 255; raw[o + 1] = (y * 255 / h) & 255; raw[o + 2] = (seed * 40) & 255 } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const IMG = { a: png(320, 240, 1), b: png(320, 240, 2), c: png(320, 240, 3), d: png(320, 240, 4), e: png(320, 240, 5), big: png(2400, 1800, 6) }
const PAGE = `<!doctype html><meta charset=utf-8><title>fixture</title>
<style>body{margin:0;background:#222;color:#ddd;font:12px sans-serif}.cell{position:absolute;width:150px;height:110px;overflow:hidden}.cell img,.cell canvas,.cell div.bg,.cell iframe{width:150px;height:110px;display:block}
.bg{background-size:cover}.over{position:absolute;inset:0}.lbl{position:absolute;bottom:0;left:0;background:#000a;color:#fff;font-size:10px;z-index:5;pointer-events:none}</style>
<body>
<div class=cell id=c1 style="left:10px;top:10px"><img id=same src="/img/a.png"><span class=lbl>same-origin</span></div>
<div class=cell id=c2 style="left:180px;top:10px"><img id=xo-cors src="http://127.0.0.1:38502/cors/b.png"><span class=lbl>cross, ACAO *</span></div>
<div class=cell id=c3 style="left:350px;top:10px"><img id=xo-nocors src="http://127.0.0.1:38502/nocors/c.png"><span class=lbl>cross, no CORS</span></div>
<div class=cell id=c4 style="left:520px;top:10px"><img id=blob><span class=lbl>blob:</span></div>
<div class=cell id=c5 style="left:10px;top:140px"><canvas id=cv width=150 height=110></canvas><span class=lbl>canvas</span></div>
<div class=cell id=c6 style="left:180px;top:140px"><img id=dataimg><span class=lbl>data:</span></div>
<div class=cell id=c7 style="left:350px;top:140px"><div class=bg id=bgdiv style="background-image:url(http://127.0.0.1:38502/cors/d.png)"></div><span class=lbl>css background</span></div>
<div class=cell id=c8 style="left:520px;top:140px"><iframe id=ifr src="http://127.0.0.1:38502/frame" style="border:0"></iframe><span class=lbl>iframe, other origin</span></div>
<div class=cell id=c9 style="left:10px;top:270px"><img id=noext src="http://127.0.0.1:38502/cors/noext?x=1"><span class=lbl>no extension (png)</span></div>
<div class=cell id=c10 style="left:180px;top:270px"><img id=lie src="http://127.0.0.1:38502/cors/lie.jpg"><span class=lbl>.jpg that is png</span></div>
<div class=cell id=c11 style="left:350px;top:270px"><img id=over src="/img/e.png"><div class=over id=overlay></div><span class=lbl>overlay on top</span></div>
<div class=cell id=c12 style="left:520px;top:270px"><img id=bigimg src="http://127.0.0.1:38502/cors/big.png"><span class=lbl>big 2400x1800</span></div>
<div class=cell id=c13 style="left:10px;top:400px"><img id=cookie src="http://127.0.0.1:38502/auth/e.png"><span class=lbl>needs cookie</span></div>
<script>
fetch('/img/a.png').then(r=>r.blob()).then(b=>{document.getElementById('blob').src=URL.createObjectURL(b)});
const cv=document.getElementById('cv').getContext('2d');const im=new Image();im.onload=()=>cv.drawImage(im,0,0,150,110);im.src='/img/b.png';
fetch('/img/c.png').then(r=>r.blob()).then(b=>{const f=new FileReader();f.onload=()=>{document.getElementById('dataimg').src=f.result};f.readAsDataURL(b)});
document.cookie='sess=1; path=/';
</script>`
http.createServer((req, res) => {
  const u = req.url.split('?')[0]
  if (u === '/' || u === '/fixture') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'pagecookie=1; Path=/' }); return res.end(PAGE) }
  const m = u.match(/^\/img\/(\w)\.png$/); if (m) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(IMG[m[1]]) }
  res.writeHead(404); res.end()
}).listen(38501, '127.0.0.1')
http.createServer((req, res) => {
  const u = req.url.split('?')[0]
  const send = (buf, type, extra = {}) => { res.writeHead(200, { 'Content-Type': type, ...extra }); res.end(buf) }
  if (u === '/cors/b.png') return send(IMG.b, 'image/png', { 'Access-Control-Allow-Origin': '*' })
  if (u === '/cors/d.png') return send(IMG.d, 'image/png', { 'Access-Control-Allow-Origin': '*' })
  if (u === '/nocors/c.png') return send(IMG.c, 'image/png')
  if (u === '/cors/noext') return send(IMG.a, 'image/png', { 'Access-Control-Allow-Origin': '*' })
  if (u === '/cors/lie.jpg') return send(IMG.b, 'image/png', { 'Access-Control-Allow-Origin': '*' })
  if (u === '/cors/big.png') return send(IMG.big, 'image/png', { 'Access-Control-Allow-Origin': '*' })
  if (u === '/auth/e.png') { const ok = /sess=1/.test(req.headers.cookie || ''); if (!ok) { res.writeHead(403); return res.end('need cookie') } return send(IMG.e, 'image/png') }
  if (u === '/frame') return send('<!doctype html><body style="margin:0"><img id=fi src="/nocors/c.png" style="width:150px;height:110px"></body>', 'text/html')
  res.writeHead(404); res.end()
}).listen(38502, '127.0.0.1')
console.log('fixture on 38501 / 38502')
