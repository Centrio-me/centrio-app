const https = require('https')
const URL_IN = process.argv[2]
function buildTransportFromParams(){ return null } // not needed to test throws of URL parsing
function parseVless(link){ const url=new URL(link); const name=decodeURIComponent(url.hash.slice(1))||url.hostname; const params=url.searchParams; const o={type:'vless',server:url.hostname,server_port:parseInt(url.port||'443',10),uuid:url.username}; return {name,o} }
function parseVmess(link){ const b64=link.slice(8); const json=JSON.parse(Buffer.from(b64,'base64').toString('utf8')); return {name:json.ps||json.add} }
function parseTrojan(link){ const url=new URL(link); return {name:decodeURIComponent(url.hash.slice(1))||url.hostname} }
function parseSS(link){ /*skip*/ return {name:'ss'} }
function parse(line){
  if(line.startsWith('vmess://')) return parseVmess(line)
  if(line.startsWith('vless://')) return parseVless(line)
  if(line.startsWith('trojan://')) return parseTrojan(line)
  if(line.startsWith('ss://')) return parseSS(line)
  throw new Error('unknown format')
}
https.get(URL_IN,{headers:{'User-Agent':'v2rayN/6.0'}},res=>{
  let raw=''; res.on('data',c=>raw+=c); res.on('end',()=>{
    let text=raw.trim(); try{const d=Buffer.from(text,'base64').toString('utf8'); if(d.includes('://'))text=d}catch(_){}
    const lines=text.split(/[\r\n]+/).map(l=>l.trim()).filter(l=>l.includes('://'))
    let ok=0, fail=0
    lines.forEach((l,i)=>{ try{ const p=parse(l); ok++; if(i<3)console.log('OK',i,JSON.stringify(p.name)) }catch(e){ fail++; console.log('FAIL line',i,'['+l.slice(0,40)+']','::',e.constructor.name,e.message) } })
    console.log('TOTAL ok='+ok+' fail='+fail+' of '+lines.length)
  })
})
