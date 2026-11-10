const axios = require('axios')
const prisma = require('../utils/prisma')
const { sendTicketReplyEmail } = require('./email')
const { postTicketMessage, closeTicketTopic, escapeHtml } = require('./telegram-bot')
const { KNOWLEDGE } = require('./support-knowledge')
const ticketFiles = require('./ticket-files')

// Support auto-responder (2026-09-29, live request: "давай к поддержке
// прикрутим уже полноценного бота. Вопросики некоторые (простые) чтобы он
// сам закрывал") — reuses the SAME LLM proxy already paid for and
// configured for the Pro in-app AI assistant (see routes/assistant.js's
// header comment for the "why Agent Platform / why this model" reasoning);
// this module is deliberately a separate, narrower prompt/call, not a
// shared function with the assistant route, since the assistant answers
// freeform product-control questions from an authenticated Pro user while
// this triages a brand-new, possibly-anonymous-sounding support ticket and
// must be far more conservative about what it's willing to auto-answer.
//
// REWORKED (2026-09-30, live request: "бот печатает и если ответить не
// может - просто ничего не приходит. Пусть пишет, что вопрос передан
// специалисту... но сначала уточняющие вопросы задаст"): the bot no longer
// just answers-or-stays-silent. It now picks one of three actions each
// turn — answer / clarify / escalate — and NEVER leaves the customer
// without a reply. See classifyAndMaybeAnswer's system prompt for the
// exact contract, and Ticket.botStage (schema.prisma) for how a single
// round of clarifying questions is capped before a forced handoff.
const AGENT_PLATFORM_BASE_URL = process.env.AGENTPLATFORM_BASE_URL || 'https://api.agentplatform.ru/v1'
const AGENT_PLATFORM_API_KEY  = process.env.AGENTPLATFORM_API_KEY
// Own env var (falls back to the assistant's) so the model used for ticket
// triage can be tuned independently later without touching the paid
// assistant's config.
//
// REWORKED (2026-11-10, owner: «Бот там какой-то неполноценный. Он может шире общаться и давать норм советы?»):
// the bot used to answer only what the facts covered word for word, ask one question, and fall silent after a
// handoff — a customer with a blank Telegram tab behind a Hong Kong VPN got nothing useful. Now it is a real first
// line: it uses general technical knowledge (networks, VPN, Windows, the web versions of messengers) for
// troubleshooting, keeps the conversation going until a human from the team writes in the ticket, knows the
// customer's plan, answers in the language of the customer's latest message, and closes the ticket only when the
// customer confirms it is solved. Centrio's own menus and features still come only from the facts.
const SUPPORT_BOT_MODEL = process.env.SUPPORT_BOT_MODEL || 'openai/gpt-5.2'
// GPT-5 and o-series models accept only their default temperature
const FIXED_TEMPERATURE_MODELS = ['openai/gpt-5', 'openai/o1', 'openai/o3', 'openai/o4']
const tuning = (temperature) => (FIXED_TEMPERATURE_MODELS.some((prefix) => SUPPORT_BOT_MODEL.startsWith(prefix)) ? {} : { temperature })
// The bot stops after this many of its own messages in one ticket: a person takes over from there.
const MAX_BOT_TURNS = 8

// Kept in one place, in plain language, specifically so it's easy to keep
// in sync by hand when pricing/plans change (same "no shared module, sync
// by comment" convention already used elsewhere in this codebase between
// org-routes.js/team-server.tsx/auto-renew-cron.js for TEAM pricing).
const PRODUCT_FACTS = `
Centrio is a desktop app (Windows 10/11, macOS 12+, Linux — AppImage and .deb) that brings messengers, email and other web services into one window, so people don't have to keep separate apps or browser tabs open for each one.

Plans:
- Free: up to 3 services from the built-in catalog, notifications with quiet mode, tasks and a mini player, built-in VPN/proxy, PIN lock, background updates. No time limit — it's a real free tier, not a trial.
- Pro: 199 RUB/month, or paid yearly at ~133 RUB/month (1590 RUB/year total) — or, for international customers paying by EU/US card, 4 EUR/month or ~3.33 EUR/month paid yearly. Adds: unlimited services, folders, split screen (two services side by side), notes (available right away, no need to enable anything in Settings → Extensions) with an AI assistant, quick replies (saved text templates — address, opening hours, prices — copied to the clipboard with one click), sync across devices, adding your own custom web services (not just the catalog), Chrome extensions, AdBlock, themes and custom notification sounds. Cancels anytime, no long-term commitment.
- Team: for organizations, minimum 5 seats, billed per seat — 389 RUB/seat/month, or 349 RUB/seat/month paid yearly (4188 RUB/seat/year) — or 8 EUR/seat/month, or 7 EUR/seat/month paid yearly for EU/US cards. Adds a shared team console with roles, per-employee messenger assignment, a shared VPN for the whole team, a custom company logo instead of the default Centrio one, and an audit log with engagement stats. Team also adds: shared quick replies the owner sets for all employees, and "client is waiting" alerts — if a message in a messenger assigned to an employee stays unread longer than the owner allows, the owner is notified in the Centrio app, by email or in Telegram (wait time, repeat reminders, working hours, which employees and messengers to watch are all configurable). Centrio only sees read/unread status for this, never message content.

How-to — quick replies: click the lightning icon in the right-hand panel of the app, press + to add a reply (a name and up to 2000 characters of text, line breaks are kept); clicking a reply copies its text, then paste it into any chat with Ctrl+V (⌘V on Mac). Personal replies sync between the user's devices. Team owners/admins manage shared replies at centrio.me/team, "Quick replies" tab.

How-to — "client is waiting" alerts (Team owners only): centrio.me/team, "Alerts" tab — turn alerts on, pick the wait time, repeats and working hours, choose channels (in-app, email, Telegram — for Telegram press "Connect Telegram" and then Start in the bot), and use "Send a test" to check delivery.

How-to — tasks for employees (Team plan only): the owner or an admin opens centrio.me/team, "Tasks" tab (or the Tasks panel in the app, "From your manager" block), picks an employee, types the task, optionally details/due date/"Urgent", and presses "Assign task". The employee gets a red dot on the Tasks icon plus a sound and a system notification, finds the task in Tasks → "From your manager" and ticks it when done; the manager sees the status (and whether it was opened) on the same tab. Every task has a comment thread: the employee and the manager both write comments (the Tasks panel in the app or the Tasks tab on the website), a new comment from the other side gives a red dot and a sound, and the employee can press "Mark done" to finish the task together with a short result note. Owners do not get messengers assigned to themselves — they set up their own messengers in the app. Pro users do not have this section.

Refunds: fully self-service — no need to wait for a human. Within 14 days of a payment, the customer can request a refund themselves from their account's billing/payments history in the Centrio dashboard (centrio.me/dashboard). There's a "Refund" action right next to the payment.

Cancelling auto-renewal: also self-service, from the same dashboard billing area — turning off auto-renew just stops the NEXT charge; the current paid period keeps working until it ends.

Privacy: the customer signs into the actual web version of each of their own services (Telegram Web, Gmail, etc.) — Centrio does not read, store or have access to the content of their conversations or emails. Full details are at centrio.me/privacy.

Support email for anything this can't answer: support@centrio.me
`.trim()

const CATEGORY_HINTS = {
  support: 'The customer chose the topic "Support": they need help with something that does not work or that they cannot do.',
  idea: 'The customer chose the topic "Suggest a feature". First check the facts: if the app ALREADY does what they ask, say so and explain how to use it (action "answer"). Otherwise thank them warmly, say the idea is recorded and passed to the product team (action "escalate"). Never promise that it will be built or give dates.',
  bug: 'The customer chose the topic "Found a bug". If the facts contain a known fix or a check list that matches the symptom, give the steps (action "answer") and ask them to reply in this ticket if it did not help. Otherwise ask 1-2 precise questions (action "clarify") when key details are missing, or hand over to a human (action "escalate"). A screenshot, if attached, is evidence: describe what you see in it that matters.',
  question: 'The customer chose the topic "Question about features": answer from the facts as completely and concretely as possible (menu paths, steps, shortcuts). If the facts do not cover it, escalate.'
}

function buildSystemPrompt(allowClarify, category) {
  const categoryLine = CATEGORY_HINTS[category] ? CATEGORY_HINTS[category] + '\n\n' : ''
  const clarifyLine = allowClarify
    ? '- "clarify": you need details before you can help. Ask 1-3 short, specific questions (what exactly happens, which service/tab, OS and Centrio version — Settings, section About —, the exact error text, VPN/proxy on or off, since when). If you can already suggest a first safe step, give it together with the questions.'
    : '- "clarify" is not available here: choose "answer" or "escalate".'
  return `You are the support engineer of Centrio, a desktop app that puts messengers, mail and other web services into one window (each service is its real website in an embedded Chromium tab with its own isolated session). You talk to a customer inside a support ticket. People from the Centrio team read every ticket; be honest that you are the Centrio support assistant (a bot) when it matters, never pretend to be a human.

Your goal: actually solve the customer's problem, like a skilled, friendly support engineer would — not just route tickets.

${categoryLine}WHAT YOU KNOW ABOUT CENTRIO (the only source for Centrio's own menus, buttons, features, prices and rules — never invent a Centrio setting, menu item, feature, price, deadline or promise that is not here):
${PRODUCT_FACTS}

${KNOWLEDGE}

GENERAL KNOWLEDGE YOU MAY USE: for troubleshooting you can and should use your general technical knowledge — internet and DNS problems, VPNs and proxies (a VPN server that cannot reach a service, blocked regions, switching servers or protocols), firewalls and antivirus, Windows/macOS/Linux settings (notifications, focus assist, display scaling, permissions), and how the web versions of services behave (web.telegram.org, web.whatsapp.com, web.max.ru, Gmail…: QR login, linked devices, sessions, outages). Give concrete, safe steps in a sensible order (most likely cause first), and say what each result would mean. Combine general steps with Centrio's own tools from the facts (reload the tab — Ctrl+R or the reload button, put the tab to sleep and wake it, the built-in VPN, updating Centrio).

Pick exactly ONE action for this turn:

- "answer": you can help now — a question about Centrio covered by the facts, or a problem you can troubleshoot with concrete steps. Give a complete, practical reply and ask them to tell you the result.
${clarifyLine}
- "escalate": a person from the team is needed: payments, refunds outside the self-service rules, double charges, account deletion or data requests, a forgotten PIN or master password, Team/business/partnership deals, a bug that persists after the reasonable steps were tried (or that clearly is a Centrio defect), the customer asks for a human, or they are angry. Still be useful: say plainly that you have passed the ticket to a specialist who will reply here, and — when it helps — add what they can try meanwhile or what details will speed things up. Do not promise a result or a time: never say that money will be returned, that something will be fixed or added, or when — only that a specialist will look into it and reply here.
- "resolved": the customer confirms the problem is solved or just thanks you and has nothing more. Reply with a short warm closing.

The conversation so far is below. If you already handed the ticket over earlier, do not repeat the handoff sentence — keep helping with the new message. Use what the customer already told you; never ask for something they already gave. If a person from the team already answered in the thread, stay consistent with them.

CENTRIO NAMES AND PLACES: name a Centrio button, menu, section, page or shortcut only if it is written in the facts, and place it exactly where the facts say (for example the built-in VPN button is in the bottom-right area). If the facts do not say where something is, describe it without inventing a path.

SAFE ADVICE: never suggest removing a service, clearing its data or signing out as a casual step — that logs the customer out of that messenger. Only as a last resort, and then warn that they will have to sign in again (QR code or phone number).

Screenshots: you can see them. Read error texts and describe what you notice that matters (e.g. "the Telegram tab is completely white").

LANGUAGE: write in the language of the customer's LATEST message. If that message has no real words (only a screenshot, a version number, an emoji), use the language of their earlier messages or of the ticket subject; if it is still unclear, write in Russian. Never mix languages in one reply.

STYLE: warm, plain words, no marketing, no filler. Use numbered steps for instructions. Up to about 12 short lines; shorter when a short answer is enough. No signature with a name.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"action": "answer" | "clarify" | "escalate" | "resolved", "reply": "your reply text"}`
}

const PLAN_NAMES = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' }

function buildTranscript(ticket, messages, customer) {
  const lines = [`Ticket subject: ${ticket.subject}`]
  if (ticket.category) lines.push(`Topic chosen by the customer: ${ticket.category}`)
  if (customer) {
    const until = customer.planExpiresAt ? `, paid until ${customer.planExpiresAt.toISOString().slice(0, 10)}` : ''
    lines.push(`Customer's account: plan ${PLAN_NAMES[customer.plan] || customer.plan}${until}, registered ${customer.createdAt.toISOString().slice(0, 10)}.`)
  }
  lines.push('')
  for (const m of messages) {
    const shots = m.attachments && m.attachments.length ? ` [${m.attachments.length} screenshot(s) attached]` : ''
    const who = m.isAdmin ? (m.isBot ? 'Centrio bot (you, earlier)' : 'Centrio team member') : 'Customer'
    lines.push(`${who}: ${m.body || '(no text)'}${shots}`)
  }
  lines.push('', replyLanguageLine(ticket, messages))
  return lines.join('\n')
}

// Models drift to the language of the subject or of earlier messages; the reply must follow what the customer
// wrote last (a Chinese subject, then English messages → English).
// Real words, not "V3.7.3 win11": any Chinese/Japanese/Korean/Cyrillic letters, or two Latin words without digits.
function hasWords(text) {
  const s = String(text || '')
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}]/u.test(s)) return true
  return s.split(/\s+/).filter((w) => /^\p{L}{2,}[.,!?]*$/u.test(w) && !/^(win|windows|mac|macos|linux|ubuntu|ok|v)$/i.test(w.replace(/[.,!?]+$/, ''))).length >= 2
}

function replyLanguageLine(ticket, messages) {
  const words = [...messages].reverse().find((m) => !m.isAdmin && hasWords(m.body))
  if (words) return `REPLY LANGUAGE: the customer's latest words are "${String(words.body).slice(0, 200)}" — write the whole reply in the language of these words.`
  if (hasWords(ticket.subject)) return `REPLY LANGUAGE: the customer has written no words yet; write in the language of the ticket subject "${ticket.subject}".`
  return 'REPLY LANGUAGE: the customer has written no words yet; write in Russian.'
}

// Screenshots of the customer's latest messages as data URIs (at most 4, small ones only).
const MAX_VISION_IMAGES = 4
const MAX_VISION_BYTES = 6 * 1024 * 1024

function collectImageParts(messages) {
  const parts = []
  let total = 0
  for (const m of [...messages].reverse()) {
    if (m.isAdmin || !m.attachments) continue
    for (const name of m.attachments) {
      if (parts.length >= MAX_VISION_IMAGES) return parts
      const buf = ticketFiles.readFile(name)
      if (!buf || total + buf.length > MAX_VISION_BYTES) continue
      total += buf.length
      parts.push({ type: 'image_url', image_url: { url: `data:${ticketFiles.mimeOf(name)};base64,${buf.toString('base64')}` } })
    }
  }
  return parts
}

async function callModel(ticket, messages, allowClarify, withImages, customer) {
  const transcript = buildTranscript(ticket, messages, customer)
  const images = withImages ? collectImageParts(messages) : []
  const userContent = images.length ? [{ type: 'text', text: transcript }, ...images] : transcript
  return axios.post(`${AGENT_PLATFORM_BASE_URL}/chat/completions`, {
    model: SUPPORT_BOT_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(allowClarify, ticket.category) },
      { role: 'user', content: userContent }
    ],
    ...tuning(0.3),
    response_format: { type: 'json_object' }
  }, {
    headers: { Authorization: `Bearer ${AGENT_PLATFORM_API_KEY}` },
    timeout: 45000
  })
}

async function classifyAndMaybeAnswer(ticket, messages, { allowClarify, customer = null }) {
  if (!AGENT_PLATFORM_API_KEY) return null

  let upstream
  try {
    try {
      upstream = await callModel(ticket, messages, allowClarify, true, customer)
    } catch (e) {
      // The model may refuse images; retry once as text only so the customer still gets an answer.
      console.error('[support-bot] upstream call with images failed, retrying text-only:', e.message)
      upstream = await callModel(ticket, messages, allowClarify, false, customer)
    }
  } catch (e) {
    console.error('[support-bot] upstream call failed:', e.message, JSON.stringify(e.response?.data || '').slice(0, 400))
    return null
  }


  const raw = upstream?.data?.choices?.[0]?.message?.content
  if (!raw) return null

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error('[support-bot] could not parse model output as JSON:', raw.slice(0, 200))
    return null
  }

  let action = parsed?.action
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim() : ''
  if (!reply) return null

  const validActions = allowClarify ? ['answer', 'clarify', 'escalate', 'resolved'] : ['answer', 'escalate', 'resolved']
  if (!validActions.includes(action)) {
    // Defensive fallback — an unexpected/disallowed action (including the
    // model trying "clarify" on a second pass) is treated as "escalate"
    // rather than silently discarded, matching the whole point of this
    // rework: the customer always gets SOME reply, never silence.
    action = 'escalate'
  }

  // Defensive cap — this is meant to be a short reply, not an essay; a
  // runaway response is a sign something went wrong upstream, not
  // something we want posted verbatim to a customer.
  return { action, reply: reply.slice(0, 3000) }
}

// Shared by both entry points below — decides+posts the bot's turn and
// updates ticket state accordingly. `messages` must already include the
// customer's latest message (the one triggering this call).
// When the model is unreachable or returns nothing usable, the customer still gets an
// honest reply and the ticket goes to a human: no ticket is ever left in silence.
const FALLBACK_RESULT = {
  action: 'escalate',
  reply: 'Спасибо, обращение принято! Наша команда уже видит его и ответит вам здесь. Ни одно обращение не остаётся без ответа.\n\nThank you, your request has been received. Our team can see it and will reply here. No request is ever left unanswered.'
}

async function runBotTurn(ticket, messages) {
  const allowClarify = true
  const typingSetAt = new Date(Date.now() + 20000)
  await prisma.ticket.update({ where: { id: ticket.id }, data: { typingUntil: typingSetAt, typingBy: 'bot' } }).catch(() => {})

  try {
    const customer = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { plan: true, planExpiresAt: true, createdAt: true } }).catch(() => null)
    const result = (await classifyAndMaybeAnswer(ticket, messages, { allowClarify, customer })) || FALLBACK_RESULT

    const { action, reply } = result
    // The ticket closes only when the customer says it is solved; after an answer it waits for them, and the bot
    // keeps talking on their next message (botStage CLARIFYING = the bot is in the conversation).
    const statusByAction = { answer: 'ANSWERED', clarify: 'ANSWERED', escalate: 'OPEN', resolved: 'CLOSED' }
    const botStageByAction = { answer: 'CLARIFYING', clarify: 'CLARIFYING', escalate: 'ESCALATED', resolved: null }

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, isAdmin: true, isBot: true, body: reply } }),
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: statusByAction[action],
          botStage: botStageByAction[action],
          typingUntil: null,
          typingBy: null
        }
      })
    ])

    const user = await prisma.user.findUnique({ where: { id: ticket.userId } })
    if (user) {
      sendTicketReplyEmail(user, ticket, reply)
        .catch((e) => console.error('[support-bot] reply email failed:', e.message))
    }

    console.log(`[support-bot] action=${action} ticket=${ticket.id}`)

    if (ticket.telegramTopicId) {
      const labels = { answer: '🤖 Бот ответил', clarify: '🤖 Бот уточняет детали', escalate: '🤖 Бот передал обращение специалисту', resolved: '🤖 Клиент подтвердил, что решено — бот закрыл обращение' }
      postTicketMessage(ticket.telegramTopicId, `<b>${labels[action]}</b>\n\n${escapeHtml(reply)}`)
        .then(() => { if (action === 'resolved') return closeTicketTopic(ticket.telegramTopicId) })
        .catch((e) => console.error('[support-bot] telegram sync failed:', e.message))
    }

    return message
  } catch (e) {
    console.error('[support-bot] runBotTurn failed:', e.message)
    return null
  } finally {
    // Covers every path that returned before reaching the transaction
    // above (no API key, upstream failure, unparsable output, empty
    // reply, thrown error) — the success path already cleared it as part
    // of its own transaction, so this is a harmless redundant no-op there.
    await prisma.ticket.update({ where: { id: ticket.id }, data: { typingUntil: null, typingBy: null } }).catch(() => {})
  }
}

// Called fire-and-forget right after a new ticket is created (see
// routes/tickets.js's POST /) — never blocks or affects the ticket-creation
// response the customer already got. Failure anywhere in here just means
// the ticket stays OPEN for a human, same as if the bot had never run.
async function maybeAutoAnswerNewTicket(ticket, questionBody, attachments = []) {
  return runBotTurn(ticket, [{ isAdmin: false, isBot: false, body: questionBody, attachments }])
}

// Called fire-and-forget after a customer replies to an EXISTING ticket
// (see routes/tickets.js's POST /:id/messages) — but only when the ticket
// is still in the bot's hands (botStage === 'CLARIFYING'; the caller
// checks this before invoking, mirrored here as a defensive guard too, so
// this function is never the thing that lets the bot barge back into a
// ticket a human is already handling).
async function maybeContinueBotConversation(ticket) {
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' }
  })
  if (!botMayContinue(messages)) return null
  return runBotTurn(ticket, messages)
}

// The bot keeps the conversation going until a person from the team writes in the ticket (from then on it is
// theirs), and gives up after MAX_BOT_TURNS of its own messages.
function botMayContinue(messages) {
  if (messages.some((m) => m.isAdmin && !m.isBot)) return false
  return messages.filter((m) => m.isAdmin && m.isBot).length < MAX_BOT_TURNS
}

// A draft for a human agent: it goes into the reply field in the web admin and is never sent by itself.
async function draftReply(ticket, messages, customer) {
  if (!AGENT_PLATFORM_API_KEY) return null
  const images = collectImageParts(messages)
  const transcript = buildTranscript(ticket, messages, customer)
  const response = await axios.post(`${AGENT_PLATFORM_BASE_URL}/chat/completions`, {
    model: SUPPORT_BOT_MODEL,
    messages: [
      { role: 'system', content: `You draft a reply for a human support agent of Centrio. The agent reads and edits it before sending. Centrio's own menus, features, prices and rules come only from these facts; for troubleshooting use your general technical knowledge too (networks, VPN, operating systems, the web versions of messengers), with concrete steps. If a key detail is unknown, ask the customer a precise question instead of guessing. Never promise dates, refunds outside the rules, or features.

FACTS:
${PRODUCT_FACTS}

${KNOWLEDGE}

Write in the language of the customer's latest message (if it has no words, of their earlier messages; if unclear, Russian), warm and specific, numbered steps for instructions, up to 12 short lines. Output only the text of the reply, without a subject or a signature.` },
      { role: 'user', content: images.length ? [{ type: 'text', text: transcript }, ...images] : transcript },
    ],
    ...tuning(0.3),
  }, { headers: { Authorization: `Bearer ${AGENT_PLATFORM_API_KEY}` }, timeout: 45000 })
  const text = response.data?.choices?.[0]?.message?.content
  return typeof text === 'string' ? text.trim() : null
}

module.exports = { maybeAutoAnswerNewTicket, maybeContinueBotConversation, draftReply, classifyAndMaybeAnswer, botMayContinue, buildTranscript, replyLanguageLine }
