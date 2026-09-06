// ПРИМЕЧАНИЕ: детект непрочитанных сообщений (extractUnreadCount и всё, что
// его вызывает) ниже по факту не исполняется в текущей сборке — диагностика
// подтвердила, что preload-атрибут <webview> на используемой версии Electron
// (39.x) не подключается к гостевой странице вовсе (ни console.log, ни
// созданный им DOM-узел ни разу не появились, хотя main-процесс репортует
// верный путь к файлу). Реальный, рабочий детект теперь в
// main/bootstrap/registerAppEvents.js (startUnreadPolling, через
// contents.executeJavaScript на dom-ready — подтверждённо рабочий канал).
// Код ниже оставлен как есть (не удалён) — начнёт снова работать сам собой,
// если апстрим-баг Electron с preload у <webview> когда-нибудь пофиксят, и
// остальной функционал файла (перехват ссылок, контекстное меню и т.д.)
// может по-прежнему нормально исполняться там, где preload всё же цепляется.

const { ipcRenderer } = require('electron')

let lastSentCount = -1
let zeroStreak = 0
let unreadInterval = null
let mutationObserver = null

// ── Badging API hook (navigator.setAppBadge / clearAppBadge) ───────────────
// Многие современные веб-мессенджеры (WhatsApp Web среди них) ставят бейдж
// непрочитанных через стандартный Web Badging API, а не через DOM/title —
// это АВТОРИТЕТНЫЙ сигнал (сайт сам сообщает точное число), надёжнее любой
// DOM-эвристики выше. Проблема: этот preload-скрипт исполняется в изолированном
// мире (contextIsolation), а страница вызывает navigator.setAppBadge() в своём,
// основном мире — прямая подмена navigator здесь на неё не подействует. Поэтому
// патчим через инжект <script> в сам документ (это уже основной мир) и
// перебрасываем значение обратно через обычное DOM CustomEvent — оно, в отличие
// от JS-объектов, пересекает границу миров штатно.
let badgeApiCount = null

function injectBadgeApiHook() {
    const target = document.head || document.documentElement
    if (!target) {
        setTimeout(injectBadgeApiHook, 50)
        return
    }
    try {
        const script = document.createElement('script')
        script.textContent = `(() => {
            if (!navigator.setAppBadge) return;
            const origSet = navigator.setAppBadge.bind(navigator);
            const origClear = navigator.clearAppBadge ? navigator.clearAppBadge.bind(navigator) : null;
            navigator.setAppBadge = (count) => {
                window.dispatchEvent(new CustomEvent('__centrio_badge', { detail: { count: typeof count === 'number' ? count : 1 } }));
                return origSet(count);
            };
            if (origClear) {
                navigator.clearAppBadge = () => {
                    window.dispatchEvent(new CustomEvent('__centrio_badge', { detail: { count: 0 } }));
                    return origClear();
                };
            }
        })();`
        target.appendChild(script)
        script.remove()
    } catch {
        // ignore — сайт просто не получит этот сигнал, остальные эвристики останутся
    }
}

window.addEventListener('__centrio_badge', (e) => {
    const count = e.detail?.count
    badgeApiCount = Number.isFinite(count) && count >= 0 ? count : null
    checkUnread()
})

injectBadgeApiHook()

// BUGFIX (2026-08-26): this file used to also inject a script that hid
// navigator.userAgentData and overrode navigator.userAgent/appVersion to
// Firefox on accounts.google.* pages, mirroring the network-level Firefox
// UA spoof in ensureGoogleAccountsUaOverride() (main/ipc/window.js). Live
// A/B testing (scripts/ua-matrix.js, run against the user's real Gmail
// session) proved that whole UA-spoofing approach was the CAUSE of
// Google's rejection, not a fix for it — see the BUGFIX comment above
// isGoogleAccountsUrl() in main/ipc/window.js for the evidence. The
// spoofing has been removed from every wiring point instead of patched
// further; this preload now only guards WebAuthn conditional UI below.

// BUGFIX (2026-08-25, "Гугл выдает про ключ на любой авторизации ...
// постоянно сначала стандартное окно винды для входа через ключ" —
// live-reported на трёх разных машинах, не специфично для одного
// мессенджера): нативный диалог Windows Hello/"ключ безопасности"
// появляется САМ, ещё до какого-либо действия пользователя — это не
// объяснить UA/userAgentData-хуками выше (они лишь меняют то, что Google
// ЧИТАЕТ, а не реальные возможности движка). Причина — WebAuthn
// "conditional UI" (автозаполнение пасскеев): страница вызывает
// navigator.credentials.get({ mediation: 'conditional', publicKey: {...} })
// молча при загрузке формы логина, а Chromium в ответ САМ поднимает
// нативный OS-диалог выбора ключа/Windows Hello — независимо от того, что
// говорит navigator.userAgent (спуфинг строки не меняет реальные
// возможности WebAuthn-движка). PublicKeyCredential.isConditionalMediationAvailable()
// — это не UA-сниффинг, а прямая проверка возможностей движка, так что
// даже прикинувшись Firefox, страница всё равно получит true.
// Исправление в две линии обороны: (1) заставляем
// isConditionalMediationAvailable() вернуть false — корректные сайты сами
// не станут звать conditional-get(), если он "недоступен" (то же самое,
// что видели бы в браузере без поддержки этой фичи); (2) на случай сайта,
// который всё равно вызовет conditional-get() без проверки — сам вызов
// возвращает вечно висящий Promise вместо реального обращения к
// нативному API, так что OS-диалог просто не появляется (то же поведение,
// что у пользователя, который ничего не выбрал из автозаполнения).
// Обычный (не-conditional) navigator.credentials.get() — например, явный
// клик по "войти через ключ безопасности" — не трогаем, чтобы не сломать
// осознанный 2FA-вход тем, кому он реально нужен.
//
// BUGFIX (2026-08-25, "открываю окно авторизации через Google — Centrio
// целиком перестаёт реагировать на клики, закрытие попапа не помогает" —
// live-reproduced и root-caused через computer-use: Диспетчер задач не
// показывает ни одного процесса Centrio.exe как "Не отвечает" и CPU не
// зашкаливает — то есть окно не в deadlock'е, а физически заблокировано
// снаружи; клик по кастомной кнопке "свернуть" не долетает вообще никуда.
// То, что закрытие попапа НЕ снимает блокировку, исключает всё, что
// завязано на жизненный цикл самого попап-окна (focus/alwaysOnTop-фиксы
// из 2.3.22/2.3.23) — блокирующий объект переживает закрытие попапа,
// значит это осиротевший нативный OS-диалог (тот же WebAuthn conditional
// UI broker, что и выше), а не что-то внутри Electron): этот хук раньше
// был ограничен GOOGLE_ACCOUNTS_HOST_RE и не покрывал произвольные сайты
// мессенджеров (напр. grok.com), которые тоже могут молча звать
// conditional-mediation WebAuthn на своей форме логина — на них нативный
// диалог поднимался вообще без всякой защиты. Вынесена в отдельную,
// НИЧЕМ не ограниченную по хосту функцию и вызывается на КАЖДОЙ странице
// внутри вкладки мессенджера, а не только на accounts.google.*. Второй,
// независимый от гонки со скриптами барьер — Permissions-Policy заголовок
// на HTTP-уровне — добавлен в main/ipc/window.js (onHeadersReceived) и
// main/bootstrap/registerAppEvents.js.
function injectWebAuthnConditionalUiGuard() {
    const target = document.head || document.documentElement
    if (!target) {
        setTimeout(injectWebAuthnConditionalUiGuard, 10)
        return
    }
    try {
        const script = document.createElement('script')
        script.textContent = `(() => {
            try {
                if (window.PublicKeyCredential && typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function') {
                    window.PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
                }
            } catch {}
            try {
                if (navigator.credentials && typeof navigator.credentials.get === 'function') {
                    const originalCredentialsGet = navigator.credentials.get.bind(navigator.credentials);
                    navigator.credentials.get = function (options) {
                        if (options && options.mediation === 'conditional') {
                            return new Promise(() => {});
                        }
                        return originalCredentialsGet(options);
                    };
                }
            } catch {}
        })();`
        target.appendChild(script)
        script.remove()
    } catch {
        // ignore — страница просто увидит настоящий WebAuthn conditional UI
    }
}

injectWebAuthnConditionalUiGuard()

function getHostname() {
    try {
        return window.location.hostname || ''
    } catch {
        return ''
    }
}

function parsePositiveInt(value) {
    if (value == null) return null

    const text = String(value).trim()
    if (!text) return null

    const match = text.match(/\d+/)
    if (!match) return null

    const num = parseInt(match[0], 10)
    if (!Number.isFinite(num) || num < 0 || num >= 10000) return null

    return num
}

function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false

    const style = window.getComputedStyle(el)
    if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
    ) {
        return false
    }

    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
}

function extractUnreadFromTitle(title) {
    if (!title) return null

    let match = title.match(/^\((\d+)\)\s*/)
    if (match) return parseInt(match[1], 10) || 0

    match = title.match(/\((\d+)\)\s*$/)
    if (match) return parseInt(match[1], 10) || 0

    match = title.match(/^(\d+)\b/)
    if (match) return parseInt(match[1], 10) || 0

    // "3 unread messages - App", "(3 unread) App" и т.п.
    match = title.match(/(\d+)\s+unread/i)
    if (match) return parseInt(match[1], 10) || 0

    return null
}

// Общий сборщик по списку селекторов: ищем видимый элемент с числом (из aria-label
// или из текста) — используется и Telegram-, и generic-эвристикой ниже.
function scanSelectorsForCount(selectors) {
    for (const selector of selectors) {
        let elements
        try {
            elements = document.querySelectorAll(selector)
        } catch {
            continue // невалидный селектор (например, движок не поддерживает :has) — пропускаем
        }

        for (const el of elements) {
            if (!isElementVisible(el)) continue

            const aria = el.getAttribute('aria-label')
            const ariaNum = parsePositiveInt(aria)
            if (typeof ariaNum === 'number' && ariaNum > 0) return ariaNum

            const text = (el.textContent || '').trim()
            if (text.length > 6) continue

            const num = parsePositiveInt(text)
            if (typeof num === 'number' && num > 0) return num
        }
    }

    return null
}

// ПРИМЕЧАНИЕ по хрупкости: современные веб-мессенджеры (WhatsApp Web, Telegram Web
// и т.п.) часто используют хэшированные CSS-модули (например, "_ak8h"), где точное
// имя класса меняется от сборки к сборке — точные селекторы вроде ".badge" быстро
// устаревают. Поэтому здесь помимо точных легаси-классов используем ЧАСТИЧНОЕ
// регистронезависимое совпадение по [class*=…], [data-testid*=…], [aria-label*=…] —
// это заметно устойчивее к обновлениям вёрстки конкретного сайта.
function extractUnreadTelegram() {
    return scanSelectorsForCount([
        '[aria-label*="unread" i]',
        '.ListItem-badge',
        '.badge',
        '.Badge',
        '.counter',
        '.Counter',
        '[class*="unread" i]',
        '[class*="badge" i]',
        '[data-testid*="unread" i]',
        '[data-testid*="badge" i]'
    ])
}

function extractUnreadGeneric() {
    return scanSelectorsForCount([
        '.unread-count',
        '.badge-counter',
        '.chat-unread-count',
        '.conversations-badge',
        '[aria-label*="unread" i]',
        '[class*="unread" i]',
        '[class*="badge-count" i]',
        '[class*="unreadcount" i]',
        '[data-testid*="unread" i]',
        '[data-testid*="badge" i]'
    ])
}

// ── Резервный сигнал: бейдж на фавиконе ────────────────────────────────────
// Многие веб-клиенты (WhatsApp Web, Slack и др.) рисуют бейдж непрочитанных
// поверх иконки через Canvas и подставляют её в <link rel="icon"> как data:-URI —
// это не зависит от разметки/классов страницы вообще. Берём это как последний
// сигнал "есть непрочитанное" (без точного числа), когда DOM- и title-эвристики
// ничего не нашли. baseline фиксируем один раз спустя паузу после старта, чтобы
// не поймать иконку самого первого рендера как "с бейджем".
let baselineFaviconHref = null
let baselineFaviconAt = 0

function getFaviconHref() {
    const link = document.querySelector('link[rel~="icon"]')
    return (link && link.getAttribute('href')) || ''
}

function captureBaselineFavicon() {
    if (baselineFaviconHref !== null) return
    const href = getFaviconHref()
    // Если уже на старте это data:-иконка — сайт мог отрисовать её до нашего замера,
    // либо вообще не использует этот приём; сравнение будет ненадёжным — не включаем эвристику.
    if (href && !href.startsWith('data:')) {
        baselineFaviconHref = href
        baselineFaviconAt = Date.now()
    }
}

function hasFaviconBadge() {
    if (!baselineFaviconHref) return false
    if (Date.now() - baselineFaviconAt < 3000) return false
    const href = getFaviconHref()
    return !!href && href.startsWith('data:') && href !== baselineFaviconHref
}

function extractUnreadCount() {
    // BUGFIX ("бейджи непрочитанных пропали целиком — были раньше"): раньше
    // badgeApiCount (сигнал от navigator.setAppBadge, см. injectBadgeApiHook
    // выше) был АБСОЛЮТНЫМ приоритетом — если сайт хоть раз вызывал
    // setAppBadge/clearAppBadge (даже с 0, например один раз при загрузке
    // страницы, до первых сообщений), это НАВСЕГДА перекрывало все остальные
    // эвристики до конца сессии, даже если реальный счётчик в DOM потом рос.
    // Не все сайты вызывают Badging API на каждое изменение — если он вызван
    // непоследовательно (или только для дока/таскбара, а не как общий сигнал),
    // результат — залипший неверный (часто нулевой) бейдж. Теперь берём МАКСИМУМ
    // из всех источников, а не даём одному "протухшему нулю" затмевать остальные.
    const hostname = getHostname()
    const title = document.title || ''

    const titleCount = extractUnreadFromTitle(title)

    let domCount
    if (hostname.includes('telegram')) {
        domCount = extractUnreadTelegram()
    } else {
        domCount = extractUnreadGeneric()
    }

    const positiveCandidates = [titleCount, domCount, badgeApiCount]
        .filter((v) => typeof v === 'number' && v > 0)

    if (positiveCandidates.length > 0) return Math.max(...positiveCandidates)

    // Ничего не нашло положительного числа — последний шанс: бейдж на
    // фавиконе (см. hasFaviconBadge). Считаем count = 1 ("есть
    // непрочитанное"), точное число таким способом не получить, но это
    // лучше, чем ложный 0 при рабочей хрупкой вёрстке.
    if (hasFaviconBadge()) return 1

    // Явный 0 от Badging API доверяем, только если вообще ничего другого
    // не нашлось — сайт сам сообщил "непрочитанных нет".
    if (badgeApiCount === 0) return 0

    return 0
}

function checkUnread() {
    try {
        const count = extractUnreadCount()

        if (count > 0) {
            zeroStreak = 0

            if (count !== lastSentCount) {
                lastSentCount = count
                ipcRenderer.sendToHost('unread-count', count)
            }
            return
        }

        zeroStreak += 1

        if (zeroStreak < 3) return

        if (lastSentCount !== 0) {
            lastSentCount = 0
            ipcRenderer.sendToHost('unread-count', 0)
        }
    } catch {
        // ignore
    }
}

function startUnreadInterval() {
    if (unreadInterval) clearInterval(unreadInterval)
    unreadInterval = setInterval(checkUnread, 5000)
}

function startObserver() {
    const target = document.documentElement || document.body
    if (!target) {
        setTimeout(startObserver, 500)
        return
    }

    let debounceTimer = null

    mutationObserver = new MutationObserver(() => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(checkUnread, 300)
    })

    mutationObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: false,
        attributes: true
    })
}

function bindContextMenuForwarding() {
    // Первый ПКМ — показываем браузерное меню.
    // Второй ПКМ в течение 600 мс — показываем наше кастомное меню.
    // ИЛИ Ctrl + ПКМ — сразу показываем браузерное меню (всегда).
    let lastRightClickTime = 0
    const DOUBLE_CLICK_THRESHOLD = 600  // мс

    document.addEventListener('contextmenu', (e) => {
        const now = Date.now()
        const timeSinceLast = now - lastRightClickTime
        lastRightClickTime = now

        // Ctrl+ПКМ или двойной ПКМ — показываем наше кастомное меню
        const showCustomMenu = e.ctrlKey || timeSinceLast <= DOUBLE_CLICK_THRESHOLD

        if (!showCustomMenu) {
            // Первый клик без Ctrl — позволяем браузеру показать своё меню
            return
        }

        e.preventDefault()
        e.stopPropagation()

        const target = e.target
        const link = target?.closest?.('a')?.href || ''
        const isImage = target?.tagName === 'IMG'
        const selectionText = window.getSelection?.()?.toString?.() || ''

        ipcRenderer.sendToHost('context-menu', {
            x: e.x,
            y: e.y,
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            screenX: e.screenX,
            screenY: e.screenY,
            mediaType: isImage ? 'image' : 'none',
            srcURL: isImage ? (target.src || '') : '',
            linkURL: link,
            selectionText
        })
    })

    document.addEventListener('click', () => {
        ipcRenderer.sendToHost('close-context-menu', {})
    })
}

function bindDownloadImageHandler() {
    // Преобразует Blob в data:URL
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('FileReader failed'))
            reader.readAsDataURL(blob)
        })
    }

    function isValidImageDataUrl(s) {
        return typeof s === 'string' && s.startsWith('data:image') && s.length > 64
    }

    // Запасной путь: рисуем уже отрисованную в DOM картинку на canvas.
    // Работает даже если fetch заблокирован CORS — пиксели уже в памяти.
    function dataUrlFromDomImage(url) {
        try {
            const imgs = Array.from(document.querySelectorAll('img'))
            // Ищем точное совпадение по src / currentSrc
            let el = imgs.find(i => i.currentSrc === url || i.src === url)
            // Частичное совпадение (CDN мог переписать query-параметры)
            if (!el) {
                const base = url.split('?')[0]
                el = imgs.find(i => (i.currentSrc || i.src || '').split('?')[0] === base)
            }
            if (!el || !el.naturalWidth) return null
            const canvas = document.createElement('canvas')
            canvas.width = el.naturalWidth
            canvas.height = el.naturalHeight
            const ctx = canvas.getContext('2d')
            ctx.drawImage(el, 0, 0)
            return canvas.toDataURL('image/png')
        } catch {
            return null  // tainted canvas / cross-origin без CORS
        }
    }

    async function fetchAsDataUrl(url) {
        // 1) пробуем с credentials (нужно для приватных вложений мессенджеров)
        try {
            const res = await fetch(url, { credentials: 'include' })
            if (res.ok) {
                const d = await blobToDataUrl(await res.blob())
                if (isValidImageDataUrl(d)) return d
            }
        } catch {}
        // 2) повтор без credentials (некоторые CDN отклоняют credentialed-запрос при ACAO:*)
        try {
            const res = await fetch(url, { credentials: 'omit', mode: 'cors' })
            if (res.ok) {
                const d = await blobToDataUrl(await res.blob())
                if (isValidImageDataUrl(d)) return d
            }
        } catch {}
        return null
    }

    ipcRenderer.on('download-image', async (_event, url) => {
        let dataUrl = null
        try {
            if (!url) {
                ipcRenderer.sendToHost('image-data', null)
                return
            }

            if (url.startsWith('data:')) {
                dataUrl = url
            } else if (url.startsWith('blob:')) {
                try {
                    const blob = await (await fetch(url)).blob()
                    dataUrl = await blobToDataUrl(blob)
                } catch {}
            } else {
                dataUrl = await fetchAsDataUrl(url)
            }

            // Запасной путь через DOM canvas, если основной не сработал
            if (!isValidImageDataUrl(dataUrl)) {
                dataUrl = dataUrlFromDomImage(url) || dataUrl
            }

            ipcRenderer.sendToHost('image-data', isValidImageDataUrl(dataUrl) ? dataUrl : null)
        } catch {
            const fallback = dataUrlFromDomImage(url)
            ipcRenderer.sendToHost('image-data', isValidImageDataUrl(fallback) ? fallback : null)
        }
    })
}

// ── Приём файла из панели загрузок Centrio (drag-and-drop в мессенджер) ────
// См. подробный комментарий про два провалившихся подхода у init() ниже и
// в renderer/downloads-bind.js. Третий подход НЕ использует настоящую
// OS/браузерную drag-сессию вообще: host (renderer/downloads-bind.js) сам
// отслеживает жест мышью, находит целевой <webview> по геометрии (у него
// есть доступ к списку вкладок — здесь, внутри guest-страницы, его нет и
// быть не должно) и присылает сюда координаты через webview.send() — тот же
// host→guest push-паттерн, что уже проверен на 'download-image', только в
// обратную сторону. Протокол — два сообщения: 'centrio-drag-hover'
// (повторяется, пока реальная мышь движется над этим webview — не несёт
// байтов файла, только имя/тип, как и настоящий браузерный dragover) и
// 'centrio-drop-file' (один раз, при реальном отпускании кнопки мыши — уже с
// байтами). Здесь мы сами строим File/DataTransfer и диспатчим синтетические
// dragenter/dragover/drop DragEvent на реальный элемент под курсором:
// document.elementFromPoint работает нормально ИЗНУТРИ guest-страницы (в
// отличие от host-документа, который не видит сквозь <webview>). Мы никогда
// не инициируем настоящий dragstart на реальном DOM-элементе страницы —
// именно это в прошлый раз (v1.9.3, см. ниже) заставляло Chromium
// подмешивать в dataTransfer собственные данные и уводить drop в открытие
// нового окна; здесь dataTransfer с нуля содержит только наш File.
function bindDropFileHandler() {
    // Держим в синхроне с MAX_DRAG_FILE_BYTES в main/ipc/downloads.js —
    // просто ещё один рубеж защиты на случай измененного/скомпрометированного
    // хоста, не единственный (основная проверка размера уже в main).
    const MAX_DROP_FILE_BYTES = 100 * 1024 * 1024

    function describeEl(el) {
        if (!el) return 'null'
        const id = el.id ? '#' + el.id : ''
        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''
        return `<${el.tagName}${id}${cls}>`
    }

    function buildDt(bytes, filename, mimeType) {
        const file = new File([bytes], String(filename), {
            type: mimeType || 'application/octet-stream'
        })
        const dt = new DataTransfer()
        dt.items.add(file)
        return dt
    }

    function fireAt(type, el, dt, x, y) {
        if (!el) return
        try {
            const ev = new DragEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: x,
                clientY: y,
                dataTransfer: dt
            })
            const notCancelled = el.dispatchEvent(ev)
        } catch (err) {
            console.warn('[centrio-drop-file] dispatch failed:', type, err)
        }
    }

    // BUGFIX (Telegram: overlay visibly appears — `body.is-dragging` — but
    // the file never lands): diagnostic logs show Telegram flips a class on
    // `<body>` immediately (that's the full-page tint/overlay the user
    // sees) and its `dragover` on <body> does get `preventDefault()`'d, but
    // the actual file-accepting drop handler is bound directly to a small
    // reactively-mounted card (`.drops-container .drop`) that is centered
    // in the viewport rather than covering every pixel — so if the cursor's
    // exact (x,y) at drop time isn't within that card's bounds,
    // elementFromPoint resolves to <body> instead, and since 'drop' only
    // bubbles *up* the tree, a synthetic drop fired at <body> never reaches
    // a listener bound to that descendant card. MAX has the analogous
    // `.zone`/`.zone--active`. Rather than relying purely on cursor
    // coordinates, also look these specific elements up directly by
    // selector (when present/visible) and dispatch straight at them —
    // belt-and-suspenders alongside the point-based target above.
    const EXTRA_DROP_TARGET_SELECTORS = [
        '.drops-container .drop', // Telegram Web (K/A) — centered "drop here" card
        '.zone.zone--active',     // MAX — once fully expanded
        '.zone'                   // MAX — before the --active class lands
    ]

    function findExtraDropTargets() {
        const found = []
        for (const sel of EXTRA_DROP_TARGET_SELECTORS) {
            let el = null
            try { el = document.querySelector(sel) } catch { el = null }
            // offsetParent is null for display:none (or fixed-position with
            // no containing block edge case, acceptable false-negative here
            // since these overlays are never position:fixed with a
            // display:none ancestor in practice) — cheap visibility check
            // so we don't dispatch onto a card that hasn't mounted yet.
            if (el && el.offsetParent !== null) found.push(el)
        }
        return found
    }

    function fireAtExtraTargets(type, dt, x, y, alreadyFired) {
        for (const el of findExtraDropTargets()) {
            if (alreadyFired && alreadyFired.has(el)) continue
            fireAt(type, el, dt, x, y)
            if (alreadyFired) alreadyFired.add(el)
        }
    }

    // BUGFIX ("файлы перетаскиваются, но мессенджер не показывает область
    // куда вставляешь — как это показывается из проводника"): the previous
    // version only ever heard about the drop at mouseup (finishDrag in
    // renderer/downloads-bind.js) and had to fake the *entire*
    // dragenter→dragover→drop sequence in one artificially-paced burst
    // (~250ms of synthetic setTimeout pulses) after the fact. That's why the
    // app's own drop-zone overlay only ever flashed briefly right at the end
    // instead of staying open for as long as the user actually hovers, the
    // way it does when dragging a real file in from Windows Explorer.
    //
    // Fix: split the guest-side protocol into a real hover phase and a drop
    // phase, driven directly by the host's live mouse position
    // (renderer/downloads-bind.js now calls webview.send('centrio-drag-hover',
    // ...) on every throttled mousemove while the cursor is over this
    // webview, and 'centrio-drag-leave' when it moves off). dragenter fires
    // once when hovering starts; dragover repeats for as long as the real
    // drag continues, so any reactively-mounted drop-zone overlay (MAX's
    // svelte `.zone`, Telegram's `.drop` element, etc.) gets exactly the
    // same lifetime a native OS drag would give it. The hover phase uses a
    // tiny placeholder file (native browsers don't expose real file bytes
    // during dragover either — only on drop), and centrio-drop-file swaps in
    // the real file content only at the very end.
    let dragActive = false
    let lastX = 0
    let lastY = 0
    // Tracks whichever element elementFromPoint() last resolved to during the
    // live-hover phase. See BUGFIX comment below — needed to notice when a
    // reactively-mounted overlay (MAX's `.zone`, Telegram's `.drops-container`
    // / `.drop`) appears *underneath* the cursor mid-drag, since that element
    // never got its own 'dragenter' otherwise.
    let lastHoverTarget = null
    // Extra (selector-based, see findExtraDropTargets) elements that have
    // already received a 'dragenter' this hover session, so we don't keep
    // re-entering the same element on every tick — only dragover repeats.
    let enteredExtraTargets = new Set()

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    ipcRenderer.on('centrio-drag-hover', (_event, payload) => {
        try {
            if (!payload || !payload.filename) return
            const x = Number.isFinite(payload.x) ? payload.x : Math.floor(window.innerWidth / 2)
            const y = Number.isFinite(payload.y) ? payload.y : Math.floor(window.innerHeight / 2)
            lastX = x
            lastY = y

            const dt = buildDt(new Uint8Array(1), payload.filename, payload.mimeType)
            const target = document.elementFromPoint(x, y) || document.body

            if (!dragActive) {
                dragActive = true
                lastHoverTarget = target
                fireAt('dragenter', window, dt, x, y)
                fireAt('dragenter', document, dt, x, y)
                fireAt('dragenter', target, dt, x, y)
            } else if (target !== lastHoverTarget) {
                // BUGFIX (MAX/Telegram drop-zone flakiness with live hover):
                // apps like MAX (Svelte) and Telegram Web mount their
                // drop-zone overlay reactively, in direct response to a
                // 'dragenter' event — a plain repeated 'dragover' on an
                // element that appeared *after* the original dragenter is
                // not enough to make some of these components register as
                // "entered" (their own dragenter listener, on that specific
                // element, simply never fired). Diagnostic logs showed
                // MAX's `.zone` and Telegram's `.drops-container`/`.drop`
                // either never mounting at all or mounting then immediately
                // reverting, in gestures where the resolved target element
                // kept changing under the cursor without a fresh dragenter.
                // Fix: whenever elementFromPoint resolves to a *different*
                // element than last tick (new element scrolled/mounted
                // under the cursor), fire dragenter on it too, mirroring
                // real per-element dragenter/dragover semantics.
                fireAt('dragenter', target, dt, x, y)
                lastHoverTarget = target
            }

            fireAt('dragover', window, dt, x, y)
            fireAt('dragover', document, dt, x, y)
            fireAt('dragover', target, dt, x, y)

            // Same "not under the cursor" problem as at drop time (see
            // BUGFIX above findExtraDropTargets): once Telegram/MAX's
            // specific drop-hint element mounts, make sure IT also gets a
            // real dragenter→dragover lifecycle, not just whatever's
            // literally under the pointer.
            for (const el of findExtraDropTargets()) {
                if (el === target) continue
                if (!enteredExtraTargets.has(el)) {
                    enteredExtraTargets.add(el)
                    fireAt('dragenter', el, dt, x, y)
                }
                fireAt('dragover', el, dt, x, y)
            }
        } catch (err) {
            console.warn('[centrio-drag-hover] failed:', err)
        }
    })

    ipcRenderer.on('centrio-drag-leave', () => {
        if (!dragActive) return
        dragActive = false
        lastHoverTarget = null
        enteredExtraTargets = new Set()
        try {
            const dt = buildDt(new Uint8Array(1), 'drag-leave', '')
            const target = document.elementFromPoint(lastX, lastY) || document.body
            fireAt('dragleave', target, dt, lastX, lastY)
            fireAt('dragleave', document, dt, lastX, lastY)
            fireAt('dragend', target, dt, lastX, lastY)
        } catch (err) {
            console.warn('[centrio-drag-leave] failed:', err)
        }
    })

    // BUGFIX (files stopped landing after switching to live hover, even
    // though the overlay now showed): with live hover, dragover pulses are
    // paced by the REAL mousemove cadence, which is fine while the cursor is
    // moving — but users naturally stop moving for a beat right before
    // releasing the button, so the final elementFromPoint target can be
    // stale/still-animating (diagnostic logs showed MAX landing on a sidebar
    // list item and Telegram's `.drops-container` catching a *closing*
    // ("backwards") animation frame right as drop fired, both times because
    // no further dragover reached the real target for 1+ second before
    // drop). A single immediate dragover+drop right at mouseup doesn't give
    // these reactive UIs (Svelte/React) time to settle. So — same as the
    // proven-working earlier "pulse" implementation — re-settle with a
    // short paced burst (real setTimeout delays, re-resolving
    // elementFromPoint before each pulse since the DOM keeps changing
    // underneath) immediately before the actual drop, regardless of
    // whatever the live-hover phase's target was.
    const SETTLE_PULSES = 3
    const SETTLE_DELAY_MS = 60

    ipcRenderer.on('centrio-drop-file', async (_event, payload) => {
        try {
            if (!payload || !payload.data || !payload.filename) {
                console.warn('[centrio-drop-file] invalid payload', payload)
                return
            }

            const bytes = payload.data instanceof Uint8Array
                ? payload.data
                : new Uint8Array(payload.data)
            if (!bytes.length || bytes.length > MAX_DROP_FILE_BYTES) {
                console.warn('[centrio-drop-file] rejected byte length', bytes.length)
                return
            }

            const dt = buildDt(bytes, payload.filename, payload.mimeType)

            const x = Number.isFinite(payload.x) ? payload.x : lastX
            const y = Number.isFinite(payload.y) ? payload.y : lastY

            dragActive = false
            lastHoverTarget = null

            let target = document.elementFromPoint(x, y) || document.body
            fireAt('dragenter', window, dt, x, y)
            fireAt('dragenter', document, dt, x, y)
            fireAt('dragenter', target, dt, x, y)

            // BUGFIX (Telegram: overlay shows via body.is-dragging, file
            // still doesn't land): same "not under the cursor" problem as
            // during hover — Telegram's real file-accepting element is a
            // reactively-mounted `.drops-container .drop` card that
            // elementFromPoint(x,y) may never resolve to, since it isn't
            // necessarily centered on the cursor's exact drop coordinates.
            // 'drop' only bubbles upward, so a synthetic 'drop' dispatched
            // on <body>/document/window can never reach a listener bound
            // directly to that descendant. Track known extra selector-based
            // targets (see findExtraDropTargets) through the whole settle+
            // drop sequence so they get their own real dragenter/dragover/
            // drop lifecycle regardless of exact pointer position.
            const extraEntered = new Set()
            for (const el of findExtraDropTargets()) {
                if (el === target) continue
                extraEntered.add(el)
                fireAt('dragenter', el, dt, x, y)
            }

            for (let i = 1; i <= SETTLE_PULSES; i++) {
                await wait(SETTLE_DELAY_MS)
                target = document.elementFromPoint(x, y) || document.body
                fireAt('dragover', window, dt, x, y)
                fireAt('dragover', document, dt, x, y)
                fireAt('dragover', target, dt, x, y)

                for (const el of findExtraDropTargets()) {
                    if (el === target) continue
                    if (!extraEntered.has(el)) {
                        extraEntered.add(el)
                        fireAt('dragenter', el, dt, x, y)
                    }
                    fireAt('dragover', el, dt, x, y)
                }
            }

            target = document.elementFromPoint(x, y) || document.body
            fireAt('drop', target, dt, x, y)
            fireAt('drop', document, dt, x, y)
            fireAt('drop', window, dt, x, y)
            fireAt('dragend', target, dt, x, y)
            fireAt('dragend', document, dt, x, y)

            // Also fire the terminal drop/dragend directly on any extra
            // selector-matched target (e.g. Telegram's `.drop` card) — this
            // is the actual fix: it's the one dispatch that can reach a
            // 'drop' listener bound to that specific descendant element.
            for (const el of findExtraDropTargets()) {
                if (el === target) continue
                fireAt('drop', el, dt, x, y)
                fireAt('dragend', el, dt, x, y)
            }
        } catch (err) {
            console.warn('[centrio-drop-file] failed:', err)
        }
    })
}

// ── Диплинки других мессенджеров (MAX / Telegram) ──────────────────────────
// Этот preload инжектится и исполняется ВНУТРИ произвольной чужой страницы
// (Telegram Web, WhatsApp Web и т.п.), поэтому распознавание должно быть
// максимально узким и явным (два конкретных паттерна) — всё нераспознанное
// должно падать в старое поведение без изменений, чтобы не задеть клики по
// ссылкам во всех остальных мессенджерах. Решение "есть ли уже открытая
// вкладка нужного сервиса" здесь принять НЕЛЬЗЯ — у preload'а нет доступа к
// списку вкладок (тот живёт в renderer/messengers.js). Поэтому распознанные
// ссылки уходят через sendToHost() к host-документу (renderer/messengers.js
// слушает 'ipc-message' на самом <webview>), а не напрямую в main процесс —
// именно renderer решает, переключить вкладку или откатиться на open-url.
function classifyDeepLink(href) {
    if (!href) return null
    // tg://resolve?domain=username или tg://join?invite=<hash> — единственные
    // два tg://-паттерна, которые translateDeepLinkUrl() (renderer/
    // webview-tabs-bind.js) реально умеет превращать в t.me-ссылку. Раньше
    // здесь стоял общий /^tg:\/\//i, ловивший ЛЮБОЙ tg:// (например
    // официальный tg://msg_url?... виджет "поделиться в Telegram") — клик по
    // такой ссылке доходил до e.preventDefault()/stopPropagation() ниже, но
    // translateDeepLinkUrl() возвращал null и открыть её было уже нечем: клик
    // полностью проглатывался без какого-либо фолбэка. Сузили классификацию
    // до тех же двух форм, что и на translate-стороне — нераспознанные формы
    // теперь просто не перехватываются здесь и идут обычным путём страницы.
    if (/^tg:\/\/(resolve(\?|$)|join\?invite=)/i.test(href)) return { service: 'telegram', href }
    // https://max.ru/join/<token> — инвайт-ссылки мессенджера MAX
    if (/^https:\/\/max\.ru\/join\//i.test(href)) return { service: 'max', href }
    // https://t.me/<username> или https://t.me/+<hash> — это то, чем реально
    // делятся приглашениями на практике (люди копируют t.me-ссылку, а не
    // tg://resolve — та строится браузером/ОС из t.me, пользователь её не
    // видит). Без этого паттерна фича не срабатывала на самый частый случай.
    if (/^https:\/\/(www\.)?t\.me\//i.test(href)) return { service: 'telegram', href }
    return null
}

// BUGFIX ("внутренние ссылки в ТГ не работают, внешние работают"): раньше
// classifyDeepLink()-перехват срабатывал безусловно для ЛЮБОГО совпавшего
// href — включая клики ВНУТРИ уже открытого web.telegram.org/t.me/max.ru по
// его собственным internal-ссылкам (например клик на @username в тексте
// сообщения или на пересланный t.me-инвайт прямо в чате). Такой клик
// перехватывался, e.preventDefault()+stopPropagation() глушили родную
// SPA-навигацию клиента, а ipcRenderer.sendToHost('deep-link', …) уходил в
// routeDeepLink() (renderer/webview-tabs-bind.js), который снова находил
// ЭТУ ЖЕ вкладку и пытался её же куда-то перенавигировать через
// location.hash-трюк — на практике эта навигация по кругу либо ничего не
// делала, либо конфликтовала с уже начавшейся родной навигацией страницы.
// Кросс-мессенджерный сценарий (ссылка на Telegram, кликнутая ИЗ другого
// мессенджера, например из чата WhatsApp) при этом продолжает работать как
// раньше — здесь глушится только клик, сделанный на странице САМОГО того
// сервиса, которому принадлежит ссылка; там нативная навигация клиента и
// так справляется лучше нашего hash-трюка.
function isCurrentPageService(service) {
    const host = getHostname()
    if (service === 'telegram') return /(^|\.)t\.me$|(^|\.)telegram\.org$/i.test(host)
    if (service === 'max') return /(^|\.)max\.ru$/i.test(host)
    return false
}

function bindLinkInterception() {
    document.addEventListener('click', (e) => {
        const link = e.target?.closest && e.target.closest('a[href]')
        if (!link) return

        const href = link.getAttribute('href')
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

        // SECURITY: in-app deep-link routing (tab-switch + loadURL into a
        // DIFFERENT, already-authenticated webview) only fires for a real,
        // user-initiated click (e.isTrusted). Page script can dispatch a
        // synthetic click on any <a> with zero user gesture — without this
        // check, any guest page content (a compromised/malicious ad, a
        // crafted message rendered as HTML, etc.) could silently force
        // e.g. the user's logged-in Telegram tab to navigate, with no
        // interaction at all. A synthetic click on a deep link still falls
        // through to the ordinary open-url path below when possible
        // (max.ru/join is https:// so it qualifies), same as before this
        // feature existed.
        const special = e.isTrusted ? classifyDeepLink(href) : null
        if (special && !isCurrentPageService(special.service)) {
            e.preventDefault()
            e.stopPropagation()
            ipcRenderer.sendToHost('deep-link', special)
            return
        }

        // BUGFIX v1.9.4 ("клики — и обычная внутренняя навигация, и 'скачать
        // файл' — открывали внешний браузер"): раньше это условие ловило
        // ЛЮБОЙ клик по <a href="http(s)://…"> — то есть каждую обычную
        // ссылку на странице, включая внутреннюю SPA-навигацию сайта и
        // ссылки на скачивание.
        //
        // BUGFIX v1.9.5 ("вход в Яндекс.Почте снова открывает браузер"):
        // v1.9.4 сузил условие до "другой хост" вместо "любой http(s)" — но
        // это снова ловило CAM top-level редирект на страницу входа/OAuth
        // (обычно другой поддомен, например passport.yandex.ru), причём
        // РАНЬШЕ, чем клик успевал стать настоящей навигацией. А именно
        // настоящую навигацию (событие 'will-navigate' на самом <webview>,
        // не клик на <a> внутри страницы) уже корректно обрабатывает
        // renderer/webview-tabs-bind.js — там же учтён и OAuth-брокер
        // (isOAuthProviderUrl, item #6). Дублировать эту логику здесь на
        // уровне клика не нужно и вредно: наш собственный preventDefault()
        // тут просто не даёт will-navigate вообще случиться. Поэтому теперь
        // наружу уходит только явное "открыть в новой вкладке"
        // (target=_blank) — вся обычная навигация, включая кросс-доменную,
        // остаётся штатной и попадает под уже правильную обработку хоста.
        if (link.hasAttribute('download')) return

        if (link.target === '_blank') {
            // BUGFIX (изначально "нажимаю Войти — сразу идёт в браузер";
            // расширено 2026-09-01 на "вложения из Яндекс.Почты не
            // скачиваются, предпросмотр открывается в браузере, а сама
            // загрузка — нет"): этот обработчик клика вызывает
            // preventDefault() раньше, чем Chromium вообще успевает решить,
            // что это "открыть в новом окне" — то есть раньше, чем
            // сработает 'new-window'/setWindowOpenHandler на host-стороне
            // (main/bootstrap/registerAppEvents.js), где уже есть верная
            // обработка и для OAuth-попапов (createPopupWindow/
            // wireOAuthPopup), и для скрытых загрузок (окно создаётся
            // скрытым, ждём 'will-download' — не сработал, значит это
            // реально просто страница — только тогда отдаём во внешний
            // браузер). Раньше здесь всё <a target="_blank"> без атрибута
            // download (например кнопка "Скачать" у Яндекс.Почты — сервер
            // сам решает через Content-Disposition, качать файл или
            // показать инлайн, HTML-атрибут download ей не нужен)
            // безусловно уходило в open-url → shell.openExternal, минуя
            // этот безопасный механизм целиком: у внешнего браузера нет
            // cookie-сессии мессенджера, предпросмотр по токену в самой
            // ссылке ещё работает, а реальное сохранение файла — уже нет.
            // Пропускаем клик естественным путём (без preventDefault) во
            // всех случаях — тот же путь, что уже проверенно чинит вложения
            // MAX.
            return
        }
    }, true)

    // BUGFIX ("кнопка мессенджера/попапы в Яндекс.Почте открывали внешний
    // браузер"): this used to unconditionally hijack window.open() and send
    // every call straight to the external browser. That pre-empted Chromium's
    // own popup handling entirely — window.open() never got a chance to
    // trigger the <webview>'s native 'new-window' event, which is what
    // renderer/webview-tabs-bind.js actually listens on to route popups
    // through open-popup-window with the messenger's own session (including
    // the item #1/#6 OAuth-broker handling). With window.open overridden
    // here, that whole mechanism was silently unreachable for any popup a
    // guest page opened via window.open() (as opposed to a target="_blank"
    // link). Removed — window.open() now behaves natively, and 'new-window'
    // fires and gets handled as intended.
}

// ─── Перехват Notification ──────────────────────────────────────────────────
// Вызываем ДО DOMContentLoaded (до того как страница успеет сохранить
// оригинальный Notification). Так ловим даже ранние вызовы.
function patchNotification() {
    const OriginalNotification = window.Notification
    if (!OriginalNotification || window.__centrioNotifPatched) return
    window.__centrioNotifPatched = true

    function sendNotif(title, options) {
        try {
            ipcRenderer.sendToHost('site-notification', {
                title: String(title || ''),
                body: String(options?.body || ''),
                tag: String(options?.tag || ''),
                icon: options?.icon || ''
            })
        } catch {}
    }

    class PatchedNotification extends OriginalNotification {
        constructor(title, options = {}) {
            sendNotif(title, options)
            super(title, options)
            this.addEventListener('click', () => {
                try { ipcRenderer.sendToHost('notification-clicked', {}) } catch {}
            })
        }
    }

    try {
        Object.defineProperty(PatchedNotification, 'permission', {
            get() { return OriginalNotification.permission }
        })
    } catch {
        PatchedNotification.permission = OriginalNotification.permission
    }

    PatchedNotification.requestPermission =
        OriginalNotification.requestPermission?.bind(OriginalNotification)
        ?? (() => Promise.resolve('granted'))

    window.Notification = PatchedNotification

    // ── Перехват ServiceWorker registration.showNotification ──────────────
    // Telegram, WhatsApp и другие показывают уведомления через service worker,
    // а не через window.Notification — нужен отдельный перехват.
    try {
        const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker)
        navigator.serviceWorker.register = async function (scriptURL, options) {
            const reg = await origRegister(scriptURL, options)
            patchSwRegistration(reg)
            return reg
        }
    } catch {}

    // Также патчим уже существующую registration, если она есть
    try {
        navigator.serviceWorker.ready.then(reg => patchSwRegistration(reg)).catch(() => {})
    } catch {}

    function patchSwRegistration(reg) {
        if (!reg || reg.__centrioPatched) return
        reg.__centrioPatched = true
        const origShow = reg.showNotification.bind(reg)
        reg.showNotification = function (title, options) {
            sendNotif(title, options)
            return origShow(title, options)
        }
    }
}

function bindKeyboardForwarding() {
    // Перехватываем горячие клавиши до того, как сайт их обработает,
    // и передаём в главный рендерер (который не получает keydown из webview)
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey) return

        let shortcut = null

        if (!e.shiftKey && !e.altKey && e.code >= 'Digit1' && e.code <= 'Digit9') {
            shortcut = `ctrl+${e.code.replace('Digit', '')}`
        } else if (!e.shiftKey && e.code === 'Tab') {
            shortcut = 'ctrl+tab'
            e.preventDefault()
        } else if (e.shiftKey && e.code === 'Tab') {
            shortcut = 'ctrl+shift+tab'
            e.preventDefault()
        } else if (!e.shiftKey && e.code === 'KeyR') {
            shortcut = 'ctrl+r'
        } else if (!e.shiftKey && e.code === 'KeyF') {
            shortcut = 'ctrl+f'
        } else if (!e.shiftKey && (e.code === 'KeyP' || e.code === 'KeyK')) {
            shortcut = 'ctrl+search'
        } else if (!e.shiftKey && e.code === 'Comma') {
            shortcut = 'ctrl+comma'
        } else if (!e.shiftKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
            shortcut = 'ctrl+='
            e.preventDefault()
        } else if (!e.shiftKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
            shortcut = 'ctrl+-'
            e.preventDefault()
        } else if (!e.shiftKey && e.code === 'Digit0') {
            shortcut = 'ctrl+0'
            e.preventDefault()
        } else if (e.shiftKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
            shortcut = 'ctrl+shift+='
            e.preventDefault()
        } else if (e.shiftKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
            shortcut = 'ctrl+shift+-'
            e.preventDefault()
        }

        if (shortcut) {
            ipcRenderer.sendToHost('keyboard-shortcut', shortcut)
        }
    }, true)
}

function bindMsgSentDetection() {
    // Detect Enter keypress in text input areas → report message sent
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return
        const el = e.target
        if (!el) return
        const tag = el.tagName
        const isInput = tag === 'TEXTAREA' ||
            (tag === 'DIV' && el.contentEditable === 'true') ||
            (tag === 'P'   && el.contentEditable === 'true') ||
            (tag === 'SPAN' && el.contentEditable === 'true')
        if (!isInput) return
        // Small delay so the message actually gets sent before we report
        setTimeout(() => {
            try { ipcRenderer.sendToHost('msg-sent', {}) } catch {}
        }, 100)
    }, true)
}

// FEATURE (2026-08-28, "мини-плеер ... когда в любой открытой вкладке играет
// видео или аудио" — live user request): единственный способ узнать про
// проигрывание медиа — изнутри самой гостевой страницы (у главного процесса
// и у renderer'а хоста нет доступа к DOM webview-содержимого). 'play'/
// 'pause'/'ended' у <video>/<audio> НЕ всплывают (bubbles: false), поэтому
// обычный делегированный listener на document с bubble-фазой их не поймает
// — вместо этого вешаемся на capture-фазу (useCapture: true): захват идёт
// сверху вниз от document к цели независимо от того, всплывает ли событие,
// так что это отдельный, надёжный способ ловить такие события без
// необходимости индивидуально биндиться на каждый <video>/<audio> (в т.ч.
// появляющиеся динамически — SPA вроде YouTube/VK начинают воспроизведение
// в элементах, которых не было в DOM на момент старта preload).
// Статус пересчитывается и шлётся ХОСТУ (renderer/webview-tabs-bind.js,
// канал 'media-state') с небольшим дебаунсом — сразу несколько
// play/pause-событий могут прилететь пачкой (например при переключении
// трека), не нужно слать промежуточные состояния.
function bindMediaPlaybackDetection() {
    let sendTimer = null
    // Последний элемент, который реально играл — нужен, чтобы "плей" из
    // мини-плеера (после нажатия "пауза" пользователем) возобновлял именно
    // его, а не первый попавшийся <video>/<audio> на странице (их может
    // быть несколько — например скрытый превью-ролик в ленте).
    let lastActiveMedia = null

    function currentTitle() {
        // MediaSession API — то же, что показывают системные медиа-виджеты
        // ОС (Windows SMTC и т.п.), большинство настоящих аудио/видео SPA
        // (YouTube, VK, Яндекс.Музыка, Zoom/Meet — где применимо) уже
        // проставляют туда осмысленное название трека/звонка. document.title
        // — фолбэк для страниц, которые MediaSession не используют.
        try {
            const metaTitle = navigator.mediaSession && navigator.mediaSession.metadata
                && navigator.mediaSession.metadata.title
            if (metaTitle) return String(metaTitle)
        } catch {}
        return document.title || ''
    }

    // BUGFIX (2026-09-01, "когда играет ВК-музыка — кнопка медиаплеера не
    // показывается"): document.querySelectorAll('video, audio') НЕ проходит
    // внутрь Shadow DOM — если плеер (весь vk.com — веб-компонентный SPA,
    // как и многие современные плееры) рендерит <audio> внутри
    // shadowRoot'а какого-нибудь кастомного элемента, а не прямо в light
    // DOM, элемент для querySelectorAll просто не существует. Рекурсивно
    // обходим все элементы и заглядываем в el.shadowRoot, где он есть.
    function findAllMediaElements(root, out) {
        out = out || []
        root.querySelectorAll('video, audio').forEach((el) => out.push(el))
        root.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) findAllMediaElements(el.shadowRoot, out)
        })
        return out
    }

    function computeAndSend() {
        clearTimeout(sendTimer)
        sendTimer = setTimeout(() => {
            let playing = false
            findAllMediaElements(document).forEach((el) => {
                if (!el.paused && !el.ended) {
                    playing = true
                    lastActiveMedia = el
                }
            })
            // Фолбэк: некоторые плееры проигрывают звук через Web Audio API
            // (AudioContext/AudioBufferSourceNode) вообще без единого
            // HTMLMediaElement в DOM — там play/pause-события выше не
            // приходят в принципе, querySelectorAll ловить нечего. Если
            // сама страница честно поддерживает MediaSession (см.
            // currentTitle() ниже) и явно сообщает playbackState:'playing',
            // доверяем этому сигналу как есть — это тот же API, на который
            // полагаются системные медиа-виджеты ОС (Windows SMTC и т.п.).
            if (!playing) {
                try {
                    if (navigator.mediaSession && navigator.mediaSession.playbackState === 'playing') {
                        playing = true
                    }
                } catch {}
            }
            try {
                ipcRenderer.sendToHost('media-state', { playing, title: currentTitle() })
            } catch {}
        }, 120)
    }

    document.addEventListener('play', computeAndSend, true)
    document.addEventListener('playing', computeAndSend, true)
    document.addEventListener('pause', computeAndSend, true)
    document.addEventListener('ended', computeAndSend, true)
    document.addEventListener('emptied', computeAndSend, true)

    // Безопасная сетка поверх событий — если конкретный плеер меняет
    // состояние способом, который ни одно из событий выше не ловит (кастомный
    // проигрыватель, дозагрузка нового <audio> в обход стандартных событий и
    // т.п.), не оставляем кнопку зависшей в неверном состоянии дольше,
    // чем на несколько секунд. Дёшево — computeAndSend() сам дебaунсит.
    setInterval(computeAndSend, 4000)

    // Команда из хоста (клик по кнопке паузы/плей в мини-плеере) — см.
    // renderer/media-player-ui.js. 'pause' ставит на паузу ВСЁ проигрывающееся
    // медиа на странице (проще и предсказуемее, чем угадывать "то самое"),
    // 'play' возобновляет последний реально игравший элемент.
    ipcRenderer.on('media-command', (_event, cmd) => {
        if (cmd === 'pause') {
            document.querySelectorAll('video, audio').forEach((el) => {
                if (!el.paused) el.pause()
            })
        } else if (cmd === 'play') {
            const target = (lastActiveMedia && document.contains(lastActiveMedia))
                ? lastActiveMedia
                : document.querySelector('video, audio')
            if (target && typeof target.play === 'function') {
                target.play().catch(() => {})
            }
        }
    })
}

// ── Перетаскивание вложения между мессенджерами — история ──────────────────
// Была попытка (v1.9.3) перетаскивать картинку/файл из одного открытого
// мессенджера в другой через 'DownloadURL' в dataTransfer, убрана в v1.9.5.
// На практике оказалось хуже, чем просто "не работает": Chromium сам
// добавляет в dataTransfer собственные данные для <img> (uri-list и т.п.),
// и когда принимающая страница не обрабатывает drop сама, срабатывает
// штатный fallback браузера — не навигация текущей страницы, а открытие
// НОВОГО окна, что уже прямая помеха пользователю. preventDefault() на
// dragstart эту проблему не решает — он отменяет весь жест перетаскивания
// целиком, а не только дефолтные данные Chromium.
//
// Перетаскивание из ПАНЕЛИ ЗАГРУЗОК в мессенджер — отдельная, третья
// попытка, реализована через bindDropFileHandler() выше: никакой настоящей
// OS-drag-сессии, только синтетические DragEvent с DataTransfer, которую мы
// сами построили с нуля (без участия Chromium) — та же ловушка здесь не
// воспроизводится, потому что нет реального dragstart на DOM-элементе.
function init() {
    bindContextMenuForwarding()
    bindKeyboardForwarding()
    bindDownloadImageHandler()
    bindDropFileHandler()
    bindLinkInterception()
    bindMsgSentDetection()
    bindMediaPlaybackDetection()
    startObserver()
    startUnreadInterval()
    setTimeout(checkUnread, 1000)
    // Задержка нужна, чтобы не захватить фавикон самого первого (переходного) рендера как baseline.
    setTimeout(captureBaselineFavicon, 3000)
}

// Патчим Notification НЕМЕДЛЕННО — до любых скриптов страницы
patchNotification()

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
} else {
    init()
}

window.addEventListener('beforeunload', () => {
    try {
        if (unreadInterval) clearInterval(unreadInterval)
        if (mutationObserver) mutationObserver.disconnect()
    } catch {}
})

console.log('Centrio webview preload: started')