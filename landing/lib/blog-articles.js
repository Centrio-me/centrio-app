// Metadata for every published blog article — used by the admin "news"
// candidates list to suggest @centrioapp channel posts for articles that
// haven't been posted yet (cross-referenced against the NewsPost table).
//
// This intentionally mirrors the POSTS array in landing/blog-index.tsx
// (the frontend blog index page) rather than importing it, because
// centrio-web and centrio-api deploy to separate server paths
// (/var/www/centrio-web vs /var/www/centrio-api) — there is no shared
// module boundary between them. Same tradeoff already accepted elsewhere in
// this repo (changelog-data.ts is deployed twice, to two different frontend
// routes, for the same reason).
//
// IMPORTANT: when a new blog article ships, add it to BOTH this file and
// the POSTS array in landing/blog-index.tsx. Order doesn't need to match.
const SITE_URL = 'https://centrio.me'

const ARTICLES = [
  { slug: 'who-needs-it', title: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев', desc: 'Фрилансеры, SMM, поддержка, удалённые команды — разбираем 7 реальных случаев, где агрегатор мессенджеров экономит часы каждую неделю.' },
  { slug: 'how-to-combine-messengers', title: 'Как объединить Telegram, WhatsApp и VK в одном приложении', desc: 'Пошаговая инструкция на 5 шагов для Windows, macOS и Linux.' },
  { slug: 'vs-ferdium', title: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026', desc: 'Открытый форк Franz против Centrio с VPN и поддержкой VK «из коробки».' },
  { slug: 'messenger-vpn-guide', title: 'Зачем нужен VPN для мессенджеров и как настроить его в Centrio', desc: 'Протоколы VLESS, VMess, Trojan, Shadowsocks, Hysteria2 и встроенный VPN Centrio без отдельных приложений.' },
  { slug: 'stop-switching-tabs', title: 'Как перестать переключаться между вкладками мессенджеров', desc: 'Реальная цена переключения контекста и как собрать все мессенджеры в одном окне.' },
  { slug: 'is-it-safe', title: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?', desc: 'Как устроена изоляция сессий, подписанный установщик и чек-лист при выборе агрегатора.' },
  { slug: 'remote-team-messengers', title: 'Мессенджеры для удалённой команды: как свести всё в одно окно', desc: 'Slack, Telegram, Notion, Zoom в одном приложении по папкам, без потери сообщений между проектами.' },
  { slug: 'vs-rambox', title: 'Centrio vs Rambox: подробное сравнение 2026', desc: 'Что выбрать между Rambox и Centrio — функции, цены, поддержка русского языка.' },
  { slug: 'vs-franz', title: 'Centrio vs Franz: что лучше в 2026 году', desc: 'Сравниваем Centrio с одним из первых агрегаторов мессенджеров — Franz.' },
  { slug: 'vs-wavebox', title: 'Centrio vs Wavebox: сравнение для команд и бизнеса', desc: 'Wavebox против Centrio — что выбрать для рабочих и личных мессенджеров.' },
  { slug: 'top-apps', title: 'Топ-10 приложений в Centrio — апрель 2026', desc: 'Самые популярные мессенджеры и сервисы среди пользователей Centrio.' },
  { slug: 'multiple-accounts', title: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере', desc: 'Как открыть 2, 3 и больше аккаунтов WhatsApp и Telegram одновременно — без телефона-эмулятора и сброса сессий.' },
  { slug: 'telegram-vpn-block', title: 'Telegram не работает даже с VPN: почему и что реально помогает в 2026', desc: 'Почему обычный VPN не спасает от блокировок Telegram и какие протоколы реально работают.' },
  { slug: 'best-messenger-aggregators', title: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7', desc: 'Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift — сравнение в одной таблице.' },
  { slug: 'all-social-media-one-place', title: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте', desc: 'Рабочий способ для SMM-менеджеров и владельцев нескольких аккаунтов держать все соцсети в одном окне.' },
  { slug: 'max-transition', title: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026', desc: 'Как пользоваться MAX вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения и не теряя старые чаты.' },
  { slug: 'whatsapp-telegram-ban-risk', title: 'Забанят ли WhatsApp или Telegram за использование в Centrio? Разбираем риски', desc: 'Что реально приводит к бану мессенджеров и почему официальные веб-версии в отдельном окне не входят в зону риска.' },
  { slug: 'vs-station', title: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio', desc: 'Station закрыт разработчиком в 2023 году. Сравниваем с активно поддерживаемым Centrio.' },
  { slug: 'vs-shift', title: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026', desc: 'Shift против Centrio — цена, лимиты бесплатной версии, VPN и поддержка российских сервисов.' },
]

function articleUrl(slug) {
  return `${SITE_URL}/blog/${slug}`
}

// Builds the default suggested post text for an article — the admin can
// still edit it (in the news-tab textarea) before actually publishing.
// title/desc here are hardcoded by us, not user input, so there's no
// injection risk today — escapeHtml is applied anyway for correctness (a
// title with a literal "&" or "<" would otherwise break Telegram's
// parse_mode:'HTML' rendering) and to stay consistent with every other
// interpolation site in lib/telegram-bot.js.
const { escapeHtml } = require('./telegram-bot')
function suggestedPostText(article) {
  return `<b>${escapeHtml(article.title)}</b>\n\n${escapeHtml(article.desc)}\n\n${articleUrl(article.slug)}`
}

module.exports = { ARTICLES, articleUrl, suggestedPostText }
