// POST /api/contact — "Написать в поддержку" form on the public FAQ page
// (see faq.tsx). Previously this form was pure UI fakery: handleSubmit did
// `await new Promise(r => setTimeout(r, 800))` and showed a fake success
// screen without ever making a network call — submitted questions went
// nowhere. This route makes it real: validates input, rate-limits abuse,
// and emails the support inbox via the shared Resend helper in lib/email.js.
//
// NOTE: actual delivery still depends on RESEND_API_KEY being configured in
// this server's .env — sendEmail() fails soft (returns { ok:false }) if it
// isn't set, same as every other email sender in this codebase. While that
// key is unset, email delivery silently no-ops (logged as a warning, per
// lib/email.js's fail-soft contract) — so every submission is ALSO appended
// to a durable local log file (CONTACT_LOG_FILE below) before the email is
// even attempted. That way "email didn't go out" never means "the question
// is gone forever": it's always recoverable from the log, and the visitor
// gets a truthful success response once their message is actually captured.
const fs = require('fs')
const path = require('path')
const router = require('express').Router()
const { rateLimit } = require('../middleware/rateLimit')
const { sendContactFormEmail } = require('../lib/email')

const CONTACT_LOG_DIR = path.join(__dirname, '..', 'data')
const CONTACT_LOG_FILE = path.join(CONTACT_LOG_DIR, 'contact-submissions.jsonl')

function logSubmission(entry) {
  try {
    if (!fs.existsSync(CONTACT_LOG_DIR)) fs.mkdirSync(CONTACT_LOG_DIR, { recursive: true })
    fs.appendFileSync(CONTACT_LOG_FILE, JSON.stringify(entry) + '\n')
    return true
  } catch (err) {
    console.error('[contact] failed to persist submission to log file:', err.message)
    return false
  }
}

// Unauthenticated public endpoint — same posture as /api/visitors/*: no
// throttle previously existed anywhere for this because the route didn't
// exist at all. A tight window keeps this from being usable as a spam relay
// (Resend calls cost quota, and the recipient is a real human inbox).
const contactLimiter = rateLimit({ name: 'contact-form', windowMs: 60 * 60 * 1000, max: 5 })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, question } = req.body || {}

    if (!email || typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'Укажите корректный email' })
    }
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Опишите ваш вопрос' })
    }
    if (question.length > 4000) {
      return res.status(400).json({ success: false, error: 'Слишком длинное сообщение' })
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 200)) {
      return res.status(400).json({ success: false, error: 'Некорректное имя' })
    }

    const cleanName = (name || '').trim().slice(0, 200)
    const cleanEmail = email.trim()
    const cleanQuestion = question.trim().slice(0, 4000)

    // Persist first, regardless of email outcome. This is the durable
    // record — if the log write itself fails (disk/permissions issue),
    // that's the one case we still can't guarantee the message survives,
    // so it's the one case we still report as a real error to the visitor.
    const persisted = logSubmission({
      ts: new Date().toISOString(),
      name: cleanName,
      email: cleanEmail,
      question: cleanQuestion,
      ip: req.ip
    })

    if (!persisted) {
      return res.status(500).json({ success: false, error: 'Не удалось отправить сообщение, попробуйте позже' })
    }

    const result = await sendContactFormEmail({ name: cleanName, email: cleanEmail, question: cleanQuestion })

    if (!result.ok) {
      // Fail-soft at the email layer (e.g. RESEND_API_KEY not configured):
      // the message is already safely captured in the log file above, so
      // this is no longer a lost submission — just log it for visibility
      // and still tell the visitor truthfully that it was received.
      console.warn('[contact] sendContactFormEmail failed (submission still persisted to log):', result.reason)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('/contact error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка' })
  }
})

module.exports = router
