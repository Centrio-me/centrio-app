const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')

// Generous per-account limit — this endpoint is designed for frequent pushes
// (desktop fires on every unread-count change), so it needs its own budget
// separate from the shared global /api/ IP limiter, which a busy TEAM office
// behind one NAT IP could otherwise exhaust for everyone at that address.
// Keyed on req.user.id (populated by authMiddleware, which runs first on the
// route below) so accounts sharing an office IP each get their own budget;
// falls back to req.ip only if req.user is somehow unavailable.
const unreadPushLimiter = rateLimit({
  name: 'unread-summary-push',
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip
})

// POST /api/unread-summary — Electron pushes the user's own personal
// unread summary (see renderer/assistant-tools.js get_unread_summary() for
// the client-side shape this mirrors: { total, byMessenger: [{id,name,unread}] }).
// Deliberately separate from POST /api/sync, which deleteMany+recreates
// Messenger/Folder/Workspace config rows on every call — bolting a
// constantly-changing counter onto that would mean either re-syncing config
// on every unread change, or always sending full config alongside a highly
// frequent counter push. One row per user, upserted.
router.post('/', authMiddleware, unreadPushLimiter, async (req, res) => {
  try {
    const { total, byMessenger } = req.body || {}
    if (typeof total !== 'number' || !Number.isFinite(total) || total > 2147483647 || !Array.isArray(byMessenger)) {
      return res.status(400).json({ error: 'total (number) и byMessenger (array) обязательны' })
    }

    const sanitizedTotal = Math.max(0, Math.floor(total))
    const sanitizedByMessenger = byMessenger.slice(0, 200).map(m => ({
      id: String(m?.id ?? '').slice(0, 200),
      name: String(m?.name ?? '').slice(0, 100),
      unread: Math.max(0, Math.floor(Number(m?.unread) || 0))
    }))

    await prisma.unreadSummary.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, total: sanitizedTotal, byMessenger: sanitizedByMessenger },
      update: { total: sanitizedTotal, byMessenger: sanitizedByMessenger }
    })

    res.json({ message: 'Сводка непрочитанных обновлена' })
  } catch (err) {
    console.error('Unread summary push error:', err)
    res.status(500).json({ error: 'Ошибка сохранения сводки непрочитанных' })
  }
})

// GET /api/unread-summary — mobile app reads the last snapshot the desktop
// app pushed. Returns a zeroed default (never 404) when nothing has been
// pushed yet — e.g. a brand-new account, or one whose desktop app predates
// this feature — so the mobile Feed screen always has a well-formed
// response to render instead of needing its own "not found" branch.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const summary = await prisma.unreadSummary.findUnique({ where: { userId: req.user.id } })
    res.json({
      total: summary?.total || 0,
      byMessenger: summary?.byMessenger || [],
      updatedAt: summary?.updatedAt || null
    })
  } catch (err) {
    console.error('Unread summary get error:', err)
    res.status(500).json({ error: 'Ошибка получения сводки непрочитанных' })
  }
})

module.exports = router
