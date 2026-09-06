const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
const { createTicketTopic, postTicketMessage, reopenTicketTopic, escapeHtml } = require('../lib/telegram-bot')

// Support tickets — authenticated user-facing thread endpoints. Admin-facing
// counterparts (list all, reply, close/reopen) live in admin-routes.js,
// mirroring the promo-codes CRUD split already used there.
//
// Status lifecycle: OPEN (new, awaiting admin) -> ANSWERED (admin replied,
// awaiting user) -> CLOSED (resolved). A user reply on an ANSWERED or CLOSED
// ticket flips it back to OPEN so it resurfaces in the admin queue — see
// POST /:id/messages below.

const MAX_SUBJECT_LEN = 200
const MAX_BODY_LEN = 5000

const createTicketLimiter = rateLimit({ name: 'tickets-create', windowMs: 60 * 60 * 1000, max: 10 })
const replyLimiter        = rateLimit({ name: 'tickets-reply',  windowMs: 60 * 60 * 1000, max: 30 })

// POST /api/tickets — create a new ticket + first message
router.post('/', createTicketLimiter, authMiddleware, async (req, res) => {
  try {
    const { subject, body } = req.body
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'Укажите тему обращения' })
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Введите сообщение' })
    }
    if (subject.length > MAX_SUBJECT_LEN) {
      return res.status(400).json({ error: `Тема слишком длинная (максимум ${MAX_SUBJECT_LEN} символов)` })
    }
    if (body.length > MAX_BODY_LEN) {
      return res.status(400).json({ error: `Сообщение слишком длинное (максимум ${MAX_BODY_LEN} символов)` })
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user.id,
        subject: subject.trim(),
        status: 'OPEN',
        messages: { create: [{ isAdmin: false, body: body.trim() }] }
      },
      include: { messages: true }
    })

    res.status(201).json(ticket)

    // Fire-and-forget: mirror into the Telegram tickets forum after
    // responding, so a slow/unavailable Telegram API never delays ticket
    // creation for the user. Failure here is logged, not surfaced.
    ;(async () => {
      try {
        const threadId = await createTicketTopic(ticket)
        if (!threadId) return
        await prisma.ticket.update({ where: { id: ticket.id }, data: { telegramTopicId: threadId } })
        await postTicketMessage(threadId,
          `<b>Новое обращение</b>\n` +
          `От: ${escapeHtml(req.user.email)}\n\n` +
          escapeHtml(body.trim()))
      } catch (e) { console.error('[tickets] telegram sync (create) failed:', e.message) }
    })()
  } catch (err) {
    console.error('Ticket create error:', err.message)
    res.status(500).json({ error: 'Ошибка создания обращения' })
  }
})

// GET /api/tickets — list own tickets (no message bodies, just latest state)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { userId: req.user.id },
      select: {
        id: true, subject: true, status: true, createdAt: true, updatedAt: true,
        _count: { select: { messages: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })
    res.json({ tickets })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения обращений' })
  }
})

// GET /api/tickets/:id — full thread, ownership-checked
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' })
    res.json(ticket)
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения обращения' })
  }
})

// POST /api/tickets/:id/messages — user reply; re-opens ANSWERED/CLOSED tickets
router.post('/:id/messages', replyLimiter, authMiddleware, async (req, res) => {
  try {
    const { body } = req.body
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Введите сообщение' })
    }
    if (body.length > MAX_BODY_LEN) {
      return res.status(400).json({ error: `Сообщение слишком длинное (максимум ${MAX_BODY_LEN} символов)` })
    }

    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' })

    const wasClosed = ticket.status === 'CLOSED'

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, isAdmin: false, body: body.trim() } }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } })
    ])

    res.status(201).json(message)

    // Fire-and-forget Telegram mirror — see POST / above for rationale.
    ;(async () => {
      try {
        if (!ticket.telegramTopicId) return
        if (wasClosed) await reopenTicketTopic(ticket.telegramTopicId)
        await postTicketMessage(ticket.telegramTopicId,
          `<b>Пользователь ответил</b>\n\n${escapeHtml(body.trim())}`)
      } catch (e) { console.error('[tickets] telegram sync (reply) failed:', e.message) }
    })()
  } catch (err) {
    console.error('Ticket reply error:', err.message)
    res.status(500).json({ error: 'Ошибка отправки сообщения' })
  }
})

module.exports = router
