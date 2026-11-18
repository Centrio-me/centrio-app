// Письма о скором конце ПРО. Каркас утверждённого письма (restored-notice.js): только таблицы, текст и картинки PNG.
const axios = require('axios')

const ASSETS = process.env.NOTICE_ASSETS || 'https://centrio.me/email'
const FREE_MESSENGERS = 3
const C = {
  canvas: '#080c14', panel: '#101724', card: '#141d2f', border: '#1f2b45',
  action: '#437cff', glow: '#87b7ff', text: '#eaf0fb', muted: '#9aaac3', faint: '#5c6b85',
  warnBg: '#2a2110', warnBorder: '#5e4a1d', warn: '#f1c76b'
}
const FONT = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const COPY = {
  soon: {
    subject: 'Centrio ПРО заканчивается через 3 дня',
    pill: 'Осталось 3 дня',
    title: 'ПРО скоро закончится',
    preheader: 'Продлите заранее, чтобы все сервисы остались под рукой.',
  },
  last: {
    subject: 'Сегодня заканчивается ваш Centrio ПРО',
    pill: 'Последний день',
    title: 'ПРО заканчивается сегодня',
    preheader: 'Продлите сегодня, чтобы не вернуться на бесплатный тариф.',
  },
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
}

function servicesWord(count) {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return 'сервисов'
  if (ones === 1) return 'сервис'
  return ones >= 2 && ones <= 4 ? 'сервиса' : 'сервисов'
}

function limitText(messengers) {
  const free = `На бесплатном тарифе доступно ${FREE_MESSENGERS} мессенджера.`
  return messengers > FREE_MESSENGERS ? `${free} У вас сейчас подключено ${messengers} ${servicesWord(messengers)}.` : free
}

function buildPlanEndingHtml(user, kind) {
  const copy = COPY[kind]
  const greeting = user.name ? `${escapeHtml(user.name)}, ваш` : 'Ваш'
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${copy.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas};">${copy.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:36px 14px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

<tr><td style="padding:0 6px 18px;">
<a href="https://centrio.me" style="text-decoration:none;"><img src="${ASSETS}/logo.png" width="200" height="40" alt="Centrio" style="display:block;border:0;outline:none;"></a>
</td></tr>

<tr><td style="background:${C.panel};border:1px solid ${C.border};border-radius:22px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">

<tr><td style="height:4px;background:${C.action};background-image:linear-gradient(90deg,${C.action},${C.glow},${C.action});font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:34px 30px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
<td style="background:${C.warnBg};border:1px solid ${C.warnBorder};border-radius:999px;padding:6px 13px;font-size:12px;font-weight:700;color:${C.warn};letter-spacing:0.03em;">${copy.pill}</td>
</tr></table>
<h1 style="margin:0 0 14px;font-size:32px;line-height:40px;font-weight:700;color:${C.text};letter-spacing:-0.03em;">${copy.title}</h1>
<p style="margin:0;font-size:15.5px;line-height:1.7;color:${C.muted};">${greeting} ПРО действует до ${fmtDate(user.planExpiresAt)}. Автопродление не включено, поэтому подписка сама не продлится.</p>
</td></tr>

<tr><td style="padding:22px 30px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td style="background:${C.card};border:1px solid ${C.border};border-left:4px solid ${C.action};border-radius:12px;padding:15px 18px;">
<div style="font-size:14.5px;font-weight:650;color:${C.text};">Что изменится</div>
<div style="font-size:13.5px;color:${C.muted};line-height:1.6;margin-top:4px;">${limitText(user.messengers)}</div>
</td></tr></table>
</td></tr>

<tr><td style="padding:14px 30px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:15px 18px;">
<div style="font-size:14.5px;font-weight:650;color:${C.text};">Что-то мешает пользоваться?</div>
<div style="font-size:13.5px;color:${C.muted};line-height:1.6;margin-top:4px;">Напишите в поддержку из личного кабинета, мы поможем.</div>
</td></tr></table>
</td></tr>

<tr><td align="center" style="padding:22px 30px 34px;">
<a href="https://centrio.me/dashboard" style="display:inline-block;padding:16px 40px;background:${C.action};color:#ffffff;font-weight:700;font-size:16px;border-radius:12px;text-decoration:none;">Продлить ПРО</a>
</td></tr>

</table>
</td></tr>

<tr><td align="center" style="padding:22px 12px 0;">
<p style="margin:0;font-size:12px;line-height:1.6;color:${C.faint};">Это служебное письмо о вашей подписке в Centrio.</p>
</td></tr>

<tr><td style="padding:34px 0 0;line-height:0;font-size:0;">
<img src="${ASSETS}/wordmark-v2.png" width="580" height="150" alt="" style="display:block;border:0;width:100%;max-width:580px;height:auto;">
</td></tr>

</table>
</td></tr></table>
</body></html>`
}

async function sendPlanEndingEmail(user, kind, { subjectPrefix = '' } = {}) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'not_configured' }
  if (!user.email) return { ok: false, reason: 'no_recipient' }
  try {
    await require('./email').resendPost('https://api.resend.com/emails', {
      from: process.env.EMAIL_FROM || 'Centrio <noreply@centrio.me>',
      to: user.email, subject: subjectPrefix + COPY[kind].subject, html: buildPlanEndingHtml(user, kind)
    }, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 })
    return { ok: true }
  } catch (err) {
    console.error('[plan-ending] send failed:', err.response?.status || err.message)
    require('./event-log').appendEvent('mail-errors', { at: new Date().toISOString(), reason: String(err.response?.status || err.code || 'unknown') })
    return { ok: false, reason: 'send_failed' }
  }
}

module.exports = { buildPlanEndingHtml, sendPlanEndingEmail }
