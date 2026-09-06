// Thin Telegram Bot API wrapper — no npm dependency, just fetch. Used for two
// distinct destinations, driven by separate env vars/tokens so a leak or
// misconfig of one never lets a caller write into the other:
//   1. TELEGRAM_TICKETS_BOT_TOKEN + TELEGRAM_TICKETS_CHAT_ID — the private
//      forum supergroup (is_forum:true) used for two-way support-ticket sync
//      (see tickets-server.js / admin-routes.js). The actual chat id lives
//      only in the server .env, not here — if it's ever rotated this
//      comment shouldn't need to change too.
//   2. TELEGRAM_NEWS_CHAT_ID (same bot token) — the public @centrioapp
//      broadcast channel used for app-news / new-article posts.
//
// All functions fail soft (return null / log + resolve) rather than throwing,
// matching the existing sendTicketReplyEmail() convention in lib/email.js —
// Telegram availability must never block the primary ticket/DB flow.

const TICKETS_BOT_TOKEN = process.env.TELEGRAM_TICKETS_BOT_TOKEN || ''
const TICKETS_CHAT_ID   = process.env.TELEGRAM_TICKETS_CHAT_ID || ''
const NEWS_CHAT_ID      = process.env.TELEGRAM_NEWS_CHAT_ID || '@centrioapp'

function apiUrl(method) {
  return `https://api.telegram.org/bot${TICKETS_BOT_TOKEN}/${method}`
}

async function call(method, params) {
  if (!TICKETS_BOT_TOKEN) {
    console.warn(`[telegram-bot] TELEGRAM_TICKETS_BOT_TOKEN not set, skipping ${method}`)
    return null
  }
  try {
    const res = await fetch(apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    const data = await res.json()
    if (!data.ok) {
      console.error(`[telegram-bot] ${method} failed:`, data.description || data)
      return null
    }
    return data.result
  } catch (err) {
    // Redact the bot token in case a low-level fetch error (DNS failure,
    // invalid-URL TypeError, undici connection error) embeds the full
    // request URL — Telegram's own JSON error bodies never include it, but
    // transport-level errors sometimes do.
    const safeMessage = TICKETS_BOT_TOKEN ? String(err.message).split(TICKETS_BOT_TOKEN).join('[redacted]') : err.message
    console.error(`[telegram-bot] ${method} error:`, safeMessage)
    return null
  }
}

// Truncate to Telegram's 4096-char message limit, leaving room for a suffix.
function clip(text, max = 3900) {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

// Messages are sent with parse_mode:'HTML' so admins get readable bold
// labels/links. Every piece of user-controlled text (ticket subject/body,
// user email/name) MUST be passed through this before being interpolated
// into a template string — otherwise a user could inject arbitrary HTML
// (e.g. a fake <a href> link) into the admin's Telegram client.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Creates a forum topic for a new ticket. Returns message_thread_id or null.
async function createTicketTopic(ticket) {
  if (!TICKETS_CHAT_ID) return null
  const name = clip(`#${ticket.id.slice(0, 8)} ${ticket.subject}`, 128)
  const result = await call('createForumTopic', { chat_id: TICKETS_CHAT_ID, name })
  return result ? result.message_thread_id : null
}

// Posts a message into an existing ticket's topic thread.
async function postTicketMessage(threadId, text) {
  if (!TICKETS_CHAT_ID || !threadId) return null
  return call('sendMessage', {
    chat_id: TICKETS_CHAT_ID,
    message_thread_id: threadId,
    text: clip(text),
    parse_mode: 'HTML'
  })
}

// Closes (but does not delete) the topic when a ticket is marked CLOSED.
async function closeTicketTopic(threadId) {
  if (!TICKETS_CHAT_ID || !threadId) return null
  return call('closeForumTopic', { chat_id: TICKETS_CHAT_ID, message_thread_id: threadId })
}

// Reopens the topic if a closed ticket receives a new user reply.
async function reopenTicketTopic(threadId) {
  if (!TICKETS_CHAT_ID || !threadId) return null
  return call('reopenForumTopic', { chat_id: TICKETS_CHAT_ID, message_thread_id: threadId })
}

// Posts a message to the public @centrioapp news channel (no thread — it's
// a broadcast channel, not a forum). Used for hand-written posts and for the
// article auto-poster.
async function postToNewsChannel(text, opts = {}) {
  if (!NEWS_CHAT_ID) return null
  return call('sendMessage', {
    chat_id: NEWS_CHAT_ID,
    text: clip(text),
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview || false
  })
}

module.exports = {
  createTicketTopic,
  postTicketMessage,
  closeTicketTopic,
  reopenTicketTopic,
  postToNewsChannel,
  escapeHtml
}
