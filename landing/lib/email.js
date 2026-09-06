// Shared email helper used across payments/auto-renew/GDPR flows.
//
// Deliberately uses Resend's plain HTTP API via axios instead of the
// `resend` npm package: axios is already a runtime dependency of
// centrio-api (see payments-server.js), so this needs zero new
// `npm install` on the server — the deploy scripts only push files over
// SFTP, they don't run package installs.
//
// Fails soft everywhere: if RESEND_API_KEY isn't configured, or the send
// fails, callers get `{ ok: false }` and a console warning instead of an
// exception — a broken email provider must never break a payment webhook
// or the auto-renew cron.
const axios = require('axios')

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_ADDRESS    = process.env.EMAIL_FROM || 'Centrio <noreply@centrio.me>'
const RESEND_API      = 'https://api.resend.com/emails'

async function sendEmail({ to, subject, html, replyTo }) {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not configured — skipping email "${subject}" to ${to}`)
    return { ok: false, reason: 'not_configured' }
  }
  if (!to) {
    console.warn(`[email] Missing recipient — skipping email "${subject}"`)
    return { ok: false, reason: 'no_recipient' }
  }
  try {
    await axios.post(RESEND_API, {
      from: FROM_ADDRESS, to, subject, html: wrapEmailHtml(html),
      ...(replyTo ? { reply_to: replyTo } : {})
    }, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 10000
    })
    return { ok: true }
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.response?.data || err.message)
    return { ok: false, reason: 'send_failed' }
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// Every template below only ever built a bare `<p>` fragment with no
// <!DOCTYPE>/<meta charset>. Resend's own MIME header usually declares UTF-8
// correctly, but several mail clients (older Outlook builds especially) fall
// back to sniffing the byte content when a document has no explicit charset
// declaration of its own — with Cyrillic text that sniffing routinely picks
// the wrong 8-bit codepage and renders as mojibake ("кракозябры"). Wrapping
// every outgoing email in one shared, fully-declared HTML document (plus a
// consistent Centrio-branded layout) fixes that at the source instead of
// per-template, and gives every email — including the OAuth welcome email —
// the same "not just a plain paragraph" look in one place.
function wrapEmailHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Centrio</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#3b82f6;padding:28px 32px;">
<span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Centrio</span>
</td></tr>
<tr><td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eee;">
<p style="margin:0;font-size:12px;color:#999;">Centrio — все ваши мессенджеры в одном окне. Вопросы: <a href="mailto:support@centrio.me" style="color:#3b82f6;">support@centrio.me</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

async function sendPaymentReceiptEmail(user, payment) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const amountLabel = `${payment.amount} ${payment.currency}`
  const planLabel    = payment.months === 12 ? '1 год' : `${payment.months} мес.`
  return sendEmail({
    to: user.email,
    subject: 'Оплата Centrio Pro прошла успешно',
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Ваш платёж на сумму <strong>${escapeHtml(amountLabel)}</strong> (${escapeHtml(planLabel)}) прошёл успешно.</p>
      <p>Centrio Pro активирован. Спасибо, что вы с нами!</p>
      <p style="color:#888;font-size:12px">Если это были не вы — напишите на support@centrio.me</p>
    `
  })
}

// Sent once, right after account creation — covers both password
// registration (POST /register) and the first-time-login branch of every
// OAuth provider (Google/Yandex/GitHub/Telegram). Deliberately fire-and-forget
// like the other senders here: a broken email provider must never fail
// or delay a registration/login response.
async function sendWelcomeEmail(user) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: user.email,
    subject: 'Добро пожаловать в Centrio',
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Спасибо, что зарегистрировались в Centrio — все ваши мессенджеры в одном окне.</p>
      <p>Если у вас появятся вопросы — просто ответьте на это письмо или напишите на support@centrio.me</p>
    `
  })
}

// Sent both right after password registration and on-demand from the
// dashboard's "Отправить письмо" button (see POST /auth/verify-email/send).
// token is a raw, single-use, time-limited (1h) secret minted by the caller —
// only its SHA-256 hash is ever persisted, so this function never touches
// the DB itself and can't leak the live token even via logs of this module.
async function sendVerificationEmail(user, token) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`
  return sendEmail({
    to: user.email,
    subject: 'Подтвердите email в Centrio',
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Подтвердите свой email, чтобы обезопасить аккаунт Centrio:</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 22px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Подтвердить email</a></p>
      <p style="color:#888;font-size:12px">Ссылка действительна 1 час. Если это были не вы — просто проигнорируйте это письмо.</p>
    `
  })
}

async function sendAutoRenewFailedEmail(user, reason) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: user.email,
    subject: 'Не удалось продлить подписку Centrio Pro',
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Попытка автоматического продления подписки Centrio Pro не удалась.</p>
      <p>Чтобы не потерять доступ к Pro-функциям, продлите подписку вручную в личном кабинете
      или обновите способ оплаты.</p>
      <p style="color:#888;font-size:12px">Техническая причина: ${escapeHtml(reason || 'неизвестно')}</p>
    `
  })
}

// Org-level counterpart to sendAutoRenewFailedEmail above — sent to the
// organization OWNER (never to members) when the seat auto-renew cron
// (see auto-renew-cron.js's runOrgSeatAutoRenew) fails to charge the org's
// saved payment method. Kept as its own function rather than reusing
// sendAutoRenewFailedEmail because that template's copy hardcodes
// "Centrio Pro", which would be misleading for a seats/organization charge.
async function sendOrgSeatsRenewFailedEmail(owner, orgName, reason) {
  if (!owner?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: owner.email,
    subject: `Не удалось продлить места в организации «${orgName}»`,
    html: `
      <p>Здравствуйте${owner.name ? ', ' + escapeHtml(owner.name) : ''}!</p>
      <p>Попытка автоматического продления мест в организации <strong>${escapeHtml(orgName)}</strong> не удалась.</p>
      <p>Чтобы участники не потеряли доступ к TEAM-функциям, продлите места вручную в личном кабинете
      организации или обновите способ оплаты.</p>
      <p style="color:#888;font-size:12px">Техническая причина: ${escapeHtml(reason || 'неизвестно')}</p>
    `
  })
}

async function sendRefundConfirmationEmail(user, payment) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: user.email,
    subject: 'Возврат средств оформлен',
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Возврат по платежу на сумму <strong>${escapeHtml(payment.amount + ' ' + payment.currency)}</strong> оформлен.
      Средства поступят на ваш счёт в течение нескольких рабочих дней (сроки зависят от банка).</p>
    `
  })
}

// Sent from the FAQ page's "Написать в поддержку" form (see
// contact-route.js). Goes to the support inbox, not the visitor — the
// visitor's own address is set as reply-to so support can just hit
// "Reply" in their mail client instead of copy-pasting an address out
// of the email body.
const SUPPORT_INBOX = process.env.SUPPORT_EMAIL || 'info@centrio.me'

async function sendContactFormEmail({ name, email, question }) {
  return sendEmail({
    to: SUPPORT_INBOX,
    subject: `Вопрос с сайта от ${name || 'без имени'}`,
    replyTo: email,
    html: `
      <p><strong>Имя:</strong> ${escapeHtml(name || '—')}</p>
      <p><strong>Email:</strong> ${escapeHtml(email || '—')}</p>
      <p><strong>Вопрос:</strong></p>
      <p>${escapeHtml(question).replace(/\n/g, '<br>')}</p>
    `
  })
}

// Sent when an admin replies to a support ticket from the admin panel
// (see POST /api/admin/tickets/:id/messages in admin-routes.js). Links back
// to the dashboard's ticket thread rather than including the reply body's
// full formatting inline, so the user always reads the canonical thread
// (and any follow-up replies already sent) rather than a possibly-stale
// email copy.
async function sendTicketReplyEmail(user, ticket, replyBody) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.FRONTEND_URL || 'https://centrio.me'}/dashboard?tab=support&ticket=${encodeURIComponent(ticket.id)}`
  return sendEmail({
    to: user.email,
    subject: `Ответ по обращению: ${ticket.subject}`,
    html: `
      <p>Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p>Поддержка Centrio ответила на ваше обращение «${escapeHtml(ticket.subject)}»:</p>
      <blockquote style="margin:12px 0;padding:10px 16px;border-left:3px solid #3b82f6;color:#333;background:#f5f7fb">${escapeHtml(replyBody).replace(/\n/g, '<br>')}</blockquote>
      <p><a href="${link}" style="display:inline-block;padding:10px 22px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Открыть обращение</a></p>
      <p style="color:#888;font-size:12px">Вы можете ответить прямо в личном кабинете Centrio.</p>
    `
  })
}

// Sent when an OWNER/ADMIN invites someone to an organization (see
// POST /api/org/:orgId/invites in org-routes.js — Корпоративная версия
// TEAM, Phase 1). `token` is the raw, single-use invite token; only its
// SHA-256 hash (OrgInvite.tokenHash) is ever persisted, mirroring
// sendVerificationEmail's token handling above.
async function sendOrgInviteEmail({ email, orgName, inviterEmail, token }) {
  if (!email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.FRONTEND_URL || 'https://centrio.me'}/team/invite?token=${encodeURIComponent(token)}`
  return sendEmail({
    to: email,
    subject: `Приглашение в организацию «${orgName}» в Centrio`,
    html: `
      <p>Здравствуйте!</p>
      <p>${escapeHtml(inviterEmail || 'Коллега')} приглашает вас присоединиться к организации
      <strong>${escapeHtml(orgName)}</strong> в Centrio TEAM.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 22px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Принять приглашение</a></p>
      <p style="color:#888;font-size:12px">Приглашение действительно 7 дней. Если вы не ожидали этого письма — просто проигнорируйте его.</p>
    `
  })
}

module.exports = { sendEmail, sendPaymentReceiptEmail, sendWelcomeEmail, sendVerificationEmail, sendAutoRenewFailedEmail, sendRefundConfirmationEmail, sendContactFormEmail, sendTicketReplyEmail, sendOrgInviteEmail, sendOrgSeatsRenewFailedEmail }
