// REDESIGN (2026-08-24, "Полностью переработай окно выбора нового мессенджера
// с плюсика ... больше значков" — live user request): у каждого пункта
// добавлено необязательное поле category — используется новым секционным
// UI пикера (renderer/add-modal-ui.js) для группировки плиток под
// заголовками вместо постраничной подачи по 8 штук. Поле аддитивное — все
// остальные потребители массива (onboarding-auth.js, add-modal-bind.js и
// т.д.) читают только name/url/icon/color и не заметят разницы, порядок
// элементов не менялся.
//
// UPDATE (2026-08-28, "Популярные месседжеры должны отображаться также в
// своих тематических категориях" — live user request): раньше 'top' было
// САМОСТОЯТЕЛЬНОЙ категорией — 8 пунктов ниже показывались ТОЛЬКО в разделе
// "Популярные" и пропадали из своих реальных тематических секций (Telegram/
// WhatsApp/VK/MAX не было видно среди "Мессенджеров" и т.д.). Теперь у
// каждого пункта простановлена его РЕАЛЬНАЯ category (messengers/mail/
// productivity), а новое аддитивное булево поле popular: true отдельно
// маркирует те же 8 пунктов для секции "Популярные" — она теперь
// рендерится в add-modal-ui.js как отдельная выборка по этому флагу, а не
// как основная группировка. Одна и та же запись показывается дважды
// (в "Популярные" и в своей теме) — так и задумано.
const popularMessengers = [
    // ── Топ-8 (также помечены popular: true — см. коммент выше) ────────
    { name: 'Telegram',         url: 'https://web.telegram.org/k/',         icon: 'assets/logomessenger/telegram.png',      color: '#2AABEE', category: 'messengers', popular: true },
    { name: 'WhatsApp',         url: 'https://web.whatsapp.com',            icon: 'assets/logomessenger/whatsapp.png',      color: '#25D366', category: 'messengers', popular: true },
    { name: 'VK',               url: 'https://vk.com/im',                   icon: 'assets/logomessenger/vk.png',            color: '#0077FF', category: 'messengers', popular: true },
    { name: 'MAX',              url: 'https://web.max.ru/',                 icon: 'assets/logomessenger/max.png',           color: '#FF5C00', category: 'messengers', popular: true },
    { name: 'Mail.ru',          url: 'https://mail.ru',                     icon: 'assets/logomessenger/mailru.png',        color: '#005FF9', category: 'mail', popular: true },
    { name: 'Yandex Mail',      url: 'https://mail.yandex.ru',              icon: 'assets/logomessenger/yandex.png',        color: '#FC3F1D', category: 'mail', popular: true },
    { name: 'Rambler',          url: 'https://mail.rambler.ru',             icon: 'assets/logomessenger/rambler.png',       color: '#ED1C24', category: 'mail', popular: true },
    { name: 'Bitrix24',         url: 'https://www.bitrix24.ru',             icon: 'assets/logomessenger/bitrix.png',        color: '#EA4335', category: 'productivity', popular: true },
    // ── Мессенджеры ───────────────────────────────────────────────────
    { name: 'Discord',          url: 'https://discord.com/app',             icon: 'assets/logomessenger/discord.png',       color: '#5865F2', category: 'messengers' },
    { name: 'Slack',            url: 'https://app.slack.com',               icon: 'assets/logomessenger/slack.png',         color: '#4A154B', category: 'messengers' },
    { name: 'Viber',            url: 'https://web.viber.com',               icon: 'assets/logomessenger/viber.png',         color: '#7360F2', category: 'messengers' },
    { name: 'Skype',            url: 'https://web.skype.com',               icon: 'assets/logomessenger/skype.png',         color: '#00AFF0', category: 'messengers' },
    { name: 'WeChat',           url: 'https://wx.qq.com',                   icon: 'assets/logomessenger/wechat.png',        color: '#07C160', category: 'messengers' },
    { name: 'Я.Мессенджер',     url: 'https://yandex.ru/chat',              icon: 'assets/logomessenger/yandexchat.png',    color: '#12B5A8', category: 'messengers' },
    { name: 'Signal',           url: 'https://signal.me',                   icon: 'assets/logomessenger/signal.png',        color: '#3A76F0', category: 'messengers' },
    { name: 'LINE',             url: 'https://web.line.me',                 icon: 'assets/logomessenger/line.png',          color: '#00B900', category: 'messengers' },
    { name: 'Messenger',        url: 'https://messenger.com',               icon: 'assets/logomessenger/messenger.png',     color: '#0099FF', category: 'messengers' },
    { name: 'Instagram',        url: 'https://www.instagram.com/direct/inbox/', icon: 'assets/logomessenger/instagram.png', color: '#E1306C', category: 'messengers' },
    { name: 'X (Twitter)',      url: 'https://x.com/messages',              icon: 'assets/logomessenger/x.png',            color: '#000000', category: 'messengers' },
    { name: 'LinkedIn',         url: 'https://www.linkedin.com/messaging',  icon: 'assets/logomessenger/linkedin.png',      color: '#0A66C2', category: 'messengers' },
    { name: 'Google Chat',      url: 'https://chat.google.com',             icon: 'assets/logomessenger/googlechat.png',    color: '#00897B', category: 'messengers' },
    { name: 'Rocket.Chat',      url: 'https://open.rocket.chat',            icon: 'assets/logomessenger/rocketchat.png',    color: '#F5455C', category: 'messengers' },
    // ── Добавлено из каталога rambox.app/apps/ (2026-08-28, live user request) ──
    { name: 'Element',          url: 'https://app.element.io',              icon: 'assets/logomessenger/element.png',       color: '#0DBD8B', category: 'messengers' },
    { name: 'Threema',          url: 'https://web.threema.ch',              icon: 'assets/logomessenger/threema.png',       color: '#05A63F', category: 'messengers' },
    { name: 'Wire',             url: 'https://app.wire.com',                icon: 'assets/logomessenger/wire.png',          color: '#2391F7', category: 'messengers' },
    { name: 'Zalo',             url: 'https://chat.zalo.me',                icon: 'assets/logomessenger/zalo.png',          color: '#0068FF', category: 'messengers' },
    { name: 'GroupMe',          url: 'https://web.groupme.com',             icon: 'assets/logomessenger/groupme.png',       color: '#00AEEF', category: 'messengers' },
    { name: 'Threads',          url: 'https://www.threads.net',             icon: 'assets/logomessenger/threads.png',       color: '#000000', category: 'messengers' },
    { name: 'Snapchat',         url: 'https://web.snapchat.com',            icon: 'assets/logomessenger/snapchat.png',      color: '#FFFC00', category: 'messengers' },
    // ── Почта ─────────────────────────────────────────────────────────
    { name: 'Gmail',            url: 'https://mail.google.com',             icon: 'assets/logomessenger/gmail.png',         color: '#EA4335', category: 'mail' },
    { name: 'Outlook',          url: 'https://outlook.live.com',            icon: 'assets/logomessenger/outlook.png',       color: '#0078D4', category: 'mail' },
    { name: 'Yahoo Mail',       url: 'https://mail.yahoo.com',              icon: 'assets/logomessenger/yahoo.png',         color: '#6001D2', category: 'mail' },
    { name: 'ProtonMail',       url: 'https://mail.proton.me',              icon: 'assets/logomessenger/protonmail.png',    color: '#6D4AFF', category: 'mail' },
    // ── Продуктивность ────────────────────────────────────────────────
    { name: 'Notion',           url: 'https://notion.so',                   icon: 'assets/logomessenger/notion.png',        color: '#000000', category: 'productivity' },
    { name: 'Trello',           url: 'https://trello.com',                  icon: 'assets/logomessenger/trello.png',        color: '#0052CC', category: 'productivity' },
    { name: 'Asana',            url: 'https://app.asana.com',               icon: 'assets/logomessenger/asana.png',         color: '#F06A6A', category: 'productivity' },
    { name: 'ClickUp',          url: 'https://app.clickup.com',             icon: 'assets/logomessenger/clickup.png',       color: '#7B68EE', category: 'productivity' },
    { name: 'Monday.com',       url: 'https://monday.com',                  icon: 'assets/logomessenger/monday.png',        color: '#F62B54', category: 'productivity' },
    { name: 'Jira',             url: 'https://jira.atlassian.com',          icon: 'assets/logomessenger/jira.png',          color: '#0052CC', category: 'productivity' },
    { name: 'GitHub',           url: 'https://github.com',                  icon: 'assets/logomessenger/github.png',        color: '#24292E', category: 'productivity' },
    { name: 'Figma',            url: 'https://figma.com',                   icon: 'assets/logomessenger/figma.png',         color: '#F24E1E', category: 'productivity' },
    { name: 'Todoist',          url: 'https://app.todoist.com',             icon: 'assets/logomessenger/todoist.png',       color: '#DB4035', category: 'productivity' },
    { name: 'Twitch',           url: 'https://twitch.tv',                   icon: 'assets/logomessenger/twitch.png',        color: '#9146FF', category: 'productivity' },
    { name: 'Zendesk',          url: 'https://www.zendesk.com',             icon: 'assets/logomessenger/zendesk.png',       color: '#03363D', category: 'productivity' },
    { name: 'Chatwork',         url: 'https://www.chatwork.com',            icon: 'assets/logomessenger/chatwork.png',      color: '#D2242A', category: 'productivity' },
    // ── Добавлено 2026-09-01, live user request ──
    { name: 'AmoCRM',           url: 'https://www.amocrm.ru',               icon: 'assets/logomessenger/amocrm.png',        color: '#1FA7FF', category: 'productivity' },
    { name: 'Мегаплан',         url: 'https://megaplan.ru',                 icon: 'assets/logomessenger/megaplan.png',      color: '#00A651', category: 'productivity' },
    { name: 'RetailCRM',        url: 'https://www.retailcrm.ru',            icon: 'assets/logomessenger/retailcrm.png',     color: '#5B4CDB', category: 'productivity' },
    // ── Видеозвонки (2026-09-01, live user request: "добавь как отдельную
    // категорию", Zoom/Teams/Meet/Webex перенесены сюда из messengers/
    // productivity — раньше были там просто потому, что отдельной категории
    // не существовало) ──
    { name: 'Яндекс Телемост',  url: 'https://telemost.yandex.ru',          icon: 'assets/logomessenger/telemost.png',      color: '#43D854', category: 'calls', popular: true },
    { name: 'Zoom',             url: 'https://zoom.us/wc',                  icon: 'assets/logomessenger/zoom.png',          color: '#2D8CFF', category: 'calls', popular: true },
    { name: 'Google Meet',      url: 'https://meet.google.com',             icon: 'assets/logomessenger/googlemeet.png',    color: '#00AC47', category: 'calls', popular: true },
    { name: 'Microsoft Teams',  url: 'https://teams.microsoft.com',         icon: 'assets/logomessenger/teams.png',         color: '#6264A7', category: 'calls' },
    { name: 'Webex',            url: 'https://web.webex.com',               icon: 'assets/logomessenger/webex.png',         color: '#049FD9', category: 'calls' },
    // ── Нейросети ─────────────────────────────────────────────────────────
    // popular: true (2026-08-28, live user request — "в популярные добавь
    // ... SYNTAX - только тут просто - как обычный сервис", уточнение —
    // "ссылка всё так-же реферальная естественно)"). Это ОТДЕЛЬНАЯ запись
    // от syntaxAiPromo (см. ниже) — та рисуется через buildSyntaxAiBanner()
    // как специальный 2-колоночный промо-баннер первым элементом категории
    // 'ai', а эта — обычный тайл (та же схема двойного показа, что и у
    // остального топ-8/Yandex Музыка). URL/иконка/цвет намеренно совпадают
    // с syntaxAiPromo — та же реферальная ссылка.
    { name: 'SYNTAX',           url: 'https://syntx.ai/welcome/I0QyuudO',   icon: 'assets/logomessenger/syntaxai.svg',      color: '#2A2A2E', category: 'ai', popular: true },
    { name: 'ChatGPT',          url: 'https://chat.openai.com',             icon: 'assets/logomessenger/chatgpt.png',       color: '#10A37F', category: 'ai' },
    { name: 'Claude',           url: 'https://claude.ai',                   icon: 'assets/logomessenger/claude.png',        color: '#CC785C', category: 'ai' },
    { name: 'Gemini',           url: 'https://gemini.google.com',           icon: 'assets/logomessenger/gemini.png',        color: '#4285F4', category: 'ai' },
    { name: 'Grok',             url: 'https://grok.com',                    icon: 'assets/logomessenger/grok.png',          color: '#000000', category: 'ai' },
    { name: 'Perplexity',       url: 'https://www.perplexity.ai',           icon: 'assets/logomessenger/perplexity.png',    color: '#20808D', category: 'ai' },
    { name: 'Mistral',          url: 'https://chat.mistral.ai',             icon: 'assets/logomessenger/mistral.png',       color: '#FF7000', category: 'ai' },
    { name: 'DeepSeek',         url: 'https://chat.deepseek.com',           icon: 'assets/logomessenger/deepseek.png',      color: '#4D6BFE', category: 'ai' },
    { name: 'Алиса',            url: 'https://alice.yandex.ru/',            icon: 'assets/logomessenger/alice.png',         color: '#8C1EFF', category: 'ai' },
    // Алиса PRO (2026-08-28, live user request) — платная версия Алисы,
    // отдельный сервис/URL от обычной Алисы выше, иконку прислал пользователь.
    { name: 'Алиса PRO',        url: 'https://alicepro.yandex.ru',          icon: 'assets/logomessenger/alicepro.png',      color: '#9B4DE0', category: 'ai' },
    // ── Медиа (2026-08-28, live user request — новая категория: онлайн-музыка
    // и онлайн-кинотеатры, чтобы держать их открытыми вкладками так же, как
    // мессенджеры). Иконки для сервисов без записи в каталоге simple-icons
    // (Яндекс Музыка/Ivi/Okko/РадиоРекорд/VK Видео) скачаны напрямую с их
    // собственных favicon/apple-touch-icon — см. assets/logomessenger/*.
    // ────────────────────────────────────────────────────────────────────
    { name: 'YouTube',          url: 'https://www.youtube.com',             icon: 'assets/logomessenger/youtube.svg',       color: '#FF0000', category: 'media' },
    { name: 'Spotify',          url: 'https://open.spotify.com',            icon: 'assets/logomessenger/spotify.svg',       color: '#1ED760', category: 'media' },
    // popular: true (2026-08-28, live user request — "в популярные добавь
    // Яндекс Музыка") — та же схема двойного показа, что и у остального
    // топ-8 в начале массива (см. коммент там): показывается и в
    // "Популярные", и в своей теме 'media'.
    { name: 'Yandex Музыка',    url: 'https://music.yandex.ru',             icon: 'assets/logomessenger/yandexmusic.ico',   color: '#FFCC00', category: 'media', popular: true },
    { name: 'VK Видео',         url: 'https://vkvideo.ru',                  icon: 'assets/logomessenger/vkvideo.svg',       color: '#0077FF', category: 'media' },
    { name: 'Shazam',           url: 'https://www.shazam.com',              icon: 'assets/logomessenger/shazam.svg',        color: '#0088FF', category: 'media' },
    { name: 'Ivi',              url: 'https://www.ivi.ru',                  icon: 'assets/logomessenger/ivi.png',           color: '#FF6600', category: 'media' },
    { name: 'Кинопоиск',        url: 'https://www.kinopoisk.ru',            icon: 'assets/logomessenger/kinopoisk.svg',     color: '#FF5500', category: 'media' },
    { name: 'Okko',             url: 'https://okko.tv',                     icon: 'assets/logomessenger/okko.ico',          color: '#00B8FF', category: 'media' },
    { name: 'РадиоРекорд',      url: 'https://www.radiorecord.ru',          icon: 'assets/logomessenger/radiorecord.png',   color: '#E30613', category: 'media' },
    { name: 'SoundCloud',       url: 'https://soundcloud.com',              icon: 'assets/logomessenger/soundcloud.svg',    color: '#FF5500', category: 'media' },
]

// SyntaxAI — партнёрская (реферальная) промо-плитка в разделе "Нейросети"
// (2026-08-28, live user request). Хранится ОТДЕЛЬНО от popularMessengers
// не потому что клик не должен добавлять вкладку (ДОЛЖЕН — см. UPDATE ниже),
// а потому что add-modal-ui.js рисует её иначе: отдельной широкой (на 2
// колонки из 5) плиткой первой в категории 'ai', с собственным промо-текстом
// поверх иконки — см. buildSyntaxAiBanner() там же, а не общий buildTile().
// UPDATE (2026-08-28, тот же день, live user correction — "это мессенджер.
// Он должен создавать вкладку... Чтобы люди сразу регались там"): первая
// версия открывала url реферальной ссылки во ВНЕШНЕМ браузере и не заводила
// вкладку — пользователь явно поправил: клик обязан вести себя как обычное
// добавление мессенджера (addMessenger()), чтобы регистрация по реферальной
// ссылке проходила прямо внутри Centrio, в своём webview. Иконка —
// мональхромный SVG-логотип SyntaxAI (взят с самого syntx.ai) на тёмно-сером
// фоне, запечённом прямо в файле (см. assets/logomessenger/syntaxai.svg) —
// так тайл в сетке, вкладка в панели и иконка в сайдбаре везде показывают
// один и тот же тёмно-серый квадрат с белым знаком, а не «голый» силуэт без
// фона (path в исходнике использует fill="currentColor", который не
// резолвится предсказуемо при показе через <img>).
const syntaxAiPromo = {
    name: 'SyntaxAI',
    url: 'https://syntx.ai/welcome/I0QyuudO',
    icon: 'assets/logomessenger/syntaxai.svg',
    color: '#2A2A2E'
}

const folderIcons = {
    folder: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    work: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    heart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chat: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bell: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.8"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" stroke-width="1.8"/></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    zap: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    target: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
    rocket: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    coffee: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8h1a4 4 0 0 1 0 8h-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="6" y1="1" x2="6" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="14" y1="1" x2="14" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    music: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.8"/></svg>`,
    book: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

const PAGE_SIZE = 8

module.exports = {
    popularMessengers,
    syntaxAiPromo,
    folderIcons,
    PAGE_SIZE
}
