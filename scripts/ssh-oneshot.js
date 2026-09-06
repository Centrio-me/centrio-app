require('dotenv').config()
const { Client } = require('ssh2')
const CFG = { host:'31.128.44.165', port:22, username:'root', password:process.env.UPLOAD_PASSWORD, readyTimeout:25000 }
const c = new Client()
let settled=false
const fin=(m)=>{ if(!settled){settled=true; console.log(m); try{c.end()}catch(_){}; process.exit(0)} }
c.on('ready', ()=>{
  c.exec('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000; echo; free -m | head -2; echo "--- pm2 ---"; pm2 list 2>/dev/null | grep -Ei "centrio|web"; echo "--- build ---"; ls -la /var/www/centrio-web/.next/BUILD_ID 2>&1', (e,s)=>{
    if(e) return fin('exec err '+e.message)
    let o=''; s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d)
    s.on('close',()=>fin('READY\n'+o))
  })
})
c.on('error', e=>fin('ERR '+e.message))
c.on('close', ()=>{ if(!settled) fin('closed during handshake') })
c.connect(CFG)
