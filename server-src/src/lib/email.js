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
  // Older Telegram accounts have a stand-in address with no mailbox behind it: letters to it only hurt delivery.
  if (/^tg_\d+@centrio\.me$/.test(String(to))) return { ok: false, reason: 'no_mailbox' }
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
    require('./event-log').appendEvent('mail-errors', { at: new Date().toISOString(), reason: String(err.response?.status || err.code || 'unknown') })
    return { ok: false, reason: 'send_failed' }
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// ── Brand tokens — mirror the live site's dark auth surface exactly
// (.centrio-auth in auth-design.css: --ca-canvas/--ca-panel/--ca-action/
// --ca-glow/--ca-text/--ca-muted), not a separately-invented palette, so
// every email looks like it belongs to centrio.me rather than an
// approximation of it. Approved 2026-09-22 after two design rounds
// (removed emoji for monochrome line icons, swapped to the real site
// logo mark, fixed logo/text sizing).
const CANVAS      = '#090d15'
const PANEL       = '#101724'
const BORDER      = '#1c2740'
const ACTION      = '#437cff'
const GLOW        = '#87b7ff'
const TEXT        = '#eaf0fb'
const MUTED       = '#98a9c1'
const ICON_BOX_BG = '#151f34'

// Real site logo (public/brand/logo.png), pre-recolored to solid white the
// same way the site's own CSS does it (`filter: brightness(0) invert(1)`)
// — email clients can't be relied on to support CSS filters, so the
// recoloring has to happen once, ahead of time, at the asset level.
const LOGO_URL = 'https://centrio.me/email/logo.png'

function strokeIcon(d, sw) {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${d}" stroke="${GLOW}" stroke-width="${sw || 1.6}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
function fillIcon(d) {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="${GLOW}"/></svg>`
}

const ICON_CHAT   = strokeIcon('M3 5.8A2.8 2.8 0 0 1 5.8 3h8.4A2.8 2.8 0 0 1 17 5.8v4.9a2.8 2.8 0 0 1-2.8 2.8H8.2L4 16.5v-3H5.8A2.8 2.8 0 0 1 3 10.7V5.8Z')
const ICON_FOLDER = strokeIcon('M3 6.3A1.8 1.8 0 0 1 4.8 4.5h3l1.5 1.7h6.9A1.8 1.8 0 0 1 18 8v6.2A1.8 1.8 0 0 1 16.2 16H4.8A1.8 1.8 0 0 1 3 14.2V6.3Z')
const ICON_ZAP    = strokeIcon('M11.2 2.2 4.5 11.4h4.9L8.6 17.8l6.9-9.6h-4.9l.6-6Z', 1.5)
const ICON_LOCK   = strokeIcon('M5 9.2V6.8a5 5 0 0 1 10 0v2.4 M4.6 9.2h10.8a1 1 0 0 1 1 1v6.1a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1v-6.1a1 1 0 0 1 1-1Z')
const ICON_SPARK  = fillIcon('M10 2.3c.3 2.9 1 4.5 2 5.5 1 1 2.6 1.7 5.5 2-2.9.3-4.5 1-5.5 2-1 1-1.7 2.6-2 5.5-.3-2.9-1-4.5-2-5.5-1-1-2.6-1.7-5.5-2 2.9-.3 4.5-1 5.5-2 1-1 1.7-2.6 2-5.5Z')
const ICON_BELL   = strokeIcon('M10 3.8a3.9 3.9 0 0 0-3.9 3.9v2.1c0 .5-.2 1-.5 1.4l-.9 1.2c-.6.7-.1 1.8.8 1.8h9c.9 0 1.4-1.1.8-1.8l-.9-1.2c-.3-.4-.5-.9-.5-1.4V7.7A3.9 3.9 0 0 0 10 3.8Z M8.3 16.3a1.7 1.7 0 0 0 3.4 0')
const ICON_INF    = strokeIcon('M6.2 7.1a2.9 2.9 0 1 0 0 5.8c1.6 0 2.8-1.3 3.8-2.9 1-1.6 2.2-2.9 3.8-2.9a2.9 2.9 0 1 1 0 5.8c-1.6 0-2.8-1.3-3.8-2.9-1-1.6-2.2-2.9-3.8-2.9Z', 1.5)
const ICON_HEAD   = strokeIcon('M4.2 10.6v-.7a5.8 5.8 0 0 1 11.6 0v.7 M3.4 10.6h1.4a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1Z M15.2 10.6h1.4a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1Z M16.6 16v.5a2.1 2.1 0 0 1-2.1 2.1h-1.8')
const ICON_REPEAT = strokeIcon('M4.2 9.3V7.8a3.9 3.9 0 0 1 3.9-3.9h7 M12.8 1.6 15.4 3.9 12.8 6.2 M15.8 10.7v1.5a3.9 3.9 0 0 1-3.9 3.9h-7 M7.2 17.4 4.6 15.1 7.2 12.8')

function featureRow(iconSvg, title, desc) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:10px 0;"><tr>
<td style="width:36px;height:36px;background:${ICON_BOX_BG};border:1px solid ${BORDER};border-radius:9px;text-align:center;vertical-align:middle;">
<span style="display:inline-block;line-height:0;">${iconSvg}</span>
</td>
<td style="padding-left:13px;vertical-align:middle;">
<div style="font-size:13.5px;font-weight:600;color:${TEXT};">${title}</div>
<div style="font-size:12.5px;color:${MUTED};margin-top:2px;">${desc}</div>
</td>
</tr></table>`
}

function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:4px 0 8px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;background:${ACTION};color:#ffffff;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none;letter-spacing:-0.01em;">${label}</a>
</td></tr></table>`
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
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Centrio</title>
<!--[if mso]>
<style>table {border-collapse:collapse;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PANEL};border:1px solid ${BORDER};border-radius:20px;overflow:hidden;">

<tr><td style="height:3px;background:linear-gradient(90deg,${ACTION},${GLOW},${ACTION});font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:36px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<img src="${LOGO_URL}" width="130" height="26" alt="Centrio" style="display:block;border:0;">
</td>
</tr></table>
</td></tr>

<tr><td style="padding:20px 32px 8px;color:${TEXT};font-size:15px;line-height:1.65;">
${bodyHtml}
</td></tr>

<tr><td style="padding:28px 32px 0;">
<div style="height:1px;background:${BORDER};"></div>
</td></tr>

<tr><td style="padding:22px 32px 30px;">
<p style="margin:0 0 6px;font-size:12px;color:${MUTED};line-height:1.6;">Centrio — все мессенджеры, почта и рабочие сервисы в одном окне.</p>
<p style="margin:0;font-size:12px;color:#5c6b85;line-height:1.6;"><a href="https://centrio.me/dashboard?tab=support" style="color:${GLOW};text-decoration:none;">Поддержка в личном кабинете</a> &nbsp;·&nbsp; <a href="https://centrio.me" style="color:${GLOW};text-decoration:none;">centrio.me</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

async function sendPaymentReceiptEmail(user, payment) {
  require('./admin-push').notifyAdminPayment(user, payment).catch(err => console.error('[admin-push]', err.message))
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const amountLabel = `${payment.amount} ${payment.currency}`
  const planLabel    = payment.months === 12 ? '1 год' : `${payment.months} мес.`
  return sendEmail({
    to: user.email,
    subject: 'Оплата Centrio Pro прошла успешно',
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Оплата прошла успешно</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p style="margin:0 0 18px;color:${MUTED};">Ваш платёж на сумму <strong style="color:${TEXT};">${escapeHtml(amountLabel)}</strong> (${escapeHtml(planLabel)}) прошёл успешно. Centrio Pro активирован.</p>
      <p style="margin:0;color:${MUTED};font-size:13px;">Если это были не вы — напишите нам через поддержку в личном кабинете.</p>
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
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Добро пожаловать${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
    <p style="margin:0 0 18px;color:${MUTED};">Спасибо, что зарегистрировались в Centrio. Теперь все ваши мессенджеры, почта и рабочие сервисы — в одном окне, без переключений между вкладками и приложениями.</p>
    ${featureRow(ICON_CHAT, 'Все мессенджеры сразу', 'Telegram, WhatsApp, MAX и другие — вкладками в одном окне')}
    ${featureRow(ICON_FOLDER, 'Папки и пространства', 'Группируйте сервисы под задачи: работа, личное, проекты')}
    ${featureRow(ICON_ZAP, 'Горячие клавиши и сплит-экран', 'Переключайтесь и работайте сразу с несколькими окнами')}
    <p style="margin:22px 0 16px;color:${MUTED};font-size:13px;">Если что-то пойдёт не так — просто напишите нам через поддержку в личном кабинете.</p>
    ${ctaButton('Скачать Centrio', 'https://centrio.me/download')}
    <p style="margin:14px 0 0;color:${MUTED};font-size:13px;">Новости и советы: <a href="https://t.me/centrioapp" style="color:${ACTION};">канал в Telegram</a>. Подписка, устройства и быстрые ответы: <a href="https://t.me/Centrio_bot" style="color:${ACTION};">бот @Centrio_bot</a>.</p>
  `
  return sendEmail({ to: user.email, subject: 'Добро пожаловать в Centrio', html: body })
}

// Sent both right after password registration and on-demand from the
// dashboard's "Отправить письмо" button (see POST /auth/verify-email/send).
// token is a raw, single-use, time-limited (1h) secret minted by the caller —
// only its SHA-256 hash is ever persisted, so this function never touches
// the DB itself and can't leak the live token even via logs of this module.
async function sendVerificationEmail(user, token) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Подтвердите email</p>
    <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
    <p style="margin:0 0 18px;color:${MUTED};">Подтвердите свой email, чтобы обезопасить аккаунт Centrio.</p>
    ${ctaButton('Подтвердить email', link)}
    <p style="margin:8px 0 0;color:${MUTED};font-size:13px;">Ссылка действительна 1 час. Если это были не вы — просто проигнорируйте это письмо.</p>
  `
  return sendEmail({ to: user.email, subject: 'Подтвердите email в Centrio', html: body })
}

// token is a raw, single-use, time-limited (1h) secret minted by the caller —
// only its SHA-256 hash is ever persisted (see auth.js), same pattern as
// sendVerificationEmail above. Points at a FRONTEND page (not an API route)
// because the user has to type a new password, not just click a link.
async function sendPasswordResetEmail(user, token) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.FRONTEND_URL || 'https://centrio.me'}/reset-password?token=${encodeURIComponent(token)}`
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Восстановление пароля</p>
    <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
    <p style="margin:0 0 18px;color:${MUTED};">Кто-то (надеемся, что вы) запросил сброс пароля для аккаунта Centrio, привязанного к этому адресу.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;"><tr>
    <td style="background:${ICON_BOX_BG};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:top;padding-right:10px;line-height:0;">${ICON_LOCK}</td>
    <td style="font-size:12.5px;color:${MUTED};line-height:1.6;">Ссылка действует <strong style="color:${TEXT};">1 час</strong> и работает только один раз. Если это были не вы — просто проигнорируйте это письмо, пароль останется прежним.</td>
    </tr></table>
    </td>
    </tr></table>
    ${ctaButton('Задать новый пароль', link)}
  `
  return sendEmail({ to: user.email, subject: 'Восстановление пароля Centrio', html: body })
}

async function sendAutoRenewFailedEmail(user, reason) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: user.email,
    subject: 'Не удалось продлить подписку Centrio Pro',
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Не удалось продлить Pro</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p style="margin:0 0 18px;color:${MUTED};">Попытка автоматического продления подписки Centrio Pro не удалась. Чтобы не потерять доступ к Pro-функциям, продлите подписку вручную в личном кабинете или обновите способ оплаты.</p>
      ${ctaButton('Открыть личный кабинет', 'https://centrio.me/dashboard')}
      <p style="margin:8px 0 0;color:${MUTED};font-size:12px">Техническая причина: ${escapeHtml(reason || 'неизвестно')}</p>
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
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Не удалось продлить места</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${owner.name ? ', ' + escapeHtml(owner.name) : ''}!</p>
      <p style="margin:0 0 18px;color:${MUTED};">Попытка автоматического продления мест в организации <strong style="color:${TEXT};">${escapeHtml(orgName)}</strong> не удалась. Чтобы участники не потеряли доступ к TEAM-функциям, продлите места вручную или обновите способ оплаты.</p>
      ${ctaButton('Открыть организацию', 'https://centrio.me/team')}
      <p style="margin:8px 0 0;color:${MUTED};font-size:12px">Техническая причина: ${escapeHtml(reason || 'неизвестно')}</p>
    `
  })
}

async function sendRefundConfirmationEmail(user, payment) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  return sendEmail({
    to: user.email,
    subject: 'Возврат средств оформлен',
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Возврат оформлен</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p style="margin:0;color:${MUTED};">Возврат по платежу на сумму <strong style="color:${TEXT};">${escapeHtml(payment.amount + ' ' + payment.currency)}</strong> оформлен. Средства поступят на ваш счёт в течение нескольких рабочих дней (сроки зависят от банка).</p>
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
      <p style="margin:0 0 6px;color:${MUTED};"><strong style="color:${TEXT};">Имя:</strong> ${escapeHtml(name || '—')}</p>
      <p style="margin:0 0 6px;color:${MUTED};"><strong style="color:${TEXT};">Email:</strong> ${escapeHtml(email || '—')}</p>
      <p style="margin:12px 0 4px;color:${MUTED};"><strong style="color:${TEXT};">Вопрос:</strong></p>
      <p style="margin:0;color:${TEXT};">${escapeHtml(question).replace(/\n/g, '<br>')}</p>
    `
  })
}

// Sent when an admin replies to a support ticket from the admin panel
// (see POST /api/admin/tickets/:id/messages in admin-routes.js). Links back
// to the dashboard's ticket thread rather than including the reply body's
// full formatting inline, so the user always reads the canonical thread
// (and any follow-up replies already sent) rather than a possibly-stale
// email copy.
// A person who has the bot also gets the answer there. A problem with Telegram must not stop the letter.
function mirrorToBot(user, ticket, body) {
  require('./telegram-client-bot').sendTicketReply(user, ticket, body).catch(e => console.error('[client-bot] ticket mirror failed:', e.message))
}

async function sendTicketReplyEmail(user, ticket, replyBody) {
  mirrorToBot(user, ticket, replyBody)
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.FRONTEND_URL || 'https://centrio.me'}/dashboard?tab=support&ticket=${encodeURIComponent(ticket.id)}`
  return sendEmail({
    to: user.email,
    subject: `Ответ по обращению: ${ticket.subject}`,
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Ответ от поддержки</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p style="margin:0 0 14px;color:${MUTED};">Поддержка Centrio ответила на ваше обращение «${escapeHtml(ticket.subject)}»:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;"><tr>
      <td style="background:${ICON_BOX_BG};border-left:3px solid ${ACTION};border-radius:0 8px 8px 0;padding:12px 16px;color:${TEXT};font-size:14px;">${escapeHtml(replyBody).replace(/\n/g, '<br>')}</td>
      </tr></table>
      ${ctaButton('Открыть обращение', link)}
      <p style="margin:8px 0 0;color:${MUTED};font-size:12px">Вы можете ответить прямо в личном кабинете Centrio.</p>
    `
  })
}

// Sent when an admin proactively opens a NEW ticket to check in with a
// user (POST /api/admin/tickets — no prior message from the user exists
// yet), as opposed to sendTicketReplyEmail above which replies to an
// existing user-opened ticket. Wording is deliberately different: "ответила
// на ваше обращение" would be wrong when the user never opened anything.
async function sendNewTicketFromAdminEmail(user, ticket, messageBody) {
  mirrorToBot(user, ticket, messageBody)
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const link = `${process.env.FRONTEND_URL || 'https://centrio.me'}/dashboard?tab=support&ticket=${encodeURIComponent(ticket.id)}`
  return sendEmail({
    to: user.email,
    subject: `Сообщение от поддержки Centrio: ${ticket.subject}`,
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Новое сообщение от поддержки</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${user.name ? ', ' + escapeHtml(user.name) : ''}!</p>
      <p style="margin:0 0 14px;color:${MUTED};">Команда Centrio написала вам:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;"><tr>
      <td style="background:${ICON_BOX_BG};border-left:3px solid ${ACTION};border-radius:0 8px 8px 0;padding:12px 16px;color:${TEXT};font-size:14px;">${escapeHtml(messageBody).replace(/\n/g, '<br>')}</td>
      </tr></table>
      ${ctaButton('Открыть переписку', link)}
      <p style="margin:8px 0 0;color:${MUTED};font-size:12px">Вы можете ответить прямо в личном кабинете Centrio.</p>
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
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Приглашение в команду</p>
      <p style="margin:0 0 18px;color:${MUTED};">${escapeHtml(inviterEmail || 'Коллега')} приглашает вас присоединиться к организации <strong style="color:${TEXT};">${escapeHtml(orgName)}</strong> в Centrio TEAM.</p>
      ${ctaButton('Принять приглашение', link)}
      <p style="margin:8px 0 0;color:${MUTED};font-size:12px">Приглашение действительно 7 дней. Если вы не ожидали этого письма — просто проигнорируйте его.</p>
    `
  })
}

// Sent alongside sendPaymentReceiptEmail on every successful Pro charge
// (personal subscription — see the three call sites in payments.js: the
// YooKassa webhook, the crypto/NOWPayments activation route, and the FRIDE
// webhook). Deliberately a SEPARATE email from the receipt: the receipt is
// the technical/legal record, this one is the warm "thank you for
// supporting us" moment the user explicitly asked for — conflating the two
// would make the receipt read like a sales pitch.
async function sendProThankYouEmail(user, payment) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const amountLabel = `${payment.amount} ${payment.currency}`
  const planLabel    = payment.months === 12 ? '1 год' : `${payment.months} мес.`
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Спасибо! Centrio Pro активирован</p>
    <p style="margin:0 0 18px;color:${MUTED};">${user.name ? escapeHtml(user.name) + ', ваш' : 'Ваш'} платёж на сумму <strong style="color:${TEXT};">${escapeHtml(amountLabel)}</strong> (${escapeHtml(planLabel)}) прошёл успешно. Спасибо, что поддерживаете Centrio — это реально помогает нам развивать продукт дальше.</p>
    ${featureRow(ICON_INF, 'Без ограничений', 'Неограниченное число мессенджеров, папок и пространств')}
    ${featureRow(ICON_HEAD, 'Поддержка в приоритете', 'Обращения в личном кабинете рассматриваются в первую очередь')}
    ${featureRow(ICON_REPEAT, 'Автопродление под контролем', 'Продлить или отменить можно в один клик в личном кабинете')}
    <p style="margin:22px 0 16px;color:${MUTED};font-size:13px;">Чек об оплате отправлен отдельным письмом.</p>
    ${ctaButton('Открыть личный кабинет', 'https://centrio.me/dashboard')}
  `
  return sendEmail({ to: user.email, subject: 'Спасибо за Centrio Pro!', html: body })
}

// Sent by the winback cron (src/cron/winback.js) to users whose lastSeenAt
// just crossed the 30-day mark — see that file for the exact eligibility
// window and why no extra "already sent" DB column was needed.
async function sendWinbackEmail(user) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const { isOptedOut, unsubscribeUrl } = require('./email-optout')
  if (isOptedOut(user.id)) return { ok: false, reason: 'opted_out' }
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Давно вас не видели</p>
    <p style="margin:0 0 18px;color:${MUTED};">${user.name ? escapeHtml(user.name) + ', вы' : 'Вы'} не заходили в Centrio уже месяц — соскучились! За это время мы кое-что улучшили, и ваши мессенджеры всё ещё ждут вас в одном окне.</p>
    ${featureRow(ICON_SPARK, 'Новое с вашего последнего визита', 'Личный кабинет с поддержкой, горячие клавиши сплит-экрана и не только')}
    ${featureRow(ICON_BELL, 'Ничего не потеряется', 'Все чаты и уведомления на месте — Centrio просто ждал')}
    <p style="margin:22px 0 16px;color:${MUTED};font-size:13px;">Если Centrio больше не нужен, ничего страшного: <a href="${unsubscribeUrl(user.id)}" style="color:${MUTED};">отписаться от таких писем</a>.</p>
    ${ctaButton('Вернуться в Centrio', 'https://centrio.me/download')}
  `
  return sendEmail({ to: user.email, subject: 'Мы соскучились — загляните в Centrio', html: body })
}


// "Клиент ждёт ответа": a team owner's alert about messengers whose unread messages have waited too long.
async function sendOrgWaitingAlertEmail({ to, orgName, items, isTest }) {
  if (!to) return { ok: false, reason: 'no_recipient' }
  const rows = (items || []).map(it => '<li><strong>' + escapeHtml(it.messengerName || '') + '</strong>' + (it.memberName ? ' — ' + escapeHtml(it.memberName) : '') + (it.waitedLabel ? ', ждёт ответа ' + escapeHtml(it.waitedLabel) : '') + '</li>').join('')
  return sendEmail({
    to,
    subject: (isTest ? 'Проверка оповещений · ' : 'Клиент ждёт ответа · ') + orgName,
    html: '<p>Здравствуйте!</p><p>' + (isTest ? 'Это проверочное оповещение Centrio TEAM.' : 'В организации <strong>' + escapeHtml(orgName) + '</strong> есть сообщения без ответа:') + '</p><ul>' + rows + '</ul>'
  })
}

// Разовое письмо после переезда на новый сервер: работа восстановлена, войдите заново.
async function sendRestoredNoticeEmail(user) {
  if (!user?.email) return { ok: false, reason: 'no_recipient' }
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Centrio снова работает</p>
    <p style="margin:0 0 18px;color:${MUTED};">На днях у нашего хостинг-провайдера случился сбой, из-за которого сайт и приложение были недоступны. Мы всё восстановили — ваш аккаунт на месте.</p>
    ${featureRow(ICON_REPEAT, 'Войдите в приложение заново', 'Откройте Centrio и войдите тем же способом, что и раньше: через Google, Яндекс или почту')}
    ${featureRow(ICON_CHAT, 'Мессенджеры на месте', 'Добавленные вкладки и папки подтянутся после входа')}
    ${featureRow(ICON_HEAD, 'Что-то не так — напишите нам', 'Ошибки, пропавшие данные, слетевшая оплата — мы разберёмся и всё поправим')}
    <p style="margin:22px 0 16px;color:${MUTED};font-size:13px;">Если вы входили по паролю и не помните его — нажмите «Забыли пароль» на странице входа. Обращения через личный кабинет рассматриваем в течение часа.</p>
    ${ctaButton('Открыть личный кабинет', 'https://centrio.me/dashboard')}
  `
  return sendEmail({ to: user.email, subject: 'Centrio снова работает — войдите заново', html: body })
}

// 6-digit code that proves a mailbox exists before the account is created (see routes/auth.js /register/start).
async function sendRegistrationCodeEmail(email, code) {
  if (!email || !/^\d{6}$/.test(code)) return { ok: false, reason: 'bad_input' }
  const body = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Код подтверждения</p>
    <p style="margin:0 0 18px;color:${MUTED};">Введите этот код в окне регистрации Centrio:</p>
    <p style="margin:0 0 18px;text-align:center;font-size:34px;font-weight:800;letter-spacing:0.28em;color:${TEXT};font-family:'SFMono-Regular',Consolas,'Courier New',monospace;">${code}</p>
    <p style="margin:8px 0 0;color:${MUTED};font-size:13px;">Код действует 15 минут. Если вы не регистрировались в Centrio, просто проигнорируйте это письмо.</p>
  `
  return sendEmail({ to: email, subject: `${code} — код подтверждения Centrio`, html: body })
}

// Team subscription ends soon and auto-renew is off (TEAM audit A1, 2026-11-08: these reminders
// were lost in the server move). days = 7, 3, 1 or 0 (the last day).
async function sendOrgExpiryEmail(owner, orgName, expiresAt, days) {
  if (!owner?.email) return { ok: false, reason: 'no_recipient' }
  const date = new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
  const when = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${days === 3 ? "дня" : "дней"}`
  return sendEmail({
    to: owner.email,
    subject: `Подписка команды «${orgName}» заканчивается ${when}`,
    html: `
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Подписка команды заканчивается ${when}</p>
      <p style="margin:0 0 6px;color:${MUTED};">Здравствуйте${owner.name ? ', ' + escapeHtml(owner.name) : ''}!</p>
      <p style="margin:0 0 18px;color:${MUTED};">Места в команде <strong style="color:${TEXT};">${escapeHtml(orgName)}</strong> оплачены до ${date}. После этого сотрудники потеряют ПРО, а оповещения и сводки перестанут приходить. Продлите места, чтобы работа не остановилась.</p>
      ${ctaButton('Продлить места', 'https://centrio.me/team')}
    `
  })
}

module.exports = { sendRegistrationCodeEmail, sendRestoredNoticeEmail, sendOrgWaitingAlertEmail,
  sendEmail, sendPaymentReceiptEmail, sendWelcomeEmail, sendVerificationEmail,
  sendPasswordResetEmail, sendAutoRenewFailedEmail, sendRefundConfirmationEmail,
  sendContactFormEmail, sendTicketReplyEmail, sendNewTicketFromAdminEmail, sendOrgInviteEmail,
  sendOrgSeatsRenewFailedEmail, sendProThankYouEmail, sendWinbackEmail, sendOrgExpiryEmail
}
