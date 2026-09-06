require('dotenv').config()
const SftpClient = require('../node_modules/ssh2-sftp-client')
const sftp = new SftpClient()

const CONN = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD }

const telegramRoutes = `
// ===== TELEGRAM =====
const crypto = require('crypto')

router.get('/telegram/electron', (req, res) => {
  const callback = req.query.callback || ''
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
  res.send('<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><title>Centrio \u2014 \u0412\u043e\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram</title>' +
    '<style>body{background:#17212b;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#fff}h3{margin-bottom:24px;font-weight:400;font-size:20px}</style>' +
    '</head><body><h3>\u0412\u043e\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram</h3>' +
    '<script async src="https://telegram.org/js/telegram-widget.js?22"' +
    ' data-telegram-login="' + botUsername + '"' +
    ' data-size="large" data-radius="5"' +
    ' data-auth-url="' + callback + '"></script>' +
    '</body></html>')
})

router.post('/telegram/electron', async (req, res) => {
  try {
    const { tgAuthResult } = req.body
    if (!tgAuthResult) return res.status(400).json({ error: 'tgAuthResult \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u0435\u043d' })

    const data = JSON.parse(Buffer.from(tgAuthResult, 'base64url').toString())
    const { hash, ...rest } = data

    const dataCheckString = Object.keys(rest).sort().map(k => k + '=' + rest[k]).join('\\n')
    const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (hmac !== hash) return res.status(401).json({ error: '\u041d\u0435\u0432\u0430\u043b\u0438\u0434\u043d\u0430\u044f \u043f\u043e\u0434\u043f\u0438\u0441\u044c Telegram' })
    if (Date.now() / 1000 - data.auth_date > 86400) return res.status(401).json({ error: '\u0414\u0430\u043d\u043d\u044b\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0443\u0441\u0442\u0430\u0440\u0435\u043b\u0438' })

    const telegramId = data.id.toString()
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Telegram User'
    const avatar = data.photo_url || null
    const email = 'tg_' + telegramId + '@centrio.me'

    let user = await prisma.user.findFirst({ where: { telegramId } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, telegramId, emailVerified: true } })
    } else if (avatar && avatar !== user.avatar) {
      user = await prisma.user.update({ where: { id: user.id }, data: { avatar } })
    }

    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan },
      accessToken,
      refreshToken
    })
  } catch (err) {
    console.error('Telegram electron error:', err)
    res.status(401).json({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 Telegram \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438' })
  }
})
`

async function run() {
  await sftp.connect(CONN)

  // Update auth.js
  const authBuf = await sftp.get('/var/www/centrio-api/src/routes/auth.js')
  const authContent = authBuf.toString()
  if (authContent.includes('telegram/electron')) {
    console.log('auth.js already has Telegram routes, skipping')
  } else {
    const updatedAuth = authContent.replace('module.exports = router', telegramRoutes + '\nmodule.exports = router')
    await sftp.put(Buffer.from(updatedAuth), '/var/www/centrio-api/src/routes/auth.js')
    console.log('auth.js updated')
  }

  await sftp.end()
  console.log('Done')
}

run().catch(e => { console.error(e.message); process.exit(1) })
