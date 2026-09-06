require('dotenv').config()
const SftpClient = require('../node_modules/ssh2-sftp-client')
const sftp = new SftpClient()

const CONN = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD }

async function run() {
  await sftp.connect(CONN)

  const buf = await sftp.get('/var/www/centrio-api/src/routes/auth.js')
  let content = buf.toString()

  // Replace the GET telegram/electron route to include CSP override header
  const oldRoute = `router.get('/telegram/electron', (req, res) => {`
  const newRoute = `router.get('/telegram/electron', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://telegram.org; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://oauth.telegram.org; frame-src https://oauth.telegram.org;"
  )`

  if (!content.includes(oldRoute)) {
    console.error('Could not find target route')
    await sftp.end()
    process.exit(1)
  }

  content = content.replace(oldRoute, newRoute)
  await sftp.put(Buffer.from(content), '/var/www/centrio-api/src/routes/auth.js')
  console.log('auth.js CSP fixed')

  await sftp.end()
  console.log('Done')
}

run().catch(e => { console.error(e.message); process.exit(1) })
