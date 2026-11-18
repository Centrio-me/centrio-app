// Письмо «Centrio снова работает». Самодостаточное: свой каркас, только таблицы и текст.
// Без SVG и внешних картинок, поэтому одинаково выглядит в Gmail, Яндекс.Почте, Mail.ru и Outlook.


const ASSETS = process.env.NOTICE_ASSETS || 'https://centrio.me/email'
const C = {
  canvas: '#080c14', panel: '#101724', card: '#141d2f', border: '#1f2b45',
  action: '#437cff', glow: '#87b7ff', text: '#eaf0fb', muted: '#9aaac3', faint: '#5c6b85',
  okBg: '#0e2a22', okBorder: '#1d5a46', ok: '#5fe3b0'
}
const FONT = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function step(n, title, desc) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 10px;background:${C.card};border:1px solid ${C.border};border-radius:14px;"><tr>
<td width="64" valign="top" style="padding:16px 0 16px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;background:${C.action};border-radius:18px;font-size:16px;font-weight:700;color:#ffffff;line-height:36px;">${n}</td></tr></table>
</td>
<td valign="top" style="padding:15px 18px 16px 0;">
<div style="font-size:15.5px;font-weight:650;color:${C.text};line-height:1.35;">${title}</div>
<div style="font-size:13.5px;color:${C.muted};line-height:1.55;margin-top:4px;">${desc}</div>
</td></tr></table>`
}

function buildRestoredNoticeHtml() {
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Centrio снова работает</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas};">Аккаунт на месте. Осталось один раз войти заново.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:36px 14px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

<tr><td style="padding:0 6px 18px;">
<a href="https://centrio.me" style="text-decoration:none;"><img src="${ASSETS}/logo.png" width="200" height="40" alt="Centrio" style="display:block;border:0;outline:none;width:200px;height:40px;font-size:24px;font-weight:700;color:${C.text};"></a>
</td></tr>

<tr><td style="background:${C.panel};border:1px solid ${C.border};border-radius:22px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">

<tr><td style="height:4px;background:${C.action};background-image:linear-gradient(90deg,${C.action},${C.glow},${C.action});font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:34px 30px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
<td style="background:${C.okBg};border:1px solid ${C.okBorder};border-radius:999px;padding:6px 13px;font-size:12px;font-weight:700;color:${C.ok};letter-spacing:0.03em;">&#9679;&nbsp; ВСЁ РАБОТАЕТ</td>
</tr></table>
<h1 style="margin:0 0 14px;font-size:34px;line-height:46px;font-weight:700;color:${C.text};letter-spacing:-0.03em;"><img src="${ASSETS}/headline.png" width="420" height="46" alt="Centrio снова работает" style="display:block;border:0;width:100%;max-width:420px;height:auto;font-size:30px;line-height:40px;font-weight:700;color:${C.text};"></h1>
<p style="margin:0;font-size:15.5px;line-height:1.7;color:${C.muted};">На днях у нашего хостинг-провайдера случился сбой: сайт и приложение были недоступны. Мы всё восстановили, <strong style="color:${C.text};font-weight:600;">ваш аккаунт на месте</strong>. Осталось один раз войти заново. Приносим извинения за доставленные неудобства.</p>
</td></tr>

<tr><td style="padding:22px 30px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td style="background:${C.okBg};border:1px solid ${C.okBorder};border-radius:14px;padding:16px 18px;">
<div style="font-size:15px;font-weight:700;color:${C.ok};">Подарок: +7 дней Pro</div>
<div style="font-size:13.5px;color:${C.muted};line-height:1.6;margin-top:4px;">Всем, у кого была подписка Pro, мы добавили 7 дней. Ничего делать не нужно: срок уже обновлён в личном кабинете.</div>
</td></tr></table>
</td></tr>

<tr><td style="padding:24px 30px 4px;">
${step('1', 'Откройте Centrio', 'Приложение на компьютере или телефоне. Если его нет, скачайте по ссылке ниже.')}
${step('2', 'Войдите тем же способом, что и раньше', 'Через Google, Яндекс или почту. Входили по паролю и забыли его? Нажмите «Забыли пароль» на экране входа.')}
${step('3', 'Проверьте, что всё на месте', 'Мессенджеры, папки и подписка подтянутся сами после входа.')}
</td></tr>

<tr><td style="padding:14px 30px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td style="background:${C.card};border:1px solid ${C.border};border-left:4px solid ${C.action};border-radius:12px;padding:15px 18px;">
<div style="font-size:14.5px;font-weight:650;color:${C.text};">Что-то не так?</div>
<div style="font-size:13.5px;color:${C.muted};line-height:1.6;margin-top:4px;">Пропали данные, слетела оплата или не получается войти? Напишите нам из личного кабинета. Ответим в течение часа и всё поправим.</div>
</td></tr></table>
</td></tr>

<tr><td align="center" style="padding:22px 30px 8px;">
<a href="https://centrio.me/dashboard" style="display:inline-block;padding:16px 40px;background:${C.action};color:#ffffff;font-weight:700;font-size:16px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Открыть личный кабинет</a>
</td></tr>
<tr><td align="center" style="padding:6px 30px 32px;font-size:13.5px;"><a href="https://centrio.me/download" style="color:${C.glow};text-decoration:none;">Скачать приложение</a></td></tr>

</table>
</td></tr>

<tr><td align="center" style="padding:22px 12px 0;">
<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${C.muted};">Centrio: все мессенджеры, почта и рабочие сервисы в одном окне.</p>
<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${C.faint};"><a href="https://centrio.me/dashboard?tab=support" style="color:${C.glow};text-decoration:none;">Поддержка в личном кабинете</a> &nbsp;·&nbsp; <a href="https://centrio.me" style="color:${C.glow};text-decoration:none;">centrio.me</a></p>
<p style="margin:0;font-size:11.5px;line-height:1.6;color:${C.faint};">Если вы получили наше предыдущее письмо с неровным оформлением, извините: это исправленная версия.</p>
</td></tr>

<tr><td style="padding:34px 0 0;line-height:0;font-size:0;">
<img src="${ASSETS}/wordmark-v2.png" width="580" height="150" alt="" style="display:block;border:0;width:100%;max-width:580px;height:auto;">
</td></tr>

</table>
</td></tr></table>
</body></html>`
}

async function sendRestoredNotice(to, { subjectPrefix = '' } = {}) {
  const axios = require('axios')
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'not_configured' }
  if (!to) return { ok: false, reason: 'no_recipient' }
  try {
    await require('./email').resendPost('https://api.resend.com/emails', {
      from: process.env.EMAIL_FROM || 'Centrio <noreply@centrio.me>',
      to, subject: subjectPrefix + 'Centrio снова работает — войдите заново', html: buildRestoredNoticeHtml()
    }, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 })
    return { ok: true }
  } catch (err) {
    console.error('[restored-notice] failed', to, err.response?.data || err.message)
    return { ok: false, reason: 'send_failed' }
  }
}

module.exports = { buildRestoredNoticeHtml, sendRestoredNotice }
