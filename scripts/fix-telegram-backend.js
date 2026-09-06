require('dotenv').config()
const SftpClient = require('../node_modules/ssh2-sftp-client')
const sftp = new SftpClient()
const CONN = { host: '31.128.44.165', port: 22, username: 'root', password: process.env.UPLOAD_PASSWORD }

const newTelegramPostRoute = `
router.post('/telegram/electron', async (req, res) => {
  try {
    const { hash, ...rest } = req.body
    if (!hash) return res.status(400).json({ error: 'hash обязателен' })

    const dataCheckString = Object.keys(rest).sort().map(k => k + '=' + rest[k]).join('\\n')
    const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (hmac !== hash) return res.status(401).json({ error: 'Невалидная подпись Telegram' })
    if (Date.now() / 1000 - Number(rest.auth_date) > 86400) return res.status(401).json({ error: 'Данные авторизации устарели' })

    const telegramId = String(rest.id)
    const name = [rest.first_name, rest.last_name].filter(Boolean).join(' ') || 'Telegram User'
    const avatar = rest.photo_url || null
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
    res.status(401).json({ error: 'Ошибка Telegram авторизации' })
  }
})
`

async function run() {
  await sftp.connect(CONN)

  let content = (await sftp.get('/var/www/centrio-api/src/routes/auth.js')).toString()

  // Replace old telegram/electron POST route
  const startMarker = `router.post('/telegram/electron', async (req, res) => {`
  const endMarker = `\nmodule.exports = router`

  const startIdx = content.indexOf(startMarker)
  const endIdx = content.lastIndexOf(endMarker)

  if (startIdx === -1) {
    console.error('Could not find telegram POST route')
    await sftp.end()
    process.exit(1)
  }

  content = content.slice(0, startIdx) + newTelegramPostRoute + endMarker
  await sftp.put(Buffer.from(content), '/var/www/centrio-api/src/routes/auth.js')
  console.log('Backend Telegram POST route updated')

  await sftp.end()
}

run().catch(e => { console.error(e.message); process.exit(1) })
