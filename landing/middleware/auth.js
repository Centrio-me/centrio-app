const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')

// Порог, после которого lastSeenAt считается устаревшим и достоин
// перезаписи. Раньше lastSeenAt обновлялся ТОЛЬКО при логине и при ротации
// refresh-токена (см. utils/tokens.js generateRefreshToken) — access-токен
// живёт 4 часа, так что реально активный пользователь, который просто
// продолжает работать в уже открытом приложении, не трогал lastSeenAt
// часами. Админка считает "онлайн сейчас" по lastSeenAt моложе 5 минут
// (см. routes/admin.js isOnline) — из-за этого счётчик почти всегда
// показывал 0-1, хотя реально онлайн было несколько человек.
const LAST_SEEN_STALE_MS = 2 * 60 * 1000

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Токен не предоставлен' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        plan: true,
        planExpiresAt: true,
        isActive: true,
        lastSeenAt: true
      }
    })

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Пользователь не найден или заблокирован' })
    }

    // Троттлинг: не пишем в БД на каждый запрос (десктоп-клиент дёргает API
    // часто) — обновляем максимум раз в LAST_SEEN_STALE_MS. Fire-and-forget —
    // не блокирует и не замедляет ответ на реальный запрос.
    const isStale = !user.lastSeenAt || (Date.now() - new Date(user.lastSeenAt).getTime()) > LAST_SEEN_STALE_MS
    if (isStale) {
      prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
        .catch(err => console.error('[auth] lastSeenAt update failed:', err.message))
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Невалидный токен' })
  }
}
