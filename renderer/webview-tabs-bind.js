// ── Диплинки других мессенджеров (MAX / Telegram) ──────────────────────────
// Классификация (какой href — деплинк какого сервиса) происходит ТОЛЬКО в
// webview-preload.js, и только на настоящем клике пользователя (e.isTrusted)
// — см. подробный комментарий там про то, почему авто-переключение вкладки
// не должно быть доступно script-driven путям (window.open/will-navigate)
// без верифицируемого user gesture. Сюда, в 'ipc-message' → 'deep-link'
// (см. addWebview ниже), долетает уже классифицированный `{service, href}`;
// эта функция лишь переводит его в конечный URL для загрузки в целевой
// вкладке — и на всякий случай ре-валидирует href (defense-in-depth, не
// доверяем каналу вслепую даже несмотря на то, что единственный отправитель
// уже проверен).
function translateDeepLinkUrl(special) {
    if (!special || typeof special.href !== 'string') return null

    if (special.service === 'max') {
        // SECURITY (defense-in-depth): re-validate host-side against the
        // same anchored pattern preload used to classify this link, rather
        // than trusting `href` verbatim just because it arrived tagged
        // `service: 'max'` on the deep-link channel.
        // ВНИМАНИЕ: этот https://max.ru/join/<token> годится ТОЛЬКО как
        // фолбэк для ВНЕШНЕГО браузера (нет открытой вкладки MAX) — там
        // max.ru сам показывает публичную страницу приглашения. НЕ грузить
        // его через loadURL() в уже открытую и залогиненную вкладку MAX —
        // см. extractMaxJoinToken + navigateMaxWebview ниже, там для этого
        // случая same-origin путь (max.ru и web.max.ru — РАЗНЫЕ origin, см.
        // подробности в navigateMaxWebview).
        return /^https:\/\/max\.ru\/join\//i.test(special.href) ? special.href : null
    }

    if (special.service === 'telegram') {
        // tg://resolve?domain=X → https://t.me/X — официальный универсальный
        // редирект-домен Telegram. Годится как фолбэк для ВНЕШНЕГО браузера
        // (routeDeepLinkFromMain / открытие без подходящей вкладки) — там
        // t.me корректно делает client-detection и редиректит сам.
        // ВНИМАНИЕ: НЕ грузить t.me внутри уже открытой и залогиненной
        // вкладки web.telegram.org через loadURL — см. extractTelegramUsername
        // + navigateTelegramWebview ниже, там для этого случая отдельный,
        // same-origin путь без полной навигации.
        const username = extractTelegramUsername(special.href)
        if (username) return `https://t.me/${username}`

        // tg://join?invite=<hash> — приватные инвайт-ссылки (самый частый
        // реальный формат "пришлите ссылку на чат"), у них нет username и
        // extractTelegramUsername() тут всегда вернёт null. t.me/+<hash> —
        // актуальный официальный формат (core.telegram.org/api/links),
        // работает как внешний фолбэк так же, как t.me/<username> выше.
        const invite = extractTelegramInvite(special.href)
        if (invite) return `https://t.me/+${invite}`

        return null
    }

    return null
}

// Первый сегмент пути https://t.me/<...> (или www.t.me) — голый, без decode-
// валидации, её делают вызывающие extractTelegramUsername/Invite ниже.
// null, если href вообще не t.me-ссылка.
function _tMePathSegment(href) {
    try {
        const u = new URL(href)
        if (!/(^|\.)t\.me$/i.test(u.hostname)) return null
        return u.pathname.replace(/^\/+/, '').split('/')[0] || null
    } catch {
        return null
    }
}

// Отдельно от translateDeepLinkUrl(), т.к. нужен голый username и для
// t.me-фолбэка, и для same-origin hash-навигации внутри уже открытой вкладки.
// Источники: tg://resolve?domain=X (query) и https://t.me/<username> (путь)
// — на практике инвайты почти всегда пересылают именно как t.me-ссылку
// (её строит сам Telegram при "поделиться"), а не как tg://resolve, поэтому
// без поддержки пути фича не срабатывала на самый частый реальный случай.
function extractTelegramUsername(href) {
    if (typeof href !== 'string') return null

    const queryMatch = href.match(/[?&]domain=([^&]+)/i)
    if (queryMatch) {
        try {
            const domain = decodeURIComponent(queryMatch[1])
            // Только username-подобные значения — не даём decodeURIComponent
            // результату протащить что-то похожее на путь/query в итоговый URL.
            return /^[a-zA-Z0-9_]{1,64}$/.test(domain) ? domain : null
        } catch {
            return null
        }
    }

    const segment = _tMePathSegment(href)
    if (!segment || segment.startsWith('+') || segment === 'joinchat') return null
    return /^[a-zA-Z0-9_]{1,64}$/.test(segment) ? segment : null
}

// Голый инвайт-хэш из tg://join?invite=<hash> (query), https://t.me/+<hash>
// (актуальный формат) или https://t.me/joinchat/<hash> (легаси-формат) —
// нужен и для t.me/+<hash>-фолбэка в translateDeepLinkUrl(), и для
// same-origin навигации в navigateTelegramWebview().
function extractTelegramInvite(href) {
    if (typeof href !== 'string') return null

    const queryMatch = href.match(/[?&]invite=([^&]+)/i)
    if (queryMatch) {
        try {
            const hash = decodeURIComponent(queryMatch[1])
            // Telegram выдаёт инвайт-хэши как URL-safe токены — та же защита от
            // протаскивания постороннего пути/query через decodeURIComponent,
            // что и у extractTelegramUsername/extractMaxJoinToken выше.
            return /^[A-Za-z0-9_-]{1,64}$/.test(hash) ? hash : null
        } catch {
            return null
        }
    }

    const segment = _tMePathSegment(href)
    if (segment && segment.startsWith('+')) {
        const hash = segment.slice(1)
        return /^[A-Za-z0-9_-]{1,64}$/.test(hash) ? hash : null
    }
    if (segment === 'joinchat') {
        try {
            const secondSegment = new URL(href).pathname.replace(/^\/+/, '').split('/')[1] || ''
            return /^[A-Za-z0-9_-]{1,64}$/.test(secondSegment) ? secondSegment : null
        } catch {
            return null
        }
    }
    return null
}

// BUGFIX ("клик по tg://resolve — переключает на вкладку ТГ, но там вместо
// чата открывается страница-заглушка похожая на браузер, и вкладка потом не
// реагирует ни на что"): раньше routeDeepLink() всегда грузил
// https://t.me/<username> через loadURL() ПРЯМО В уже залогиненную вкладку
// web.telegram.org. t.me — ДРУГОЙ origin (свои куки/сессия), поэтому вместо
// навигации внутри уже открытого веб-клиента показывалась сама t.me
// лендинг-страница (она рассчитана на переход из обычного браузера — делает
// client-detection и пытается редиректнуть на tg://, показывая по пути
// generic "открыть в браузере/приложении" UI — отсюда "выглядит как другой
// браузер"). Открытие tg:// ИЗНУТРИ webview Electron не может завершиться
// успехом (это не зарегistrированный для webview-контента протокол) — сама
// попытка навигации подвешивает фрейм, отсюда "больше ни на что не
// реагирует". Вместо полной навигации на другой origin — если целевая
// вкладка уже открыта на web.telegram.org/<client>/, просто меняем hash
// (#@username) ЧЕРЕЗ executeJavaScript: это тот же приём, которым сам
// t.me/<username> в итоге открывает чат в веб-клиенте, но без ухода с
// текущего origin/сессии и без второго прыжка через посадочную страницу.
// `target` — { type: 'username', value } для tg://resolve или
// { type: 'invite', value } для tg://join?invite= (приватные ссылки-
// приглашения, см. extractTelegramInvite выше).
function navigateTelegramWebview(webview, target) {
    let currentUrl
    try { currentUrl = webview.getURL() || '' } catch { currentUrl = '' }

    const clientMatch = currentUrl.match(/^https:\/\/web\.telegram\.org\/(k|a|z)\//i)
    if (clientMatch) {
        if (target.type === 'username') {
            // Same-origin SPA-навигация: меняем только hash, страница не
            // перезагружается, сессия/логин не трогаются.
            webview.executeJavaScript(`location.hash = '#@${target.value}'`).catch(() => {})
            return
        }

        // invite: у join-по-хэшу нет короткого #@username-роута — вместо
        // него веб-клиенты Telegram сами умеют разбирать произвольный
        // tg://-URI, переданный через хэш `#?tgaddr=<encoded-uri>` (этим же
        // приёмом t.me сам редиректит на web.telegram.org при переходе из
        // обычного браузера — см. core.telegram.org/api/links про формат
        // tg://join?invite=<hash>). Тот же same-origin эффект, что и у
        // #@username: без ухода с текущего origin/сессии.
        const uri = `tg://join?invite=${target.value}`
        webview.executeJavaScript(`location.hash = '#?tgaddr=${encodeURIComponent(uri)}'`).catch(() => {})
        return
    }

    // Неизвестный/другой клиент Telegram (не web.telegram.org/k|a|z/) —
    // ничего умнее t.me тут предложить не можем, это тот же фолбэк, что и
    // при отсутствии вкладки вообще.
    try {
        webview.loadURL(target.type === 'username' ? `https://t.me/${target.value}` : `https://t.me/+${target.value}`)
    } catch {}
}

// Токен инвайта из https://max.ru/join/<token> — нужен отдельно от
// translateDeepLinkUrl(), т.к. для same-origin навигации в уже открытой
// вкладке нужен голый токен, а не полный max.ru-URL.
function extractMaxJoinToken(href) {
    if (typeof href !== 'string') return null
    const match = href.match(/^https:\/\/max\.ru\/join\/([^/?#]+)/i)
    if (!match) return null
    const token = match[1]
    return /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : null
}

// BUGFIX ("Макс тоже — только лендинг показывает, перехода нет"): та же
// природа бага, что и у Telegram выше, подтверждено вживую (curl): сама
// инвайт-ссылка https://max.ru/join/<token> и реальный веб-клиент MAX
// (обычно https://web.max.ru/, см. renderer/constants.js) — ДВЕ РАЗНЫЕ
// SvelteKit-сборки на РАЗНЫХ origin (разные хэши иммутабельных чанков —
// max.ru отдаёт свой entry/start.*.js, web.max.ru свой; разные
// куки/сессия/localStorage). loadURL(originalHref) уводил уже залогиненную
// вкладку web.max.ru на публичный max.ru/join — оттуда и "только лендинг,
// перехода нет". При этом web.max.ru/join/<token> отдаёт ТОТ ЖЕ SPA-шелл,
// что и web.max.ru/ (проверено — идентичный HTML, 200), т.е. это валидный
// клиентский роут внутри уже открытого приложения. В отличие от Telegram
// (hash-based роутинг в k/a/z клиентах), MAX — путь-based роутинг
// (SvelteKit), поэтому здесь не нужен hash-трюк через executeJavaScript:
// обычная same-origin loadURL() на /join/<token> того же хоста — полная
// перезагрузка, но БЕЗ смены origin, так что сессия (кука/localStorage
// текущего хоста) сохраняется, а SPA сама разрешает join уже
// авторизованным пользователем.
function navigateMaxWebview(webview, token) {
    let currentUrl
    try { currentUrl = webview.getURL() || '' } catch { currentUrl = '' }

    let targetOrigin = 'https://web.max.ru'
    try {
        const parsed = new URL(currentUrl)
        // Берём origin реально загруженной сейчас вкладки (обычно
        // web.max.ru, но если пользователь сам завёл мессенджер на другом
        // поддомене max.ru — останемся на нём, а не силой уведём на
        // web.max.ru). Дефолт 'https://web.max.ru' — на случай, если
        // getURL() ещё не вернул валидный max.ru-адрес (например, вкладка
        // только что создана и ещё не успела загрузиться).
        if (/(^|\.)max\.ru$/i.test(parsed.hostname)) targetOrigin = parsed.origin
    } catch {}

    try { webview.loadURL(`${targetOrigin}/join/${token}`) } catch {}
}

// ── OAuth-брокер для входа через сторонний провайдер внутри webview ────────
// Большинство OAuth-провайдеров (в первую очередь Google) сознательно
// отказывают во входе изнутри embedded-браузера — Electron <webview>
// детектится как небезопасный встроенный браузер, и вместо формы входа
// показывается "This browser or app may not be secure" (или форма просто
// виснет). Решение — не webview, а обычное popup-окно с нормальным
// desktop-UA Chrome и ТОЙ ЖЕ session partition, что и у мессенджера (см.
// main/ipc/window.js open-popup-window → isOAuthBroker): такое окно
// проходит проверку провайдера, а полученные cookies/сессия остаются в
// той же партиции, что и у уже открытого webview мессенджера.
// BUGFIX ("Яндекс открыл браузер для авторизации и умерла сессия там" —
// live-reproduced): этот файл раньше держал свою отдельную копию списка без
// passport.yandex.ru (Яндекс.Почта логинит именно через него, не через
// oauth.yandex.ru), а main/services/oauthProviders.js держал ЕЩЁ одну
// отдельную копию с тем же пробелом. Обе рассинхронизировались с
// shared/oauthProviders.js, который уже содержал верный список. Импортируем
// вместо повторного дублирования.
const { OAUTH_PROVIDER_HOST_RE, isOAuthProviderUrl } = require('../shared/oauthProviders')

// BUGFIX ("клик по другому сервису в шапке Яндекс.Почты открывал внешний
// браузер"): 'will-navigate' ниже сравнивал ТОЧНЫЙ hostname навигации с
// hostname мессенджера — но многие сайты (Яндекс, Google и т.п. — целые
// "порталы") держат разные свои сервисы на разных поддоменах одного и того
// же домена (mail.yandex.ru → disk.yandex.ru), между которыми пользователь
// естественно ожидает переходить, не покидая приложение — авторизация у них
// общая на весь домен. Сравниваем базовый домен (последние 2 сегмента) вместо
// точного хоста — переход на ДРУГОЙ поддомен ТОГО ЖЕ домена остаётся внутри
// вкладки, во внешний браузер уходит только реально другой домен. Наивная
// эвристика (не использует публичный suffix-list, значит некорректна для
// доменов вида *.co.uk), но здесь это даже лучше, чем предыдущая крайность
// "любой поддомен — уже не свой".
function baseDomain(hostname) {
    const parts = String(hostname || '').split('.').filter(Boolean)
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.')
}

// BUGFIX ("Google/Yandex OAuth внутри webview — постоянный отказ входа"):
// addWebview() ниже раньше прибивал 'useragent' гвоздём к литералу
// "...Chrome/120.0.0.0..." (заморожен на момент первого коммита проекта).
// Electron 39.8.10 несёт куда более новый Chromium, но UA-строка на
// <webview> НЕ трогает Sec-CH-UA / Sec-CH-UA-Full-Version-List Client Hints
// и navigator.userAgentData — Chromium формирует их из своей РЕАЛЬНОЙ
// версии независимо от атрибута useragent. Получается UA-строка, кричащая
// "Chrome 120", рядом с Client Hints, доказывающими совсем другой (намного
// новее) настоящий Chromium — комбинация, которую живые браузеры никогда не
// производят и которую как раз ищут анти-embedded-browser проверки
// OAuth-провайдеров (в первую очередь у Google — см. OAUTH_PROVIDER_HOST_RE
// выше) и антибот-системы отдельных сайтов (Яндекс это уже подтверждённо
// делал точечно на alice.yandex.ru). Раньше эта же починка (через
// electronAPI.chromeVersion, см. preload.js) была реализована только в
// renderer/messengers.js — но addWebview именно оттуда нигде не
// используется (см. соответствующий комментарий там), так что реальные
// вкладки мессенджеров всё это время продолжали получать рассинхронизированный
// UA. Кэшируем один раз — chromeVersion не меняется в течение жизни процесса.
let cachedWebviewUserAgent = null
function buildWebviewUserAgent() {
    if (cachedWebviewUserAgent) return cachedWebviewUserAgent

    const chromeVersion = window.electronAPI?.chromeVersion
    const versionToken = chromeVersion ? `${chromeVersion}.0.0.0`.split('.').slice(0, 4).join('.') : null

    cachedWebviewUserAgent = versionToken
        ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versionToken} Safari/537.36`
        // Фолбэк на старый литерал только если реальную версию прочитать не
        // удалось — лучше потенциально устаревший UA, чем вообще никакого.
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    return cachedWebviewUserAgent
}

function createWebviewTabsApi({
    state,
    store,
    tabsBar,
    tabsContent,
    findCount,
    webviewContextMenu,
    preloadPath,
    ipcRenderer,
    invokeIpc,
    tGet,
    openFindBar,
    openSettings,
    getActiveWebview,
    applyTabZoom,
    applyAppZoom,
    onMediaState,
    switchTab,
    removeMessenger,
    watchWebview,
    showContextMenu
}) {
    if (webviewContextMenu && webviewContextMenu.parentElement !== document.body) {
        document.body.appendChild(webviewContextMenu)
    }

    const DEEP_LINK_HOST_MATCHERS = {
        telegram: /(^|\.)telegram\.org$|(^|\.)t\.me$/i,
        max: /(^|\.)max\.ru$/i
    }

    // BUGFIX ("при 2 вкладках одного сервиса клик во второй открывает
    // ссылку в первой"): раньше здесь был просто .find() — первый попавшийся
    // мессенджер нужного сервиса, независимо от того, из какой именно
    // вкладки пришёл клик. С двумя Telegram-вкладками ссылка, кликнутая во
    // второй, всегда уводила в первую. preferredId — id вкладки-источника
    // клика (если она сама подходит под нужный сервис — остаёмся в ней).
    function findMessengerForDeepLinkService(service, preferredId) {
        const re = DEEP_LINK_HOST_MATCHERS[service]
        if (!re) return null

        const matches = (m) => {
            try { return re.test(new URL(m.url).hostname) } catch { return false }
        }

        if (preferredId) {
            const preferred = state.activeMessengers.find((m) => m.id === preferredId)
            if (preferred && matches(preferred)) return preferred
        }

        return state.activeMessengers.find(matches)
    }

    // Пытается открыть распознанный диплинк в уже существующей вкладке нужного
    // сервиса. Возвращает true, если получилось (вкладка переключена и
    // загружена) — false означает "подходящей вкладки нет", и вызывающий код
    // должен откатиться на прежнее поведение (open-url → внешний браузер/ОС).
    // sourceId — id вкладки, в которой произошёл клик (см. BUGFIX выше);
    // не передаётся для диплинков, пришедших из ОС (routeDeepLinkFromMain),
    // там источника-вкладки нет.
    function routeDeepLink(special, sourceId) {
        const url = translateDeepLinkUrl(special)
        if (!url) return false

        const target = findMessengerForDeepLinkService(special.service, sourceId)
        if (!target) return false

        switchTab(target.id)
        const targetWebview = document.getElementById(`webview-${target.id}`)
        if (targetWebview) {
            if (special.service === 'telegram') {
                // См. подробный BUGFIX-комментарий у navigateTelegramWebview():
                // здесь НЕ грузим `url` (https://t.me/<username или +hash>)
                // через loadURL() — это увело бы уже залогиненную вкладку
                // web.telegram.org на чужой origin (t.me) и подвесило бы её.
                // translateDeepLinkUrl() уже провалидировал username/invite
                // выше (url !== null), так что повторный extract* здесь
                // просто дублирует уже пройденную проверку — no-op в плане
                // безопасности, но избегает парсинга `url` обратно.
                const username = extractTelegramUsername(special.href)
                if (username) {
                    navigateTelegramWebview(targetWebview, { type: 'username', value: username })
                } else {
                    const invite = extractTelegramInvite(special.href)
                    if (invite) navigateTelegramWebview(targetWebview, { type: 'invite', value: invite })
                }
            } else if (special.service === 'max') {
                // См. подробный BUGFIX-комментарий у navigateMaxWebview():
                // здесь НЕ грузим `url` (исходный https://max.ru/join/...)
                // — это увело бы уже залогиненную вкладку web.max.ru на
                // другой origin (публичный max.ru) без перехода к чату.
                const token = extractMaxJoinToken(special.href)
                if (token) navigateMaxWebview(targetWebview, token)
            } else {
                try { targetWebview.loadURL(url) } catch {}
            }
        }
        return true
    }

    // Диплинк, пришедший из ОС (клик по tg://resolve?domain=... в СТОРОННЕМ
    // браузере/приложении — main/services/protocol.js регистрирует Centrio
    // обработчиком tg:// и пересылает сюда через 'deep-link-route', см.
    // preload.js validReceiveChannels). В отличие от клика внутри webview,
    // тут нет "фолбэка на open-url тем же tg://" — раз ОС уже отдала эту
    // ссылку НАМ как зарегистрированному обработчику, повторный
    // shell.openExternal(tg://...) рисковал бы зациклиться обратно на
    // Centrio. Если подходящей вкладки Telegram нет — открываем обычный
    // https://t.me/<domain> во внешнем браузере как безопасный, не
    // зацикливающийся фолбэк (ровно то же поведение, что было бы без этой
    // фичи вообще).
    function routeDeepLinkFromMain(special) {
        if (routeDeepLink(special)) return
        const url = translateDeepLinkUrl(special)
        if (url) ipcRenderer.send('open-url', url)
    }
    ipcRenderer.on('deep-link-route', routeDeepLinkFromMain)

    // BUGFIX (2026-08-28, "когда играет Яндекс музыка - он не определяет,
    // что музыка играет"): основной, реально рабочий канал для мини-плеера —
    // main-процесс сам опрашивает гостевую страницу через executeJavaScript
    // (main/bootstrap/registerAppEvents.js, startMediaStatePolling) и шлёт
    // готовый {playing, title} сюда напрямую, в обход preload-атрибута
    // <webview>, который на этой версии Electron не исполняется в гостевой
    // странице вообще ни для одного мессенджера — см. 'media-state' ветку в
    // 'ipc-message' ниже, которая была единственным источником раньше и
    // поэтому никогда не срабатывала (не только для Яндекс Музыки — для
    // всех). Та ветка оставлена как безобидный фолбэк на случай, если
    // preload когда-нибудь снова заработает сам по себе.
    ipcRenderer.on('media-state', (messengerId, payload) => {
        if (typeof onMediaState === 'function') onMediaState(messengerId, payload)
    })

    // OAuth-брокер (main/ipc/window.js open-popup-window → isOAuthBroker)
    // редиректнул на origin мессенджера и закрылся сам — cookies/сессия
    // теперь лежат в той же persist:<id> партиции, что и у webview.
    // Просто перезагружаем вкладку, чтобы она подхватила уже
    // установленный логин без ручного действия пользователя.
    ipcRenderer.on('oauth-popup-done', (payload) => {
        const partition = payload && payload.partition
        if (typeof partition !== 'string' || !partition.startsWith('persist:')) return
        const messengerId = partition.slice('persist:'.length)
        // BUGFIX (2026-08-25, regression: overlay stayed up after a
        // successful login because this handler never touched the overlay
        // state at all — it only relied on the SEPARATE 'oauth-popup-closed'
        // message (sent from popup.once('closed') in wireOAuthPopup(), see
        // main/ipc/window.js) to clear it. That's normally a moment later,
        // but nothing guaranteed it would ever arrive (see the safety-net
        // timer below) — clearing it right here too, the instant we know the
        // flow succeeded, removes one avoidable window for the stuck-overlay
        // symptom instead of only patching it via the generic timeout.
        clearOAuthOverlayTimer(messengerId)
        oauthPendingMessengerIds.delete(messengerId)
        updateOAuthOverlay()
        const webview = document.getElementById(`webview-${messengerId}`)
        if (!webview) return

        // BUGFIX (2026-08-26, live user report: "Гугл - проходит авторизацию
        // в окне, закрывает окно и показывает Centrio с чёрным окном Gmail"):
        // a blind reload() re-fetches whatever URL the guest webview happened
        // to be sitting on BEFORE the popup opened — usually the pre-auth
        // login prompt/blank state, not where the popup actually finished.
        // main/ipc/window.js now forwards the popup's own final settled URL
        // (finalUrl) alongside the partition; navigate there directly so the
        // now-authenticated cookies (shared via the same persist:<id>
        // partition) actually render something instead of a stale pre-login
        // page. Re-validated here (defense-in-depth, same rationale as
        // translateDeepLinkUrl above) rather than trusted verbatim — only a
        // plain http(s) URL is ever passed to loadURL().
        let finalUrl = null
        if (typeof payload.finalUrl === 'string') {
            try {
                const parsed = new URL(payload.finalUrl)
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') finalUrl = parsed.href
            } catch {}
        }
        try {
            if (finalUrl) {
                webview.loadURL(finalUrl)
            } else {
                webview.reload()
            }
        } catch {}
    })

    // FEATURE (2026-08-24, "всплывающее окно всё-равно открывается ...
    // нужно заглушку на основном окне ставить - типа авторизация через окно
    // отдельное" — live user request): попап — ожидаемое поведение (Google/
    // Яндекс сами блокируют вход внутри embedded-браузера), но вкладка под
    // ним выглядит так, будто просто ничего не происходит. main-процесс
    // шлёт 'oauth-popup-started'/'oauth-popup-closed' из общего choke-point
    // wireOAuthPopup() (main/ipc/window.js) — здесь просто перекрываем ТУ
    // вкладку, для мессенджера которой сейчас идёт OAuth, понятным
    // объяснением (остальные вкладки остаются рабочими).
    //
    // Видимость завязана не на switchTab() — эта функция определена
    // снаружи (renderer.js) и переключает класс webview.active в местах,
    // которые не всегда идут через локальную ссылку на неё в этом модуле
    // (например прямые клики по вкладке). Вместо перехвата каждого места
    // вызова — MutationObserver за атрибутом class внутри tabsContent:
    // устойчиво к ЛЮБОМУ способу переключения активной вкладки.
    const oauthPendingMessengerIds = new Set()
    let oauthOverlayEl = null

    // BUGFIX (2026-08-25, live regression: "И ГРОК И ЯНДЕКС ТЕПЕРЬ ЗАВИСАЕТ
    // ПОСЛЕ АВТОРИЗАЦИИ И НИЧЕГО БОЛЬШЕ НЕ НАЖИМАЕТСЯ" — reported right
    // after this overlay feature shipped): the overlay's ONLY way to hide
    // itself was the main process actually sending 'oauth-popup-closed',
    // which only happens if the popup BrowserWindow fires its native
    // 'closed' event (see wireOAuthPopup() in main/ipc/window.js). Several
    // real OAuth flows never do that on their own:
    //   - Providers (Yandex's passport.yandex.ru in particular) that finish
    //     a popup-based login by relying on `window.opener.postMessage(...)`
    //     and expecting the OPENER page's own script to close the popup —
    //     but our popup is a plain `new BrowserWindow()` on the manual
    //     (will-navigate) broker path with no real opener wired to relay
    //     that message, so the popup is left sitting on a "you're signed
    //     in now" screen forever, never closing itself.
    //   - The already-known deliberate "leave popup open" cases
    //     (did-fail-load exhausted retries, Google's embedded-browser
    //     rejection page) — intentional so the user can see what happened,
    //     but they ALSO never fire 'closed' by design.
    // In both cases oauthPendingMessengerIds keeps the messenger id forever,
    // .oauth-popup-overlay stays "show" (it's pointer-events: auto — see
    // styles.css — specifically so users can't fat-finger the frozen-looking
    // tab underneath mid-auth), and the tab is permanently unclickable —
    // exactly the reported symptom. This is a client-side backstop
    // independent of ever root-causing every provider's popup-close
    // behavior: whatever the main process does or doesn't send, the overlay
    // for a given messenger is now hard-capped at this many ms before we
    // force-clear it ourselves and reload the tab so it can pick up
    // whatever session state the popup actually left behind (mirrors the
    // legitimate 'oauth-popup-done' reload path above).
    const OAUTH_OVERLAY_MAX_MS = 60000
    const oauthOverlayTimers = new Map()

    function clearOAuthOverlayTimer(messengerId) {
        const timer = oauthOverlayTimers.get(messengerId)
        if (timer) {
            clearTimeout(timer)
            oauthOverlayTimers.delete(messengerId)
        }
    }

    function ensureOAuthOverlay() {
        if (oauthOverlayEl && oauthOverlayEl.isConnected) return oauthOverlayEl
        oauthOverlayEl = document.createElement('div')
        oauthOverlayEl.className = 'oauth-popup-overlay'
        oauthOverlayEl.innerHTML =
            '<div class="oauth-popup-overlay__spinner"></div>' +
            '<div class="oauth-popup-overlay__title" data-role="title"></div>' +
            '<div class="oauth-popup-overlay__hint" data-role="hint"></div>'
        tabsContent.appendChild(oauthOverlayEl)
        return oauthOverlayEl
    }

    function updateOAuthOverlay() {
        const activeWebview = tabsContent.querySelector('webview.active')
        const activeId = activeWebview && activeWebview.id.startsWith('webview-')
            ? activeWebview.id.slice('webview-'.length)
            : null

        if (!activeId || !oauthPendingMessengerIds.has(activeId)) {
            if (oauthOverlayEl) oauthOverlayEl.classList.remove('show')
            return
        }

        const overlay = ensureOAuthOverlay()
        const messenger = state.activeMessengers.find((m) => m.id === activeId)
        // BUGFIX (2026-08-26, "в момент открытия окна с гугл авторизацией
        // Centrio намертво зависает, в диспетчере никаких зависаний нет" —
        // live-reproduced: renderer главного окна крутил 100% одного ядра).
        // Присваивание textContent удаляет старый текстовый узел и вставляет
        // новый, т.е. это childList-мутация. Наблюдатель ниже слушает
        // tabsContent с { childList: true, subtree: true }, а оверлей лежит
        // внутри tabsContent — так что каждый проход этой функции порождал
        // мутации, которые снова будили наблюдателя. Колбэки MutationObserver
        // выполняются как микрозадачи, а очередь микрозадач вычерпывается
        // целиком до возврата в event loop, поэтому это был не «лишний
        // перерендер», а бесконечный цикл: поток renderer'а никогда не
        // возвращался в цикл событий — ни отрисовки, ни обработки кликов, ни
        // ответа на 'oauth-popup-closed' (оттого и «закрытие попапа не
        // помогает»). Главный процесс при этом жив и исправно качает
        // сообщения Windows, поэтому диспетчер задач и показывал «Отвечает».
        // Пишем только при реальном изменении — второй проход не порождает
        // мутаций, и цепочка обрывается.
        setTextIfChanged(
            overlay.querySelector('[data-role="title"]'),
            tGet('webview.oauthOverlayTitle', { name: messenger ? messenger.name : '' })
        )
        setTextIfChanged(overlay.querySelector('[data-role="hint"]'), tGet('webview.oauthOverlayHint'))
        overlay.classList.add('show')
    }

    function setTextIfChanged(el, text) {
        if (el && el.textContent !== text) el.textContent = text
    }

    function messengerIdFromOAuthPayload(payload) {
        const partition = payload && payload.partition
        if (typeof partition !== 'string' || !partition.startsWith('persist:')) return null
        return partition.slice('persist:'.length)
    }

    ipcRenderer.on('oauth-popup-started', (payload) => {
        const messengerId = messengerIdFromOAuthPayload(payload)
        if (!messengerId) return
        oauthPendingMessengerIds.add(messengerId)
        updateOAuthOverlay()

        clearOAuthOverlayTimer(messengerId)
        const timer = setTimeout(() => {
            oauthOverlayTimers.delete(messengerId)
            if (!oauthPendingMessengerIds.has(messengerId)) return
            console.warn(`[oauth-overlay] safety-net timeout hit for messengerId=${messengerId} — main process never sent oauth-popup-closed, force-clearing overlay`)
            oauthPendingMessengerIds.delete(messengerId)
            updateOAuthOverlay()
            const webview = document.getElementById(`webview-${messengerId}`)
            if (webview) {
                try { webview.reload() } catch {}
            }
        }, OAUTH_OVERLAY_MAX_MS)
        oauthOverlayTimers.set(messengerId, timer)
    })

    ipcRenderer.on('oauth-popup-closed', (payload) => {
        const messengerId = messengerIdFromOAuthPayload(payload)
        if (!messengerId) return
        clearOAuthOverlayTimer(messengerId)
        oauthPendingMessengerIds.delete(messengerId)
        updateOAuthOverlay()
    })

    // FEATURE (2026-08-26, "Добавить как сервис" button in the Franz-style
    // OAuth popup chrome — see attachOAuthPopupChrome() in main/ipc/window.js):
    // addMessenger() (renderer/messengers.js) already does the full job of
    // adding a new tab from a bare {name, url, icon} — reused as-is rather
    // than duplicating its tab/webview/save logic here. No icon is passed;
    // createMessengerItem()'s own iconSources fallback (Google favicon
    // service) already handles a missing icon.
    ipcRenderer.on('oauth-add-as-service', (payload) => {
        const url = payload && payload.url
        if (typeof url !== 'string' || !url) return
        let name = url
        try { name = new URL(url).hostname.replace(/^www\./, '') } catch {}
        if (typeof addMessenger === 'function') {
            addMessenger({ name, url, icon: '' })
        }
    })

    if (tabsContent && typeof MutationObserver !== 'undefined') {
        // classList.add/remove — идемпотентны (DOMTokenList не создаёт новую
        // мутацию, если токен уже присутствует/отсутствует), так что
        // собственные show/hide-переключения оверлея ниже не зацикливают
        // этот же observer сами на себя.
        const oauthOverlayObserver = new MutationObserver(() => {
            updateOAuthOverlay()
            // Страховка второго уровня к BUGFIX в updateOAuthOverlay выше:
            // сбрасываем записи, порождённые её собственными правками DOM, до
            // того как они успеют разбудить этот же колбэк. Даже если сюда
            // когда-нибудь вернут неидемпотентную запись в DOM, зациклиться
            // уже не получится. Состояние оверлея на момент вызова
            // takeRecords() актуально — updateOAuthOverlay() отработала строкой
            // выше по текущему DOM.
            oauthOverlayObserver.takeRecords()
        })
        oauthOverlayObserver.observe(tabsContent, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true })
    }

    function hideWebviewContextMenu() {
        if (!webviewContextMenu) return
        webviewContextMenu.classList.remove('show')
        webviewContextMenu.style.visibility = ''
    }

    function bindGlobalMenuClose() {
        if (document.__centrioWebviewMenuCloseBound) return
        document.__centrioWebviewMenuCloseBound = true

        document.addEventListener('mousedown', (e) => {
            if (!webviewContextMenu) return
            if (!webviewContextMenu.classList.contains('show')) return
            if (webviewContextMenu.contains(e.target)) return

            hideWebviewContextMenu()
        })

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return
            hideWebviewContextMenu()
        })

        window.addEventListener('blur', () => {
            hideWebviewContextMenu()
        })

        window.addEventListener('resize', () => {
            hideWebviewContextMenu()
        })

        document.addEventListener('scroll', () => {
            hideWebviewContextMenu()
        }, true)
    }

    async function confirmRemoveMessenger(messenger) {
        const message = tGet("webview.removeConfirm").replace("{name}", messenger.name)

        if (typeof window.showConfirmModal === 'function') {
            return await window.showConfirmModal({
                title: tGet("webview.removeTitle"),
                message,
                confirmText: tGet("webview.removeBtn"),
                cancelText: tGet("webview.cancelBtn"),
                danger: true
            })
        }

        return window.confirm(message)
    }

    function addTab(messenger) {
        const tab = document.createElement('div')
        tab.className = 'tab'
        tab.id = `tab-${messenger.id}`

        const hostname = (() => {
            try {
                return new URL(messenger.url).hostname
            } catch {
                return ''
            }
        })()

        const tabMain = document.createElement('div')
        tabMain.className = 'tab-main'

        const icon = document.createElement('img')
        icon.width = 16
        icon.height = 16
        icon.className = 'tab-icon'
        icon.src = messenger.icon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
        icon.onerror = () => {
            if (icon.src.includes('logomessenger') || icon.src.includes('assets')) {
                icon.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
                icon.onerror = () => { icon.style.display = 'none' }
            } else {
                icon.style.display = 'none'
            }
        }

        const title = document.createElement('span')
        title.className = 'tab-name'
        title.textContent = messenger.name

        const closeBtn = document.createElement('button')
        closeBtn.className = 'tab-close'
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', tGet("webview.removeTabLabel").replace("{name}", messenger.name))
        closeBtn.setAttribute('title', tGet("webview.removeTabLabel").replace("{name}", messenger.name))
        closeBtn.dataset.id = messenger.id
        closeBtn.textContent = '✕'

        tabMain.appendChild(icon)
        tabMain.appendChild(title)
        tab.appendChild(tabMain)
        tab.appendChild(closeBtn)

        tab.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) return
            switchTab(messenger.id)
        })

        closeBtn.addEventListener('click', async (e) => {
            e.preventDefault()
            e.stopPropagation()

            const confirmed = await confirmRemoveMessenger(messenger)
            if (!confirmed) return

            removeMessenger(messenger.id)
        })

        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()

            switchTab(messenger.id)

            if (typeof showContextMenu === 'function') {
                showContextMenu(e, messenger.id)
            }
        })

        initTabDrag(tab, messenger.id)
        tabsBar.appendChild(tab)
    }

    let _tabDragSrcId = null

    // ── Порядок вкладок (персист, аналогично sidebarOrder в sidebar-dnd-bind.js) ──
    function saveTabOrder() {
        const order = Array.from(tabsBar.querySelectorAll(':scope > .tab'))
            .map(t => t.id.replace('tab-', ''))
        store.set('tabOrder', order)
    }

    function loadTabOrder() {
        const order = store.get('tabOrder', [])
        if (!order.length) return
        order.forEach(id => {
            const el = document.getElementById(`tab-${id}`)
            if (el && el.parentElement === tabsBar) tabsBar.appendChild(el)
        })
    }

    function initTabDrag(tab, messengerId) {
        tab.setAttribute('draggable', 'true')

        tab.addEventListener('dragstart', (e) => {
            _tabDragSrcId = messengerId
            setTimeout(() => tab.classList.add('tab-dragging'), 0)
            e.dataTransfer.effectAllowed = 'move'
            e.stopPropagation()
        })

        tab.addEventListener('dragend', () => {
            tab.classList.remove('tab-dragging')
            tabsBar.querySelectorAll('.tab').forEach(t =>
                t.classList.remove('tab-drop-before', 'tab-drop-after'))
            _tabDragSrcId = null
        })

        tab.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!_tabDragSrcId || _tabDragSrcId === messengerId) return
            const rect = tab.getBoundingClientRect()
            const insertBefore = e.clientX < rect.left + rect.width / 2
            tabsBar.querySelectorAll('.tab').forEach(t =>
                t.classList.remove('tab-drop-before', 'tab-drop-after'))
            tab.classList.add(insertBefore ? 'tab-drop-before' : 'tab-drop-after')
            e.dataTransfer.dropEffect = 'move'
        })

        tab.addEventListener('dragleave', (e) => {
            if (!tab.contains(e.relatedTarget))
                tab.classList.remove('tab-drop-before', 'tab-drop-after')
        })

        tab.addEventListener('drop', (e) => {
            e.preventDefault()
            e.stopPropagation()
            tab.classList.remove('tab-drop-before', 'tab-drop-after')
            if (!_tabDragSrcId || _tabDragSrcId === messengerId) return
            const srcTab = document.getElementById(`tab-${_tabDragSrcId}`)
            if (!srcTab) return
            const rect = tab.getBoundingClientRect()
            const insertBefore = e.clientX < rect.left + rect.width / 2
            if (insertBefore) tabsBar.insertBefore(srcTab, tab)
            else tabsBar.insertBefore(srcTab, tab.nextSibling)
            saveTabOrder()
        })
    }

    function attachFindListener(webview) {
        webview.addEventListener('found-in-page', (e) => {
            const { activeMatchOrdinal, matches } = e.result
            if (matches > 0) {
                findCount.textContent = `${activeMatchOrdinal} / ${matches}`
                findCount.style.color = 'var(--text-secondary)'
            } else {
                findCount.textContent = tGet('search.notFound')
                findCount.style.color = 'var(--danger)'
            }
        })
    }

    function attachContextMenu(webview, messenger) {
        webview.addEventListener('ipc-message', (e) => {
            if (e.channel === 'close-context-menu') {
                hideWebviewContextMenu()
                return
            }

            if (e.channel === 'image-data') {
                const dataUrl = e.args[0]
                if (dataUrl) {
                    if (state._wvCopyMode) {
                        // Копируем в буфер обмена через главный процесс
                        invokeIpc('copy-image-to-clipboard', dataUrl).catch(() => {})
                    } else {
                        // Сохраняем в файл
                        ipcRenderer.send('save-image-data', dataUrl, state.wvContextParams._filePath || '')
                    }
                }
                state._wvCopyMode = false
                return
            }

            // Горячие клавиши, пересланные из webview (когда фокус внутри)
            if (e.channel === 'keyboard-shortcut') {
                const shortcut = e.args[0]
                if (!shortcut) return

                if (shortcut === 'ctrl+r') {
                    if (state.activeTabId) {
                        document.getElementById(`webview-${state.activeTabId}`)?.reload()
                    }
                    return
                }

                if (shortcut === 'ctrl+tab') {
                    if (!state.activeMessengers.length) return
                    const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
                    if (idx === -1) return
                    switchTab(state.activeMessengers[(idx + 1) % state.activeMessengers.length].id)
                    return
                }

                if (shortcut === 'ctrl+shift+tab') {
                    if (!state.activeMessengers.length) return
                    const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
                    if (idx === -1) return
                    switchTab(state.activeMessengers[(idx - 1 + state.activeMessengers.length) % state.activeMessengers.length].id)
                    return
                }

                const numMatch = shortcut.match(/^ctrl\+(\d)$/)
                if (numMatch) {
                    const idx = parseInt(numMatch[1]) - 1
                    if (state.activeMessengers[idx]) switchTab(state.activeMessengers[idx].id)
                    return
                }

                if (shortcut === 'ctrl+f') {
                    if (typeof openFindBar === 'function') openFindBar()
                    return
                }

                if (shortcut === 'ctrl+search') {
                    document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, code: 'KeyK', key: 'k', bubbles: true, cancelable: true }))
                    return
                }

                if (shortcut === 'ctrl+comma') {
                    if (typeof openSettings === 'function') openSettings()
                    return
                }

                if (shortcut === 'ctrl+=') {
                    if (typeof applyTabZoom === 'function') applyTabZoom(state.tabZoomLevel + 0.25)
                    return
                }

                if (shortcut === 'ctrl+-') {
                    if (typeof applyTabZoom === 'function') applyTabZoom(state.tabZoomLevel - 0.25)
                    return
                }

                if (shortcut === 'ctrl+0') {
                    if (typeof applyTabZoom === 'function') applyTabZoom(1.0)
                    return
                }

                if (shortcut === 'ctrl+shift+=') {
                    if (typeof applyAppZoom === 'function') applyAppZoom(state.appZoomLevel + 1)
                    return
                }

                if (shortcut === 'ctrl+shift+-') {
                    if (typeof applyAppZoom === 'function') applyAppZoom(state.appZoomLevel - 1)
                    return
                }

                return
            }

            if (e.channel !== 'context-menu') return

            // Переключаемся на нужный мессенджер, чтобы zoom применялся правильно
            if (messenger?.id && state.activeTabId !== messenger.id) {
                switchTab(messenger.id)
            }

            const params = e.args[0] || {}
            state.wvContextParams = params

            document.querySelectorAll('.context-menu').forEach((m) => {
                m.classList.remove('show')
                m.style.visibility = ''
            })

            const saveImageItem = document.getElementById('wvSaveImage')
            if (saveImageItem) {
                saveImageItem.style.display = params.mediaType === 'image' ? 'flex' : 'none'
            }

            const copyItem = document.getElementById('wvCopy')
            if (copyItem) {
                const hasCopy = params.mediaType === 'image' || !!params.selectionText
                copyItem.style.display = hasCopy ? 'flex' : 'none'
                const dividerAfterCopy = copyItem.nextElementSibling
                if (dividerAfterCopy?.classList.contains('context-divider')) {
                    dividerAfterCopy.style.display = hasCopy ? '' : 'none'
                }
            }

            const translateItem = document.getElementById('wvTranslate')
            if (translateItem) {
                const extState = store.get('extensionsState', {})
                const canTranslate = !!params.selectionText && extState.translate === true
                translateItem.style.display = canTranslate ? 'flex' : 'none'
                const wvTranslateDivider = document.getElementById('wvTranslateDivider')
                if (wvTranslateDivider) wvTranslateDivider.style.display = canTranslate ? 'block' : 'none'
            }

            const webviewRect = webview.getBoundingClientRect()
            const localX = Number(params.clientX ?? params.x ?? 0)
            const localY = Number(params.clientY ?? params.y ?? 0)
            const zoom = Number(state.tabZoomLevel || 1)
            const margin = 8
            const pointerOffset = 2

            let left = webviewRect.left + localX * zoom + pointerOffset
            let top = webviewRect.top + localY * zoom + pointerOffset

            webviewContextMenu.style.position = 'fixed'
            webviewContextMenu.style.left = '0px'
            webviewContextMenu.style.top = '0px'
            webviewContextMenu.style.visibility = 'hidden'
            webviewContextMenu.classList.add('show')

            requestAnimationFrame(() => {
                const menuRect = webviewContextMenu.getBoundingClientRect()

                const fitsBelow = top + menuRect.height <= window.innerHeight - margin
                const fitsRight = left + menuRect.width <= window.innerWidth - margin

                if (!fitsBelow) {
                    top = top - menuRect.height - pointerOffset * 2
                }

                if (!fitsRight) {
                    left = left - menuRect.width - pointerOffset * 2
                }

                const maxLeft = window.innerWidth - menuRect.width - margin
                const maxTop = window.innerHeight - menuRect.height - margin

                if (left > maxLeft) left = Math.max(margin, maxLeft)
                if (top > maxTop) top = Math.max(margin, maxTop)

                if (left < margin) left = margin
                if (top < margin) top = margin

                webviewContextMenu.style.left = `${Math.round(left)}px`
                webviewContextMenu.style.top = `${Math.round(top)}px`
                webviewContextMenu.style.visibility = 'visible'
            })
        })
    }

    function addWebview(messenger) {
        invokeIpc('ext:apply-to-session', `persist:${messenger.id}`).catch(() => {})
        const webview = document.createElement('webview')
        webview.id = `webview-${messenger.id}`
        webview.src = messenger.url
        webview.setAttribute('allowpopups', 'true')
        webview.setAttribute('partition', `persist:${messenger.id}`)
        webview.setAttribute('useragent', buildWebviewUserAgent())
        webview.setAttribute('preload', preloadPath)

        const extState = store.get('extensionsState', {})
        if (extState.grammarly === true) {
            webview.setAttribute('spellcheck', 'true')
        }

        const applyInitialZoom = () => {
            const zoomLevel = typeof messenger.zoomLevel === 'number'
                ? messenger.zoomLevel
                : Number(state.tabZoomLevel || 1)

            try {
                webview.setZoomFactor(zoomLevel)
            } catch {}
        }

        webview.addEventListener('dom-ready', () => {
            applyInitialZoom()

            if (messenger.forceDarkMode) {
                const css = `
                    html { filter: invert(1) hue-rotate(180deg) !important; }
                    img, video, canvas, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
                `
                webview.insertCSS(css)
            }

        })

        webview.addEventListener('did-finish-load', applyInitialZoom)
        webview.addEventListener('did-finish-load', () => {
            // Адаптивная тема: перечитываем цвет после загрузки страницы
            if (webview.classList.contains('active')) {
                const { updateAdaptiveTheme } = require('./settings-ui')
                updateAdaptiveTheme(() => webview)
            }
        })

        // Split mode: track which pane has focus when user clicks inside a webview
        webview.addEventListener('focus', () => {
            window.__centrioSplitFocus?.(webview)
        })


        webview.addEventListener('new-window', (e) => {
            e.preventDefault()
            const url = e.url
            if (!url || url === 'about:blank') return
            if (url.startsWith('chrome-extension://')) {
                // Webview-shell обход: грузим data:HTML с <webview src> — webview guest
                // navigations идут другим code-path и не блокируются ExtensionNavigationThrottle.
                invokeIpc('open-popup-window', url, {
                    width:     e.frameName === 'popup' ? 380 : 400,
                    height:    600,
                    partition: messenger?.id ? `persist:${messenger.id}` : 'persist:ext-popup',
                }).catch(() => {})
                return
            }

            // BUGFIX (item #1 — popups falling through to the external
            // browser): window.open() calls from a messenger webview (call/
            // meeting windows, share dialogs, "sign in with X" popups, ...)
            // used to always go through the plain open-url fallback below,
            // landing in the user's default browser with none of the
            // session the messenger itself is logged into. Route http(s)
            // popups through open-popup-window instead, sharing this
            // messenger's own partition — see main/ipc/window.js
            // (isSharedMessengerSession is allowlisted there against known
            // messenger partitions, so this can't be used to read an
            // arbitrary session). Recognized OAuth-provider popups (item
            // #6) additionally get returnHost so the main process can close
            // the popup and hand control back once sign-in completes — see
            // isOAuthProviderUrl()/OAUTH_PROVIDER_HOST_RE above.
            if ((url.startsWith('http://') || url.startsWith('https://')) && messenger?.id) {
                const popupOpts = {
                    width: 500,
                    height: 650,
                    name: messenger.name || 'Centrio',
                    partition: `persist:${messenger.id}`
                }

                if (isOAuthProviderUrl(url)) {
                    try { popupOpts.returnHost = new URL(messenger.url).hostname } catch {}
                }

                invokeIpc('open-popup-window', url, popupOpts)
                    .then((result) => {
                        if (!result || result.success !== true) ipcRenderer.send('open-url', url)
                    })
                    .catch(() => ipcRenderer.send('open-url', url))
                return
            }

            // SECURITY: 'new-window' (like 'will-navigate' below) can be
            // reached from page script with no verifiable real user
            // gesture, so it deliberately does NOT auto-route into another
            // tab — only the trusted-click path from webview-preload.js
            // (delivered via the 'ipc-message' → 'deep-link' listener
            // further down) is allowed to do that. This just keeps the
            // pre-existing external-open fallback for everything else,
            // recognized deep links included.
            ipcRenderer.send('open-url', url)
        })

        webview.addEventListener('will-navigate', (e) => {
            const url = e.url
            if (!url) return
            try {
                // BUGFIX (2026-08-24): this OAuth-provider check used to live
                // INSIDE the baseDomain() mismatch branch below, so it only
                // ever ran when the navigation target's base domain differed
                // from the messenger's own. That's wrong for the most common
                // real-world case — Google's sign-in page (accounts.google.com)
                // shares the "google.com" base domain with Gmail itself
                // (mail.google.com), and Yandex's (passport.yandex.ru /
                // oauth.yandex.ru) shares "yandex.ru" with Yandex Mail
                // (mail.yandex.ru). Because baseDomain() only compares the
                // last two hostname segments, those pairs looked "same site"
                // and the whole block — including the popup-broker hand-off —
                // was skipped, so the sign-in page loaded directly inline in
                // the webview with no UA spoofing and Google's "This browser
                // or app may not be secure" embedded-webview block fired
                // (confirmed live: user saw that exact page after 2.3.12,
                // even with the bscframe/RotateCookiesPage popup-leak fixed).
                // Checking isOAuthProviderUrl() first, independent of
                // baseDomain(), ensures known OAuth-provider hosts always go
                // through the UA-spoofed popup broker regardless of whether
                // they happen to share a base domain with the messenger.
                // BUGFIX (2026-08-26): раньше здесь стоял
                // e.preventDefault() + open-popup-window. У тега <webview>
                // событие 'will-navigate' НЕ отменяемое (в отличие от
                // одноимённого события webContents), поэтому preventDefault()
                // не останавливал навигацию — вкладка всё равно уходила на
                // страницу входа, параллельно с уже открытым попапом, и
                // навигацию приходилось обрывать на лету в will-redirect.
                // Именно эта пара "открываем окно + обрываем кросс-origin
                // навигацию гостя" и вешала рендерер главного окна.
                // Перехват перенесён в main-процесс, на webContents гостя
                // ('will-navigate' в main/bootstrap/registerAppEvents.js),
                // где отмена действительно работает. Здесь просто уходим,
                // чтобы OAuth-URL не провалился в ветку "чужой домен →
                // открыть во внешнем браузере" ниже.
                if (isOAuthProviderUrl(url)) return

                const messengerHost = new URL(messenger.url).hostname
                const navHost = new URL(url).hostname
                if (baseDomain(navHost) !== baseDomain(messengerHost) && !url.startsWith('file://')) {
                    e.preventDefault()
                    ipcRenderer.send('open-url', url)
                }
            } catch {}
        })

        // Диплинк, распознанный и перехваченный ВНУТРИ гостевой страницы
        // (webview-preload.js classifyDeepLink → ipcRenderer.sendToHost),
        // и ТОЛЬКО когда клик был настоящим (e.isTrusted, см. preload) —
        // единственный путь, по которому мы автоматически переключаем
        // вкладку и грузим URL в чужом, уже залогиненном webview.
        webview.addEventListener('ipc-message', (e) => {
            // Мини-плеер, старый (мёртвый) путь: bindMediaPlaybackDetection()
            // в webview-preload.js шлёт сюда через sendToHost, но
            // preload-атрибут <webview> на этой версии Electron не
            // исполняется в гостевой странице вообще ни для одного
            // мессенджера (см. BUGFIX 2026-08-28 у ipcRenderer.on('media-state', ...)
            // чуть выше — тот, main-процессный канал, реально работает).
            // Ветка оставлена как безобидный фолбэк на случай, если preload
            // когда-нибудь снова заработает сам по себе.
            if (e.channel === 'media-state') {
                if (typeof onMediaState === 'function') onMediaState(messenger.id, e.args[0])
                return
            }

            if (e.channel !== 'deep-link') return
            const special = e.args[0]
            if (special && routeDeepLink(special, messenger.id)) return

            // SECURITY: fallback must use the TRANSLATED URL (e.g.
            // https://t.me/<domain>), never the raw special.href. tg: is
            // an allowed external-open scheme (main/ipc/window.js
            // ALLOWED_SCHEMES) and Centrio can be the OS's registered
            // tg:// handler (see main/services/protocol.js) — sending the
            // raw tg://resolve?... href back to open-url would bounce
            // straight back into this same app via the second-instance/
            // protocol-url path (one-hop refocus/relaunch flash on every
            // click with no matching tab open). Mirrors the same
            // loop-avoidance already used by routeDeepLinkFromMain below.
            const url = translateDeepLinkUrl(special)
            if (url) ipcRenderer.send('open-url', url)
        })

        // BUGFIX ("MAX обновляется постоянно" — MAX kept refreshing in a
        // loop): this used to reload messenger.url on ANY did-fail-load with
        // no isMainFrame check and no backoff. did-fail-load fires per-FRAME
        // — a single blocked sub-resource (an ad/analytics iframe, or a
        // request our own adblock service killed — see
        // main/services/adblock.js, applied to every webview session) is
        // enough to trigger it even though the page itself loaded fine. On
        // a heavy SPA like MAX/Telegram that has many such sub-frame
        // requests, reloading the WHOLE page every time one of them fails
        // reloads the page, which re-issues the same requests, which fail
        // again the same way — an unthrottled reload loop with no visible
        // error. Two fixes: (1) only reload on a MAIN-frame failure — a
        // sub-frame failing doesn't mean the tab itself is broken; (2) apply
        // exponential backoff + reset-on-success, same pattern already used
        // by the (currently unused) legacy addWebview in
        // renderer/messengers.js, so a persistently-failing main frame
        // retries with increasing delay instead of hammering in a tight loop.
        //
        // BUGFIX (2026-08-28, "Телеграм продолжает перезагружаться время от
        // времени... Иногда я уже текст набрал, а он берет и перезагружается"
        // — live user request, marked "это важно"): the two fixes above
        // still left a real hole. _reloadAttempts resets to 0 on EVERY
        // successful load, so the exponential backoff never actually
        // escalates against sporadic, isolated main-frame failures — a
        // single one-off failure (a flaky request, a brief network blip)
        // that happens minutes or hours into a normal session, long after
        // the tab loaded fine and the user is mid-conversation, is always
        // treated as "attempt #1" and reloaded almost immediately (1s
        // delay). A full loadURL() reload throws away whatever the user had
        // typed into the compose box — exactly the reported symptom, and on
        // Telegram specifically (a long-lived, heavy SPA session that's
        // realistically more exposed to this than a freshly opened tab).
        // The auto-reload-with-backoff behavior only makes sense while the
        // tab is still trying to complete its INITIAL load (messenger just
        // added, app just started, tab was just reloaded on purpose) — once
        // it has already finished loading successfully once, a later
        // main-frame failure is far more likely to be a transient hiccup
        // than a broken tab, and silently reloading it is worse than doing
        // nothing (Electron/Chromium's own network-error retry usually
        // recovers sub-requests on its own; if the page is truly stuck the
        // user still has the manual reload button/Ctrl+R). Gate the whole
        // mechanism on webview._hasLoadedOnce instead of resetting on every
        // success.
        webview.addEventListener('did-fail-load', (e) => {
            if (e.errorCode === -3) return // ERR_ABORTED — normal cancelled navigation
            if (e.isMainFrame === false) return // sub-frame/sub-resource failure — not the tab itself
            if (webview._hasLoadedOnce) {
                // Tab already loaded successfully at least once — don't
                // silently blow away whatever the user is doing in it.
                console.warn(`[webview] main-frame load failure after initial load for "${messenger.name}" (errorCode=${e.errorCode}) — not auto-reloading, use manual reload if the tab is actually stuck`)
                return
            }

            const attempts = (webview._reloadAttempts || 0) + 1
            webview._reloadAttempts = attempts
            const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000)
            clearTimeout(webview._reloadTimer)
            webview._reloadTimer = setTimeout(() => {
                try { webview.loadURL(messenger.url) } catch {}
            }, delay)
        })

        webview.addEventListener('did-finish-load', () => {
            webview._reloadAttempts = 0
            webview._hasLoadedOnce = true
        })

        watchWebview(webview, messenger)
        attachFindListener(webview)
        attachContextMenu(webview, messenger)

        tabsContent.appendChild(webview)
        tabsContent.style.pointerEvents = 'auto'
    }

    function bindWebviewContextMenuActions() {
        bindGlobalMenuClose()

        document.getElementById('wvTranslate')?.addEventListener('click', () => {
            const text = (state.wvContextParams || {}).selectionText || ''
            if (text) ipcRenderer.send('open-translate-window', text)
            hideWebviewContextMenu()
        })

        document.getElementById('wvCopy')?.addEventListener('click', async () => {
            const params = state.wvContextParams || {}
            if (params.mediaType === 'image' && params.srcURL) {
                // Скачиваем картинку через preload → копируем через main process clipboard
                const wv = getActiveWebview()
                if (wv) {
                    state._wvCopyMode = true
                    wv.send('download-image', params.srcURL)
                }
            } else if (params.selectionText) {
                // Копируем выделенный текст
                try {
                    await navigator.clipboard.writeText(params.selectionText)
                } catch {
                    // fallback если clipboard API недоступен
                    invokeIpc('copy-text-to-clipboard', params.selectionText).catch(() => {})
                }
            }
            hideWebviewContextMenu()
        })

        document.getElementById('wvSavePage')?.addEventListener('click', () => {
            ipcRenderer.send('save-page')
            hideWebviewContextMenu()
        })

        document.getElementById('wvSaveImage')?.addEventListener('click', async () => {
            hideWebviewContextMenu()
            if (!state.wvContextParams.srcURL) return

            const wv = getActiveWebview()
            if (!wv) return

            const result = await invokeIpc('get-save-image-path', state.wvContextParams.srcURL)
            if (!result.success) return

            const filePath = result.data
            if (!filePath) return

            state.wvContextParams._filePath = filePath
            wv.send('download-image', state.wvContextParams.srcURL)
        })

        document.getElementById('wvZoomIn')?.addEventListener('click', () => {
            applyTabZoom(state.tabZoomLevel + 0.25)
            hideWebviewContextMenu()
        })

        document.getElementById('wvZoomOut')?.addEventListener('click', () => {
            applyTabZoom(state.tabZoomLevel - 0.25)
            hideWebviewContextMenu()
        })

        document.getElementById('wvZoomReset')?.addEventListener('click', () => {
            applyTabZoom(1.0)
            hideWebviewContextMenu()
        })

        document.getElementById('wvFind')?.addEventListener('click', () => {
            openFindBar()
            hideWebviewContextMenu()
        })

        document.getElementById('wvPrint')?.addEventListener('click', () => {
            getActiveWebview()?.print()
            hideWebviewContextMenu()
        })
    }

    return {
        addTab,
        attachFindListener,
        attachContextMenu,
        addWebview,
        bindWebviewContextMenuActions,
        saveTabOrder,
        loadTabOrder
    }
}

module.exports = {
    createWebviewTabsApi
}