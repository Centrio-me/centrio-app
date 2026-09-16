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
  { slug: 'ai-assistant-guide', title: 'AI-ассистент в Centrio: как настроить и что он умеет', desc: 'Три режима подключения — свой ключ, локальная модель или готовая нейросеть Pro — и что реально удобно спрашивать, не выходя из мессенджеров.' },
  { slug: 'notes-plugin-guide', title: 'Заметки и списки покупок в Centrio: гид по новому плагину', desc: 'Обычные заметки и чек-листы, цветовые метки, архив и синхронизация между устройствами — прямо в панели рядом с мессенджерами.' },
  { slug: 'pin-lock-guide', title: 'Как поставить PIN-код на мессенджеры в Centrio', desc: 'Блокировка при сворачивании окна и автоблокировка при бездействии — вся переписка под одним коротким кодом.' },
  { slug: 'what-is-messenger-aggregator', title: 'Что такое агрегатор мессенджеров и зачем он нужен', desc: 'Разбираем, что такое агрегатор мессенджеров, как он устроен изнутри и чем реально отличается от простого набора вкладок браузера.' },
  { slug: 'best-aggregator-windows', title: 'Лучший агрегатор мессенджеров для Windows в 2026 году', desc: 'Как выбрать агрегатор мессенджеров под Windows, системные требования и пошаговая установка за пять шагов.' },
  { slug: 'workspaces-folders-guide', title: 'Папки и рабочие пространства в Centrio: в чём разница и как настроить', desc: 'Папки группируют вкладки, рабочие пространства переключают весь набор целиком — разбираем разницу и сценарии использования.' },
  { slug: 'split-screen-guide', title: 'Сплит-экран в Centrio: как смотреть несколько мессенджеров одновременно', desc: 'Четыре варианта раскладки экрана и пошаговая настройка, чтобы следить за двумя и больше чатами без переключения вкладок.' },
  { slug: 'adblock-guide', title: 'Блокировщик рекламы в Centrio: что убирает и как включить', desc: 'Какую рекламу и трекеры блокирует встроенный adblock Centrio и как включить его за три шага.' },
  { slug: 'chat-widget-guide', title: 'Чат для сайта в Centrio: как подключить виджет за 4 шага', desc: 'Встроенный виджет чата для собственного сайта — сообщения посетителей приходят в то же приложение, что и остальные мессенджеры.' },
  { slug: 'dark-mode-messengers', title: 'Тёмная тема для всех мессенджеров сразу в Centrio', desc: 'Как принудительно включить тёмное оформление даже в тех веб-версиях мессенджеров, где своей тёмной темы нет.' },
  { slug: 'notifications-guide', title: 'Уведомления в Centrio: полный гид по настройке', desc: 'Четыре уровня контроля уведомлений — от общего бейджа до отключения звука для отдельного мессенджера.' },
  { slug: 'freelancer-aggregator', title: 'Агрегатор мессенджеров для фрилансера: как не терять заказы', desc: 'Как фрилансеру свести переписку с заказчиками из разных мессенджеров и бирж в одно окно и не пропускать сообщения.' },
  { slug: 'smm-manager-guide', title: 'Centrio для SMM-менеджера: как вести несколько соцсетей одновременно', desc: 'Как SMM-менеджеру организовать работу с несколькими аккаунтами и площадками в одном приложении без путаницы.' },
  { slug: 'what-is-max', title: 'Что такое MAX и как совмещать его с другими мессенджерами', desc: 'Разбираем национальный мессенджер MAX и то, как пользоваться им вместе с Telegram и WhatsApp в одном окне.' },
  { slug: 'session-isolation-explained', title: 'Как устроена изоляция сессий в Centrio', desc: 'Почему у каждого мессенджера в Centrio отдельная сессия, cookies и кэш — и что это даёт с точки зрения безопасности.' },
  { slug: 'transfer-to-new-computer', title: 'Как перенести Centrio на новый компьютер за 5 шагов', desc: 'Пошаговый перенос настроек и мессенджеров на новое устройство — что синхронизируется автоматически, а что нет.' },
  { slug: 'free-vs-pro', title: 'Бесплатно или Pro в Centrio: что входит в каждый тариф', desc: 'Полный список функций бесплатного тарифа и Pro-подписки — и честный разбор, когда апгрейд реально окупается.' },
  { slug: 'add-custom-service', title: 'Как добавить любой сайт в Centrio как отдельный мессенджер', desc: 'Centrio не ограничен списком готовых сервисов — добавляем любой сайт по прямой ссылке за пять шагов.' },
  { slug: 'small-business-messengers', title: 'Малый бизнес и мессенджеры: как не терять заявки клиентов', desc: 'Почему малый бизнес теряет заявки, разбросанные по WhatsApp, Telegram и Instagram, и как собрать все каналы продаж в одном окне.' },
  { slug: 'russian-services-one-place', title: 'ВКонтакте, MAX, Яндекс и другие русские сервисы в одном окне', desc: 'Как собрать российские сервисы — ВКонтакте, MAX, Яндекс.Почту — в одном приложении вместо десятка вкладок браузера.' },
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
