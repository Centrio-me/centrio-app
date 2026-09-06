require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const fs = require('fs')
const path = require('path')

const sftp = new SftpClient()

const SSH = {
  host: '31.128.44.165',
  port: 22,
  username: 'root',
  password: process.env.UPLOAD_PASSWORD,
  readyTimeout: 30000
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    sftp.client.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', err2 = ''
      stream.on('data', d => out += d)
      stream.stderr.on('data', d => err2 += d)
      stream.on('close', code => {
        if (code !== 0 && err2) console.warn('STDERR:', err2.trim())
        resolve(out.trim())
      })
    })
  })
}

async function upload(localPath, remotePath) {
  console.log(`  upload ${path.basename(localPath)} → ${remotePath}`)
  await sftp.put(localPath, remotePath)
}

async function writeRemote(remotePath, content) {
  const tmp = path.join(require('os').tmpdir(), 'centrio_tmp_' + Date.now())
  fs.writeFileSync(tmp, content, 'utf8')
  await sftp.put(tmp, remotePath)
  fs.unlinkSync(tmp)
  console.log(`  wrote ${remotePath}`)
}

// ── Updated admin.js ────────────────────────────────────────────────────────
const adminJs = `const router = require('express').Router()
const prisma  = require('../utils/prisma')
const { getQrDataUrl, verifyTotp, checkSession } = require('../utils/admin-otp')

// ── Открытые маршруты (без auth) ──────────────────────────────────────────────

router.get('/setup-qr', async (req, res) => {
    const key = req.headers['x-setup-key'] || req.query.key
    if (!key || key !== process.env.SETUP_KEY) {
        return res.status(403).json({ error: 'Forbidden' })
    }
    try {
        const qr = await getQrDataUrl()
        res.json({ qr, secret: process.env.TOTP_SECRET })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка генерации QR: ' + err.message })
    }
})

router.post('/verify-totp', (req, res) => {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Код не передан' })
    const result = verifyTotp(code)
    if (!result.ok) return res.status(401).json({ error: result.error })
    res.json({ ok: true, token: result.token })
})

// ── Middleware ──────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
    const token = req.headers['x-admin-token']
    if (!checkSession(token)) {
        return res.status(403).json({ error: 'Сессия истекла — войдите заново', code: 'SESSION_EXPIRED' })
    }
    next()
}

router.use(adminAuth)

function detectProvider(user) {
    if (user.googleId)     return 'Google'
    if (user.yandexId)     return 'Яндекс'
    if (user.githubId)     return 'GitHub'
    if (user.telegramId)   return 'Telegram'
    if (user.vkId)         return 'VK'
    if (user.mailId)       return 'Mail.ru'
    if (user.passwordHash) return 'Email'
    return '—'
}

function isOnline(lastSeenAt) {
    if (!lastSeenAt) return false
    return (Date.now() - new Date(lastSeenAt).getTime()) < 5 * 60 * 1000
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const search = (req.query.search || '').trim()

        const where = search
            ? { OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { name:  { contains: search, mode: 'insensitive' } }
              ]}
            : {}

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where, skip, take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, email: true, name: true, avatar: true,
                    plan: true, planExpiresAt: true, isActive: true, isAdmin: true,
                    lastSeenAt: true, createdAt: true,
                    googleId: true, yandexId: true, githubId: true,
                    telegramId: true, vkId: true, mailId: true, passwordHash: true,
                    _count: { select: { messengers: true, folders: true, sessions: true } }
                }
            }),
            prisma.user.count({ where })
        ])

        const result = users.map(u => ({
            id: u.id, email: u.email, name: u.name, avatar: u.avatar,
            plan: u.plan, planExpiresAt: u.planExpiresAt,
            isActive: u.isActive, isAdmin: u.isAdmin,
            lastSeenAt: u.lastSeenAt, createdAt: u.createdAt,
            online:     isOnline(u.lastSeenAt),
            provider:   detectProvider(u),
            messengers: u._count.messengers,
            folders:    u._count.folders,
            sessions:   u._count.sessions
        }))

        res.json({ users: result, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin /users error:', err)
        res.status(500).json({ error: 'Ошибка получения пользователей' })
    }
})

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, email: true, name: true, avatar: true,
                plan: true, planExpiresAt: true, isActive: true, isAdmin: true,
                lastSeenAt: true, createdAt: true,
                googleId: true, yandexId: true, githubId: true,
                telegramId: true, vkId: true, mailId: true, passwordHash: true,
                _count: { select: { messengers: true, folders: true, sessions: true } }
            }
        })
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
        res.json({
            ...user,
            online:     isOnline(user.lastSeenAt),
            provider:   detectProvider(user),
            messengers: user._count.messengers,
            folders:    user._count.folders,
            sessions:   user._count.sessions
        })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── GET /api/admin/users/:id/payments ────────────────────────────────────────
router.get('/users/:id/payments', async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({
            where: { userId: req.params.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, amount: true, currency: true, status: true,
                provider: true, plan: true, months: true, createdAt: true
            }
        })
        res.json({ ok: true, payments })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения платежей' })
    }
})

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
router.patch('/users/:id/plan', async (req, res) => {
    try {
        const { plan, planExpiresAt } = req.body
        if (!['FREE', 'PRO', 'TEAM'].includes(plan)) {
            return res.status(400).json({ error: 'Неверный план. Допустимо: FREE, PRO, TEAM' })
        }
        const data = { plan }
        if (plan === 'FREE') {
            data.planExpiresAt = null
        } else if (planExpiresAt) {
            data.planExpiresAt = new Date(planExpiresAt)
        } else {
            const exp = new Date()
            exp.setFullYear(exp.getFullYear() + 1)
            data.planExpiresAt = exp
        }
        const user = await prisma.user.update({
            where: { id: req.params.id }, data,
            select: { id: true, email: true, plan: true, planExpiresAt: true }
        })
        res.json({ ok: true, user })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' })
        res.status(500).json({ error: 'Ошибка обновления плана' })
    }
})

// ── PATCH /api/admin/users/:id/active ────────────────────────────────────────
router.patch('/users/:id/active', async (req, res) => {
    try {
        const { isActive } = req.body
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data:  { isActive: Boolean(isActive) },
            select: { id: true, email: true, isActive: true }
        })
        res.json({ ok: true, user })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' })
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [total, free, pro, team, onlineNow] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { plan: 'FREE' } }),
            prisma.user.count({ where: { plan: 'PRO'  } }),
            prisma.user.count({ where: { plan: 'TEAM' } }),
            prisma.user.count({
                where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } }
            })
        ])
        res.json({ total, free, pro, team, onlineNow })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка статистики' })
    }
})

// ── POST /api/admin/notifications ────────────────────────────────────────────
router.post('/notifications', async (req, res) => {
    try {
        const { title, body, imageUrl, actionLabel, actionUrl } = req.body
        if (!title || !body) return res.status(400).json({ error: 'title и body обязательны' })
        const n = await prisma.appNotification.create({
            data: {
                title,
                body,
                imageUrl:    imageUrl    || null,
                actionLabel: actionLabel || null,
                actionUrl:   actionUrl   || null
            }
        })
        res.json({ ok: true, notification: n })
    } catch (err) {
        console.error('admin notifications POST:', err)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── GET /api/admin/notifications ─────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await prisma.appNotification.findMany({
            orderBy: { createdAt: 'desc' }, take: 100
        })
        res.json({ ok: true, notifications })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── DELETE /api/admin/notifications/:id ──────────────────────────────────────
router.delete('/notifications/:id', async (req, res) => {
    try {
        await prisma.appNotification.delete({ where: { id: req.params.id } })
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найден' })
        res.status(500).json({ error: 'Ошибка удаления' })
    }
})

module.exports = router
`

// ── Updated notifications.js ────────────────────────────────────────────────
const notifJs = `const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')

// GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id

    const notifications = await prisma.appNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reads: {
          where: { userId },
          select: { id: true }
        }
      }
    })

    const result = notifications.map(n => ({
      id:          n.id,
      title:       n.title,
      body:        n.body,
      createdAt:   n.createdAt,
      imageUrl:    n.imageUrl    || null,
      actionLabel: n.actionLabel || null,
      actionUrl:   n.actionUrl   || null,
      isRead:      n.reads.length > 0
    }))

    res.json({ success: true, data: result })
  } catch (e) {
    console.error('[notifications GET]', e)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/notifications/read-all
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id

    const allNotifs = await prisma.appNotification.findMany({
      select: { id: true }
    })

    if (allNotifs.length > 0) {
      await prisma.appNotificationRead.createMany({
        data: allNotifs.map(n => ({ notificationId: n.id, userId })),
        skipDuplicates: true
      })
    }

    res.json({ success: true })
  } catch (e) {
    console.error('[notifications read-all]', e)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
`

// ── Schema patch ─────────────────────────────────────────────────────────────
// We'll patch only the AppNotification model

async function main() {
  console.log('🔌 Connecting…')
  await sftp.connect(SSH)

  try {
    // 1. Patch Prisma schema
    console.log('\n📦 Patching Prisma schema…')
    const schema = await exec('cat /var/www/centrio-api/prisma/schema.prisma')
    if (schema.includes('actionLabel')) {
      console.log('  schema already has actionLabel — skipping')
    } else {
      const patched = schema.replace(
        'model AppNotification {\n  id        String   @id @default(uuid())\n  title     String\n  body      String\n  imageUrl  String?',
        'model AppNotification {\n  id          String   @id @default(uuid())\n  title       String\n  body        String\n  imageUrl    String?\n  actionLabel String?\n  actionUrl   String?'
      )
      await writeRemote('/var/www/centrio-api/prisma/schema.prisma', patched)
    }

    // 2. prisma db push
    console.log('\n🗄  Running prisma db push…')
    const pushOut = await exec('cd /var/www/centrio-api && npx prisma db push --accept-data-loss 2>&1')
    console.log('  ', pushOut.split('\n').slice(-3).join(' | '))

    // 3. Upload updated admin.js
    console.log('\n📤 Uploading admin.js…')
    await writeRemote('/var/www/centrio-api/src/routes/admin.js', adminJs)

    // 4. Upload updated notifications.js
    console.log('📤 Uploading notifications.js…')
    await writeRemote('/var/www/centrio-api/src/routes/notifications.js', notifJs)

    // 5. Upload admin-server.tsx to centrio-web
    console.log('\n📤 Uploading admin-server.tsx…')
    await sftp.put(
      'C:\\MessengerApps\\landing\\admin-server.tsx',
      '/var/www/centrio-web/src/app/admin/page.tsx'
    )

    // 6. Restart API
    console.log('\n🔄 Restarting centrio-api…')
    const restart = await exec('pm2 restart centrio-api 2>&1')
    console.log('  ', restart.split('\n').filter(l => l.trim()).pop())

    // 7. Rebuild centrio-web
    console.log('\n🏗  Building centrio-web (this takes ~2 min)…')
    const build = await exec('cd /var/www/centrio-web && npm run build 2>&1 | tail -5')
    console.log('  ', build)

    // 8. Restart web
    console.log('\n🔄 Restarting centrio-web…')
    const restartWeb = await exec('pm2 restart centrio-web 2>&1')
    console.log('  ', restartWeb.split('\n').filter(l => l.trim()).pop())

    console.log('\n✅ All done!')
  } finally {
    await sftp.end()
  }
}

main().catch(e => { console.error('❌', e); process.exit(1) })
