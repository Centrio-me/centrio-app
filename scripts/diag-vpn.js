const https = require('https'), http = require('http')
const URL_IN = process.argv[2]
function get(urlStr, cb){
  const m = urlStr.startsWith('https') ? https : http
  m.get(urlStr, { headers:{'User-Agent':'v2rayN/6.0'} }, res=>{
    if(res.statusCode===301||res.statusCode===302){ return get(res.headers.location, cb) }
    let raw=''; res.on('data',c=>raw+=c); res.on('end',()=>cb(null,{status:res.statusCode, ct:res.headers['content-type'], raw}))
  }).on('error',e=>cb(e))
}
get(URL_IN,(e,r)=>{
  if(e){ console.log('NET ERR:', e.message); return }
  console.log('HTTP', r.status, 'content-type:', r.ct)
  console.log('RAW length:', r.raw.length)
  console.log('RAW first 200:', JSON.stringify(r.raw.slice(0,200)))
  let text = r.raw.trim()
  try { const d = Buffer.from(text,'base64').toString('utf8'); if(d.includes('://')){ text=d; console.log('-> base64 decoded, includes ://') } else { console.log('-> not base64 config (decoded has no ://)') } } catch(_){ console.log('-> base64 decode threw') }
  const lines = text.split(/[\r\n]+/).map(l=>l.trim()).filter(l=>l.includes('://'))
  console.log('config lines found:', lines.length)
  lines.slice(0,6).forEach((l,i)=>console.log('  line',i,':',l.slice(0,60)))
})
