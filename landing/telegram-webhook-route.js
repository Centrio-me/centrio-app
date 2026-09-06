// POST /api/telegram/webhook — receives updates from the Telegram Bot API
// for the private tickets forum supergroup, so an admin can reply to a
// support ticket directly from Telegram instead of the web dashboard.
//
// This is the one genuinely new *public, unauthenticated* attack surface
// added by the Telegram tickets integration (createTicketTopic/
// postTicketMessage in lib/telegram-bot.js are outbound-only calls the
// server makes, not exposed endpoints). Two independent checks gate it,
// both required:
//   1. `X-Telegram-Bot-Api-Secret-Token` header must match
//      TELEGRAM_WEBHOOK_SECRET — set once via the `secret_token` param on
//      the `setWebhook` call, known only to Telegram and this server, and
//      compared with a timing-safe helper (not `===`, mirroring the
//      lockout/timing-safe pattern already used for admin TOTP).
//   2. The update's `chat.id` must equal TELEGRAM_TICKETS_CHAT_ID — even a
//      caller who somehow guessed/leaked the secret can't puppet an
//      arbitrary chat/ticket, only the one real tickets supergroup.
// Anything that fails either check, or isn't a plain text message inside a
// known forum topic, is a silent 200 (Telegram doesn't need to know why —
// returning errors just makes it retry) logged server-side for review.
const router = require('express').Router()
const crypto = require('crypto')
const prisma = require('../utils/prisma')
const { sendTicketReplyEmail } = require('../lib/email')

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const TICKETS_CHAT_ID = process.env.TELEGRAM_TICKETS_CHAT_ID || ''

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Body already parsed by the global express.json() middleware in index.js.
router.post('/webhook', async (req, res) => {
  // Always ack fast — Telegram redelivers on non-2xx / timeout.
  res.status(200).json({ ok: true })

  try {
    if (!WEBHOOK_SECRET) {
      console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not configured — rejecting all updates')
      return
    }
    const headerSecret = req.headers['x-telegram-bot-api-secret-token']
    if (!headerSecret || !timingSafeEqual(headerSecret, WEBHOOK_SECRET)) {
      console.warn('[telegram-webhook] bad/missing secret token, ip=', req.headers['x-forwarded-for'] || req.ip)
      return
    }

    const message = req.body && req.body.message
    if (!message || !message.text) return // ignore non-text updates (edits, stickers, service msgs, etc.)
    if (message.from && message.from.is_bot) return // never process the bot's own outgoing posts
    if (!message.chat || String(message.chat.id) !== String(TICKETS_CHAT_ID)) {
      console.warn('[telegram-webhook] chat_id mismatch (secret was valid), got=', message.chat && message.chat.id)
      return
    }
    if (!message.message_thread_id) return // not inside a ticket topic (e.g. General)

    const ticket = await prisma.ticket.findFirst({
      where: { telegramTopicId: message.message_thread_id },
      include: { user: { select: { id: true, email: true, name: true } } }
    })
    if (!ticket) {
      console.warn('[telegram-webhook] no ticket for message_thread_id=', message.message_thread_id)
      return
    }

    const [ticketMessage] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, isAdmin: true, body: String(message.text).trim() } }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'ANSWERED' } })
    ])

    console.log(`[telegram-webhook] ticket.reply via Telegram id=${ticket.id} from=${message.from?.username || message.from?.id}`)

    sendTicketReplyEmail(ticket.user, ticket, ticketMessage.body)
      .catch(e => console.error('[telegram-webhook] reply email failed:', e.message))
  } catch (err) {
    console.error('[telegram-webhook] handler error:', err.message)
  }
})

module.exports = router
