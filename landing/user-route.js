const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const bcrypt = require('bcryptjs')
const { rateLimit } = require('../middleware/rateLimit')

const deleteAccountLimiter = rateLimit({ name: 'user-delete-account', windowMs: 60 * 60 * 1000, max: 5 })
const exportLimiter        = rateLimit({ name: 'user-export-data',    windowMs: 60 * 60 * 1000, max: 5 })

// GET /api/user/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, avatar: true,
        plan: true, planExpiresAt: true, createdAt: true,
        _count: { select: { messengers: true, folders: true } }
      }
    })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения профиля' })
  }
})

// PUT /api/user/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, avatar } = req.body
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, avatar },
      select: { id: true, email: true, name: true, avatar: true, plan: true }
    })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления профиля' })
  }
})

// PUT /api/user/password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 8 символов' })
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (user.passwordHash) {
      if (!currentPassword) return res.status(400).json({ error: 'Введите текущий пароль' })
      const ok = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!ok) return res.status(401).json({ error: 'Неверный текущий пароль' })
    }
    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: hash } })
    res.json({ message: 'Пароль обновлён' })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления пароля' })
  }
})

// GET /api/user/devices — list active sessions
router.get('/devices', authMiddleware, async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user.id, expiresAt: { gt: new Date() } },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' }
    })

    // Parse user-agent into friendly device info
    const parsed = sessions.map(s => {
      const ua = s.deviceInfo || ''
      let os = 'Неизвестная ОС'
      let browser = ''
      let icon = '💻'

      if (/Windows/i.test(ua))      { os = 'Windows'; icon = '🖥️' }
      else if (/Macintosh|Mac OS/i.test(ua)) { os = 'macOS'; icon = '🍎' }
      else if (/Linux/i.test(ua))   { os = 'Linux'; icon = '🐧' }
      else if (/Android/i.test(ua)) { os = 'Android'; icon = '📱' }
      else if (/iPhone|iPad/i.test(ua)) { os = 'iOS'; icon = '📱' }
      else if (/Electron/i.test(ua)) { os = 'Centrio App'; icon = '⚡' }

      if (/Electron/i.test(ua))      browser = 'Centrio Desktop'
      else if (/Chrome/i.test(ua))   browser = 'Chrome'
      else if (/Firefox/i.test(ua))  browser = 'Firefox'
      else if (/Safari/i.test(ua))   browser = 'Safari'
      else if (/Edge/i.test(ua))     browser = 'Edge'

      return {
        id: s.id,
        os,
        browser,
        icon,
        ipAddress: s.ipAddress || '—',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        label: browser ? `${browser} · ${os}` : os
      }
    })

    res.json({ devices: parsed, total: parsed.length })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения устройств' })
  }
})

// DELETE /api/user/devices/:id — revoke session
router.delete('/devices/:id', authMiddleware, async (req, res) => {
  try {
    const session = await prisma.session.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    })
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' })
    await prisma.session.delete({ where: { id: req.params.id } })
    res.json({ message: 'Устройство отключено' })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка отключения устройства' })
  }
})

// GET /api/user/login-history — append-only log of successful logins,
// separate from GET /devices above (which only lists still-active Session
// rows). Session rows disappear on logout/revoke/30-day expiry, so this is
// the only place a user can see "someone logged in from an unfamiliar IP"
// after that session already ended. Written to from auth.js's
// recordLoginEvent() at every login/register/OAuth success site.
router.get('/login-history', authMiddleware, async (req, res) => {
  try {
    const events = await prisma.loginEvent.findMany({
      where: { userId: req.user.id },
      select: { id: true, provider: true, ipAddress: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    const PROVIDER_LABELS = {
      password: 'Пароль', google: 'Google', yandex: 'Яндекс',
      github: 'GitHub', telegram: 'Telegram'
    }

    const parsed = events.map(e => {
      const ua = e.userAgent || ''
      let os = 'Неизвестная ОС'
      let icon = '💻'

      if (/Windows/i.test(ua))               { os = 'Windows'; icon = '🖥️' }
      else if (/Macintosh|Mac OS/i.test(ua)) { os = 'macOS'; icon = '🍎' }
      else if (/Linux/i.test(ua))            { os = 'Linux'; icon = '🐧' }
      else if (/Android/i.test(ua))          { os = 'Android'; icon = '📱' }
      else if (/iPhone|iPad/i.test(ua))      { os = 'iOS'; icon = '📱' }
      if (/Electron/i.test(ua))              { os = 'Centrio App'; icon = '⚡' }

      return {
        id: e.id,
        provider: e.provider,
        providerLabel: PROVIDER_LABELS[e.provider] || e.provider,
        os,
        icon,
        ipAddress: e.ipAddress || '—',
        createdAt: e.createdAt
      }
    })

    res.json({ events: parsed, total: parsed.length })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения истории входов' })
  }
})

// DELETE /api/user/devices — revoke all except current
router.delete('/devices', authMiddleware, async (req, res) => {
  try {
    const { currentSessionId } = req.body
    await prisma.session.deleteMany({
      where: {
        userId: req.user.id,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {})
      }
    })
    res.json({ message: 'Все устройства отключены' })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка отключения устройств' })
  }
})

// GET /api/user/export — GDPR data export. Dumps everything we know is
// attached to the user via existing, confirmed relations (messengers,
// folders, sessions, payments). Session tokens/cookies themselves are
// deliberately excluded — only session metadata (device/IP/timestamps),
// same fields already exposed via GET /devices.
router.get('/export', exportLimiter, authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, avatar: true,
        plan: true, planExpiresAt: true, autoRenew: true, createdAt: true,
        messengers: true,
        folders: true,
        sessions: {
          select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true }
        },
        payments: {
          select: { id: true, amount: true, currency: true, status: true, provider: true, plan: true, months: true, createdAt: true }
        }
      }
    })
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

    res.setHeader('Content-Disposition', 'attachment; filename="centrio-data-export.json"')
    res.json({ exportedAt: new Date().toISOString(), user })
  } catch (err) {
    console.error('GDPR export error:', err.message)
    res.status(500).json({ error: 'Ошибка экспорта данных' })
  }
})

// DELETE /api/user/me — GDPR self-service account deletion.
//
// Deliberately anonymizes rather than hard-deletes: Payment rows are kept
// (many jurisdictions require retaining financial/tax records for years —
// see YooKassa receipt data above), but with `userId` no longer resolving
// to any identifiable person after this runs. Sessions/messengers/folders
// (the actual personal configuration data) are hard-deleted immediately.
//
// This also sidesteps a real risk: prisma.user.delete() on a live schema
// we can't fully introspect from here would throw FK constraint errors
// (P2003 — already observed on the admin delete route) for any relation
// we don't know about, potentially leaving a half-deleted user. Anonymize
// + explicit deleteMany on known relations is safe either way: on error
// the request just fails, nothing is silently left inconsistent.
router.delete('/me', deleteAccountLimiter, authMiddleware, async (req, res) => {
  try {
    const { password, confirmDelete } = req.body
    if (confirmDelete !== true) {
      return res.status(400).json({ error: 'Требуется подтверждение: confirmDelete: true' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

    if (user.passwordHash) {
      if (!password) return res.status(400).json({ error: 'Введите пароль для подтверждения' })
      const ok = await bcrypt.compare(password, user.passwordHash)
      if (!ok) return res.status(401).json({ error: 'Неверный пароль' })
    }

    const anonymizedEmail = `deleted-${user.id}@deleted.centrio.me`

    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.messenger.deleteMany({ where: { userId: user.id } }),
      prisma.folder.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: anonymizedEmail,
          name: null,
          avatar: null,
          passwordHash: null,
          googleId: null,
          yandexId: null,
          githubId: null,
          telegramId: null,
          vkId: null,
          mailId: null,
          isActive: false,
          autoRenew: false,
          autoRenewPayMethodId: null
        }
      })
    ])

    console.log(`[GDPR] User ${user.id} self-deleted (anonymized) at ${new Date().toISOString()}`)
    res.json({ message: 'Аккаунт удалён' })
  } catch (err) {
    console.error('GDPR self-delete error:', err.message)
    res.status(500).json({ error: 'Ошибка удаления аккаунта' })
  }
})

// GET /api/user/referrals — this user's own referral link id + stats.
// Referral "code" is just the user's own uuid id (see landing/lib/referral.js
// and the POST /register referralCode handling in auth-server.js) — no
// separate code table, so this endpoint just counts referrals rows already
// pointing at this user via referredById.
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const [totalReferred, bonusesGranted] = await Promise.all([
      prisma.user.count({ where: { referredById: req.user.id } }),
      prisma.user.count({ where: { referredById: req.user.id, referralBonusGranted: true } })
    ])
    res.json({
      referralCode: req.user.id,
      totalReferred,
      bonusesGranted,
      pending: totalReferred - bonusesGranted,
      bonusDays: 14
    })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения реферальной статистики' })
  }
})

module.exports = router
