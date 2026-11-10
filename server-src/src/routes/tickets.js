const router = require('express').Router()
const { notifyAdminTicket } = require('../lib/admin-push')
const multer = require('multer')
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
const { createTicketTopic, postTicketMessage, postTicketPhoto, reopenTicketTopic, escapeHtml } = require('../lib/telegram-bot')
const { maybeAutoAnswerNewTicket, maybeContinueBotConversation } = require('../lib/support-bot')
const ticketFiles = require('../lib/ticket-files')

// Support tickets — authenticated user-facing thread endpoints. Admin-facing
// counterparts (list all, reply, close/reopen) live in admin.js.
//
// Status lifecycle: OPEN (new, awaiting admin) -> ANSWERED (admin replied,
// awaiting user) -> CLOSED (resolved). A user reply on an ANSWERED or CLOSED
// ticket flips it back to OPEN so it resurfaces in the admin queue — see
// POST /:id/messages below. A new ticket is always visible to the admin queue
// at once; the support bot (lib/support-bot.js) answers first and hands the
// ticket to a human whenever it cannot help.
//
// 2026-10-10: tickets carry a category chosen before writing (support / idea /
// bug / question) and messages can carry up to 4 small images. Both endpoints
// accept JSON (older app versions) or multipart/form-data (field "images").

const MAX_SUBJECT_LEN = 200
const MAX_BODY_LEN = 5000
const CATEGORIES = ['support', 'idea', 'bug', 'question']
const CATEGORY_LABELS = { support: 'Поддержка', idea: 'Предложение функции', bug: 'Баг', question: 'Вопрос по функциям' }

const createTicketLimiter = rateLimit({ name: 'tickets-create', windowMs: 60 * 60 * 1000, max: 10 })
const replyLimiter        = rateLimit({ name: 'tickets-reply',  windowMs: 60 * 60 * 1000, max: 30 })

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ticketFiles.MAX_BYTES, files: ticketFiles.MAX_FILES }
}).array('images', ticketFiles.MAX_FILES)

// multipart only when the client sent it; plain JSON keeps working untouched.
function optionalImages(req, res, next) {
  if (!req.is('multipart/form-data')) return next()
  imageUpload(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Картинка слишком большая (максимум 5 МБ)' })
    }
    if (err instanceof multer.MulterError && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
      return res.status(400).json({ error: `Можно прикрепить не больше ${ticketFiles.MAX_FILES} картинок` })
    }
    return res.status(400).json({ error: 'Не удалось загрузить картинки' })
  })
}

// Validates and stores the attached images; answers 400 itself on a bad file.
function storeImages(req, res) {
  try {
    return ticketFiles.saveImages(req.files || [])
  } catch (e) {
    if (e instanceof ticketFiles.TicketFileError) {
      res.status(400).json({ error: e.message })
      return null
    }
    throw e
  }
}

// Mirrors the attached images into the Telegram forum topic (fire-and-forget callers).
async function mirrorImages(threadId, names) {
  for (const name of names) {
    const buffer = ticketFiles.readFile(name)
    if (buffer) await postTicketPhoto(threadId, buffer, name)
  }
}

// POST /api/tickets — create a new ticket + first message
router.post('/', createTicketLimiter, authMiddleware, optionalImages, async (req, res) => {
  try {
    const { subject, body, category } = req.body
    const hasImages = Array.isArray(req.files) && req.files.length > 0
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'Укажите тему обращения' })
    }
    if ((!body || typeof body !== 'string' || !body.trim()) && !hasImages) {
      return res.status(400).json({ error: 'Введите сообщение' })
    }
    const text = typeof body === 'string' ? body.trim() : ''
    if (subject.length > MAX_SUBJECT_LEN) {
      return res.status(400).json({ error: `Тема слишком длинная (максимум ${MAX_SUBJECT_LEN} символов)` })
    }
    if (text.length > MAX_BODY_LEN) {
      return res.status(400).json({ error: `Сообщение слишком длинное (максимум ${MAX_BODY_LEN} символов)` })
    }
    if (category != null && category !== '' && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Неизвестная тема обращения' })
    }

    const attachments = storeImages(req, res)
    if (attachments === null) return

    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user.id,
        subject: subject.trim(),
        category: category || null,
        status: 'OPEN',
        messages: { create: [{ isAdmin: false, body: text, attachments }] }
      },
      include: { messages: true }
    })

    notifyAdminTicket(ticket, false).catch(e => console.error('[admin-push]', e.message))
    res.status(201).json(ticket)

    // Fire-and-forget: mirror into the Telegram tickets forum, then hand off
    // to the support bot — sequential so the bot already knows the real
    // telegramTopicId. Neither step delays the response the customer got.
    ;(async () => {
      try {
        const threadId = await createTicketTopic(ticket)
        if (threadId) {
          await prisma.ticket.update({ where: { id: ticket.id }, data: { telegramTopicId: threadId } })
          const label = category ? `\nТема: ${escapeHtml(CATEGORY_LABELS[category])}` : ''
          await postTicketMessage(threadId,
            `<b>Новое обращение</b>\n` +
            `От: ${escapeHtml(req.user.email)}${label}\n\n` +
            escapeHtml(text))
          await mirrorImages(threadId, attachments)
        }
      } catch (e) { console.error('[tickets] telegram sync (create) failed:', e.message) }

      try {
        const freshTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } })
        if (freshTicket) await maybeAutoAnswerNewTicket(freshTicket, text, attachments)
      } catch (e) { console.error('[tickets] support bot failed:', e.message) }
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
        id: true, subject: true, category: true, status: true, botStage: true, createdAt: true, updatedAt: true,
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
    // Computed here so the desktop client does not do clock-skew-sensitive date math.
    const isTyping = !!(ticket.typingUntil && new Date(ticket.typingUntil) > new Date())
    res.json({ ...ticket, isTyping, typingBy: isTyping ? ticket.typingBy : null })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения обращения' })
  }
})

// GET /api/tickets/:id/files/:name — an attached image, only for the ticket's owner
router.get('/:id/files/:name', authMiddleware, async (req, res) => {
  try {
    if (!ticketFiles.isValidName(req.params.name)) return res.status(404).json({ error: 'Файл не найден' })
    const owned = await prisma.ticketMessage.findFirst({
      where: { ticketId: req.params.id, attachments: { has: req.params.name }, ticket: { userId: req.user.id } },
      select: { id: true }
    })
    if (!owned) return res.status(404).json({ error: 'Файл не найден' })
    return ticketFiles.sendFile(res, req.params.name)
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения файла' })
  }
})

// POST /api/tickets/:id/messages — user reply; re-opens ANSWERED/CLOSED tickets
router.post('/:id/messages', replyLimiter, authMiddleware, optionalImages, async (req, res) => {
  try {
    const { body } = req.body
    const hasImages = Array.isArray(req.files) && req.files.length > 0
    if ((!body || typeof body !== 'string' || !body.trim()) && !hasImages) {
      return res.status(400).json({ error: 'Введите сообщение' })
    }
    const text = typeof body === 'string' ? body.trim() : ''
    if (text.length > MAX_BODY_LEN) {
      return res.status(400).json({ error: `Сообщение слишком длинное (максимум ${MAX_BODY_LEN} символов)` })
    }

    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' })

    const attachments = storeImages(req, res)
    if (attachments === null) return

    const wasClosed = ticket.status === 'CLOSED'

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, isAdmin: false, body: text, attachments } }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } })
    ])

    notifyAdminTicket(ticket, true).catch(e => console.error('[admin-push]', e.message))
    res.status(201).json(message)

    ;(async () => {
      try {
        if (!ticket.telegramTopicId) return
        if (wasClosed) await reopenTicketTopic(ticket.telegramTopicId)
        await postTicketMessage(ticket.telegramTopicId,
          `<b>Пользователь ответил</b>\n\n${escapeHtml(text)}`)
        await mirrorImages(ticket.telegramTopicId, attachments)
      } catch (e) { console.error('[tickets] telegram sync (reply) failed:', e.message) }
    })()

    // Bot follow-up (2026-11-10): the bot keeps the conversation going until a person from the team has written in
    // the ticket; maybeContinueBotConversation itself checks that (and its own turn limit).
    {
      ;(async () => {
        try {
          const freshTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } })
          if (freshTicket) await maybeContinueBotConversation(freshTicket)
        } catch (e) { console.error('[tickets] support bot continuation failed:', e.message) }
      })()
    }
  } catch (err) {
    console.error('Ticket reply error:', err.message)
    res.status(500).json({ error: 'Ошибка отправки сообщения' })
  }
})

module.exports = router
