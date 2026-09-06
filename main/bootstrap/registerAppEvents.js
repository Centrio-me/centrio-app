const { shell, session, ipcMain } = require('electron')
const { fileURLToPath } = require('url')
const path = require('path')
const tracker = require('../services/tracker')
const store = require('../services/store')
const { getWebviewPreloadPath, waitForPendingSyncPush } = require('../ipc/api')
const { wireSessionDownloads } = require('../ipc/downloads')
const { attachServiceWorkerNotifBridge } = require('../services/swNotifPatcher')
const {
    createPopupWindow, wireOAuthPopup,
    ensureGoogleAccountsWebAuthnBlock, isGoogleAccountsUrl,
    isOAuthBrokerActive, markOAuthBrokerActive, clearOAuthBrokerActive
} = require('../ipc/window')
const { isOAuthProviderUrl, isYandexInternalSsoHost } = require('../services/oauthProviders')

// BUGFIX ("Google: бесконечный повторяющийся [popup] loadURL failed
// ERR_FAILED loading 'https://accounts.google.com/_/bscframe'" —
// live-reproduced): once the will-frame-navigate handler below started
// catching sub-frame OAuth navigations, it turned out Google's own
// accounts.google.com sign-in page repeatedly re-navigates an internal
// cross-origin sync iframe to .../_/bscframe (not a real sign-in page —
// it's never meant to be loaded top-level) roughly every 1-1.5s for as
// long as that page is open. Every one of those sub-frame navigations
// also matches isOAuthProviderUrl (hostname-only check), so each one
// used to spawn its OWN new createPopupWindow() — a fresh popup that
// immediately fails to load bscframe standalone, retries once, fails
// again, and falls back to shell.openExternal(), forever, once per
// interception. Tracked per messengerId (not per contents/session
// object, which would be a new instance on every webview reattach):
// once a broker popup is already open for a given messenger, any further
// OAuth-host sub-frame navigation from that same messenger's webview is
// swallowed (still preventDefault()-ed so the guest iframe doesn't churn
// either) instead of opening a second popup, until the existing popup
// closes.
//
// BUGFIX (Gmail "лишнее пустое окно" / 2FA дублирующийся флоу → Google
// "error 400"; Grok "2 окна" — live-reproduced): this used to be a LOCAL
// `new Set()` right here, shared only between this file's own two entry
// points (setWindowOpenHandler below and openOAuthBroker/will-frame-navigate
// below). But renderer/webview-tabs-bind.js's top-level 'will-navigate'
// listener creates OAuth broker popups too, via a direct 'open-popup-window'
// IPC call into createPopupWindow() — completely invisible to a Set living
// in this file's closure. Moved the actual Set (and the guard enforcement
// for the createPopupWindow() path) into main/ipc/window.js itself, since
// that's the one function every manual-BrowserWindow broker path funnels
// through; this file now just reads/writes the same shared state via the
// exported helpers above for its own two entry points.

// Normalizes a preload value (file:// URL or plain path, as seen in either
// webPreferences.preload or our own getWebviewPreloadPath() output) down to a
// comparable absolute filesystem path. Comparing normalized paths instead of
// raw strings avoids false-positive blocks from harmless formatting
// differences (URL-encoding, drive-letter case on Windows, trailing slash)
// between what we generated and what Electron reports back.
function normalizePreloadPath(value) {
    if (typeof value !== 'string' || !value) return null
    try {
        const p = value.startsWith('file://') ? fileURLToPath(value) : value
        return path.resolve(p).toLowerCase()
    } catch {
        return null
    }
}

let log
try { log = require('electron-log') } catch { log = console }

// Партиции, которым уже назначен permission-хендлер (см. BUGFIX про буфер
// обмена в will-attach-webview ниже) — ставим один раз на сессию, а не на
// каждый attach webview.
const clipboardPermissionPartitions = new Set()

// ── Детект непрочитанных ────────────────────────────────────────────────────
// BUGFIX ("бейджи непрочитанных не появляются"): изначально это делалось из
// webview-preload.js (атрибут preload у <webview>). Диагностика подтвердила,
// что этот механизм на текущей версии Electron (39.x) для <webview> тегов не
// исполняется вообще — ни console.log, ни созданный им DOM-узел ни разу не
// появились на гостевой странице, хотя will-attach-webview репортит
// preloadOk:true с верным путём к файлу. contents.executeJavaScript() на
// dom-ready — подтверждённо рабочий альтернативный канал инъекции (тот же
// тест с видимым DOM-маркером сработал через него сразу) — поэтому детект
// строится на нём: реального Node/ipcRenderer в этом мире нет (contextIsolation
// не даёт), поэтому просто вычисляем число и забираем его через возвращаемое
// значение промиса, без событий изнутри страницы.
const UNREAD_DETECT_SCRIPT = `(function() {
    function parsePositiveInt(v) {
        if (v == null) return null
        var t = String(v).trim()
        if (!t) return null
        var m = t.match(/\\d+/)
        if (!m) return null
        var n = parseInt(m[0], 10)
        if (!isFinite(n) || n < 0 || n >= 10000) return null
        return n
    }
    function isVisible(el) {
        if (!el) return false
        var s = window.getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
        var r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
    }
    function fromTitle(title) {
        if (!title) return null
        var m = title.match(/^\\((\\d+)\\)\\s*/); if (m) return parseInt(m[1], 10) || 0
        m = title.match(/\\((\\d+)\\)\\s*$/); if (m) return parseInt(m[1], 10) || 0
        m = title.match(/^(\\d+)\\b/); if (m) return parseInt(m[1], 10) || 0
        m = title.match(/(\\d+)\\s+unread/i); if (m) return parseInt(m[1], 10) || 0
        return null
    }
    function scanSelectors(selectors) {
        for (var i = 0; i < selectors.length; i++) {
            var els
            try { els = document.querySelectorAll(selectors[i]) } catch (e) { continue }
            for (var j = 0; j < els.length; j++) {
                var el = els[j]
                if (!isVisible(el)) continue
                var ariaNum = parsePositiveInt(el.getAttribute('aria-label'))
                if (typeof ariaNum === 'number' && ariaNum > 0) return ariaNum
                var text = (el.textContent || '').trim()
                if (text.length > 6) continue
                var num = parsePositiveInt(text)
                if (typeof num === 'number' && num > 0) return num
            }
        }
        return null
    }
    var hostname = location.hostname || ''
    var titleCount = fromTitle(document.title || '')
    var selectors = hostname.indexOf('telegram') !== -1
        ? ['[aria-label*="unread" i]', '.ListItem-badge', '.badge', '.Badge', '.counter', '.Counter', '[class*="unread" i]', '[class*="badge" i]', '[data-testid*="unread" i]', '[data-testid*="badge" i]']
        : ['.unread-count', '.badge-counter', '.chat-unread-count', '.conversations-badge', '[aria-label*="unread" i]', '[class*="unread" i]', '[class*="badge-count" i]', '[class*="unreadcount" i]', '[data-testid*="unread" i]', '[data-testid*="badge" i]']
    var domCount = scanSelectors(selectors)
    if (typeof titleCount === 'number' && titleCount > 0) return titleCount
    if (typeof domCount === 'number' && domCount > 0) return domCount
    return 0
})()`

const UNREAD_POLL_MS = 5000

// ── Детект site-уведомлений (Notification / SW showNotification) ───────────
// Тот же баг, что и с непрочитанными выше: изначально перехват
// window.Notification / ServiceWorkerRegistration.showNotification жил в
// webview-preload.js (patchNotification()), но preload-атрибут <webview>
// подтверждённо не исполняется на этой версии Electron ни для одного
// мессенджера (см. диагностику в комментарии над UNREAD_DETECT_SCRIPT) — это
// был полностью мёртвый код, ни разу не сработавший, отсюда и баг "уведомления
// не появляются в центре уведомлений" даже для настоящих входящих сообщений.
// Чиним тем же рабочим каналом: executeJavaScript на dom-ready. Патчить нужно
// на КАЖДЫЙ dom-ready (не один раз за весь contents), потому что навигация
// внутри <webview> — это новый document/window, и патч (как и window.Notification)
// сбрасывается вместе с ним; сам патч идемпотентен внутри одной страницы через
// флаг window.__centrioNotifPatched. Реального ipcRenderer в этом мире нет
// (contextIsolation), поэтому перехваченные вызовы складываются в очередь
// window.__centrioPendingNotifs и забираются pull-опросом — тем же паттерном,
// что и счётчик непрочитанных.
const NOTIF_PATCH_SCRIPT = `(function() {
    if (window.__centrioNotifPatched) return 'already-patched'
    window.__centrioNotifPatched = true
    window.__centrioPendingNotifs = window.__centrioPendingNotifs || []

    function queue(title, options) {
        try {
            // options.data — многие PWA кладут туда путь/ссылку на конкретный
            // диалог/сообщение (используется в их же 'notificationclick'). Если
            // формат узнаваемый — тащим дальше как кандидат в actionUrl, чтобы
            // клик по записи в центре уведомлений мог открыть именно этот чат,
            // а не просто вкладку мессенджера.
            var rawData = options && options.data
            var url = null
            if (typeof rawData === 'string') url = rawData
            else if (rawData && typeof rawData === 'object') {
                url = rawData.url || rawData.link || rawData.deepLink || rawData.href || null
            }

            window.__centrioPendingNotifs.push({
                title: String(title || ''),
                body: String((options && options.body) || ''),
                tag: String((options && options.tag) || ''),
                icon: (options && options.icon) || '',
                url: url ? String(url) : ''
            })
        } catch (e) {}
    }

    try {
        var OriginalNotification = window.Notification
        if (OriginalNotification) {
            var PatchedNotification = function (title, options) {
                queue(title, options)
                return new OriginalNotification(title, options)
            }
            PatchedNotification.prototype = OriginalNotification.prototype
            try {
                Object.defineProperty(PatchedNotification, 'permission', {
                    get: function () { return OriginalNotification.permission }
                })
            } catch (e) {
                PatchedNotification.permission = OriginalNotification.permission
            }
            PatchedNotification.requestPermission = OriginalNotification.requestPermission
                ? OriginalNotification.requestPermission.bind(OriginalNotification)
                : function () { return Promise.resolve('granted') }
            window.Notification = PatchedNotification
        }
    } catch (e) {}

    try {
        if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification) {
            var origShow = ServiceWorkerRegistration.prototype.showNotification
            ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
                queue(title, options)
                return origShow.call(this, title, options)
            }
        }
    } catch (e) {}

    return 'patched'
})()`

const NOTIF_DRAIN_SCRIPT = `(function() {
    if (!window.__centrioPendingNotifs || !window.__centrioPendingNotifs.length) return []
    return window.__centrioPendingNotifs.splice(0, window.__centrioPendingNotifs.length)
})()`

const NOTIF_POLL_MS = 2000

// ── Диагностика "аудиосообщения иногда не воспроизводятся" (репорт: WhatsApp
// Web и Яндекс Мессенджер, перемежающийся характер) ─────────────────────────
// Статический разбор кода приложения (adblock-паттерны в
// main/services/adblock.js, отсутствие permission-хендлера для медиа, стандартные
// атрибуты <webview>, отсутствие перехвата <audio>/.play() в webview-preload.js,
// CDP-мост для SW-уведомлений в main/services/swNotifPatcher.js) не нашёл ни
// одной точки в РАСШИРЕНИИ приложения, которая могла бы блокировать
// воспроизведение медиа — единственный правдоподобный источник именно
// ПЕРЕМЕЖАЮЩИХСЯ сбоев (не блокировка целиком, а "иногда") — сетевой слой
// (VPN/прокси-туннель, см. main/services/proxy.js) или сам мессенджер/CDN.
// Дальше без воспроизводимого случая двигаться нельзя — вместо угадывания
// добавляем пассивный диагностический хук тем же подтверждённо рабочим каналом
// (executeJavaScript on dom-ready), что и счётчик непрочитанных/уведомления
// выше — preload-атрибут <webview> для этого не годится (см. комментарий над
// UNREAD_DETECT_SCRIPT). 'error'/'stalled' на <audio>/<video> не всплывают —
// слушаем в фазе capture на document. Следующее реальное воспроизведение бага
// запишет code/message/networkState/src в лог главного процесса.
const MEDIA_DIAG_PATCH_SCRIPT = `(function() {
    if (window.__centrioMediaDiagPatched) return 'already-patched'
    window.__centrioMediaDiagPatched = true
    window.__centrioPendingMediaErrors = window.__centrioPendingMediaErrors || []

    function isMedia(el) {
        return el && (el.tagName === 'AUDIO' || el.tagName === 'VIDEO')
    }

    function report(type, el) {
        try {
            var err = el.error
            window.__centrioPendingMediaErrors.push({
                type: type,
                src: String(el.currentSrc || el.src || ''),
                code: err ? err.code : null,
                message: err && err.message ? String(err.message) : '',
                networkState: el.networkState,
                readyState: el.readyState
            })
            // Не даём очереди расти бесконечно, если сбоев сразу много
            if (window.__centrioPendingMediaErrors.length > 20) {
                window.__centrioPendingMediaErrors.splice(0, window.__centrioPendingMediaErrors.length - 20)
            }
        } catch (e) {}
    }

    document.addEventListener('error', function (e) {
        if (isMedia(e.target)) report('error', e.target)
    }, true)
    document.addEventListener('stalled', function (e) {
        if (isMedia(e.target)) report('stalled', e.target)
    }, true)

    // BUGFIX (2026-08-25, "в Яндекс Мессенджере не воспроизводятся
    // аудиосообщения совсем — никакие, на трёх компьютерах" — stronger,
    // categorical signal than the intermittent WhatsApp/Yandex report this
    // diagnostic hook was originally built for): 'error'/'stalled' only
    // fire for network/decode failures on the <audio>/<video> element
    // itself — they say nothing about the OTHER common silent-failure
    // path, HTMLMediaElement.play() returning a REJECTED promise (e.g.
    // NotAllowedError from an autoplay/gesture check, NotSupportedError
    // from a codec Chromium's build doesn't ship). A caller that doesn't
    // explicitly .catch() that rejection fails completely silently: no
    // 'error' event, no console output visible outside the guest page, no
    // audio — which matches "doesn't play at all" far better than a
    // network hiccup would. Wrapping play() itself, rather than only
    // listening for element events, closes that blind spot without
    // guessing at which of the two failure modes is actually happening —
    // the next live repro will tell us definitively via err.name/message.
    try {
        var origPlay = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function () {
            var el = this
            var result = origPlay.apply(el, arguments)
            if (result && typeof result.catch === 'function') {
                result.catch(function (err) {
                    try {
                        var isNotSupported = err && err.name === 'NotSupportedError'

                        // BUGFIX (2026-08-25 v2.3.25 → v2.3.26 → v2.3.27, three
                        // live retests, each one disproving the previous fix:
                        // v2.3.25 tried location.reload() to force the SPA to
                        // re-render and mint a fresh signed media URL — user
                        // retested, audio still silent, ZERO reload logs at all
                        // (sessionStorage threw inside the <webview> guest
                        // partition, swallowed by a shared catch). v2.3.26
                        // replaced sessionStorage with a timestamp stashed in
                        // location.hash via history.replaceState (survives
                        // location.reload() by definition, needs no storage
                        // permission) — user retested and reported the page
                        // "reloads continuously and it doesn't help", i.e. an
                        // actual infinite loop, WORSE than silence. Root cause:
                        // Yandex Messenger is itself a client-side-routed SPA
                        // that rewrites location.hash to its own route as part
                        // of ITS OWN startup, wiping our marker before the next
                        // rejection could read it back — and when the marker
                        // parse failed, the cooldown check's fallback
                        // (lastTs = 0) meant "Date.now() - 0 > 60000" was
                        // ALWAYS true, so the throttle silently degraded to
                        // "reload immediately, every single time" instead of
                        // failing safe. Any state stashed INSIDE the guest page
                        // is fragile against whatever that page's own JS does
                        // (proven twice now, two different mechanisms). Fix:
                        // stop deciding anything in-page. Just report the raw
                        // condition (shouldReload) up to the main process —
                        // startMediaDiagPolling() below owns the actual
                        // cooldown + hard attempt cap in a plain JS Map keyed
                        // by contents.id, which is main-process memory and is
                        // NOT touched by the guest page reloading, because it
                        // lives in a different OS process entirely. That also
                        // gives us a real, unconditional ceiling (2 reloads per
                        // 10-minute window) so even if this hypothesis is
                        // somehow still wrong, the failure mode is "gives up
                        // after 2 tries", never "reloads forever again".
                        window.__centrioPendingMediaErrors.push({
                            type: 'play-rejected',
                            src: String(el.currentSrc || el.src || ''),
                            code: null,
                            message: (err && (err.name || '')) + ': ' + (err && err.message ? String(err.message) : ''),
                            networkState: el.networkState,
                            readyState: el.readyState,
                            shouldReload: !!(isNotSupported && el.networkState === 3)
                        })
                        if (window.__centrioPendingMediaErrors.length > 20) {
                            window.__centrioPendingMediaErrors.splice(0, window.__centrioPendingMediaErrors.length - 20)
                        }
                    } catch (e) {
                        try {
                            window.__centrioPendingMediaErrors.push({
                                type: 'play-rejected-outer-error',
                                src: '',
                                code: null,
                                message: 'EXCEPTION in play-rejected handler: ' + String((e && e.message) || e),
                                networkState: -1,
                                readyState: -1
                            })
                        } catch (e2) {}
                    }
                })
            }
            return result
        }
    } catch (e) {}

    // BUGFIX (2026-08-25, live retest AFTER the play()-rejection hook above
    // shipped in 2.3.22: "аудио так и не воспроизводится", and — critically —
    // still ZERO [media-diag] log lines for it, unlike the freeze/WebAuthn
    // issues where at least the old behavior was confirmed unchanged): a
    // 100%-reproducible failure that produces neither an 'error'/'stalled'
    // event NOR a rejected play() promise most likely means there is no
    // HTMLMediaElement involved in the first place. Custom voice-message
    // players with a waveform visualization and scrub/speed control (which
    // is what Yandex Messenger's voice messages look like) are a classic
    // case for the Web Audio API (AudioContext + decodeAudioData +
    // AudioBufferSourceNode) instead of a plain <audio> tag — none of the
    // hooks above would ever fire for that, silently explaining the total
    // lack of log output. Instrumenting the two places that fail silently in
    // that API: decodeAudioData() rejecting (bad/blocked network response,
    // unsupported codec) and AudioContext.resume() rejecting (context stuck
    // 'suspended', e.g. an autoplay-policy gesture check that doesn't
    // recognize this embedded environment's click as a user gesture).
    try {
        var AC = window.AudioContext || window.webkitAudioContext
        if (AC && AC.prototype) {
            var origDecodeAudioData = AC.prototype.decodeAudioData
            if (origDecodeAudioData) {
                AC.prototype.decodeAudioData = function () {
                    var result = origDecodeAudioData.apply(this, arguments)
                    if (result && typeof result.catch === 'function') {
                        result.catch(function (err) {
                            try {
                                window.__centrioPendingMediaErrors.push({
                                    type: 'decodeAudioData-rejected',
                                    src: '',
                                    code: null,
                                    message: (err && (err.name || '')) + ': ' + (err && err.message ? String(err.message) : ''),
                                    networkState: null,
                                    readyState: null
                                })
                                if (window.__centrioPendingMediaErrors.length > 20) {
                                    window.__centrioPendingMediaErrors.splice(0, window.__centrioPendingMediaErrors.length - 20)
                                }
                            } catch (e) {}
                        })
                    }
                    return result
                }
            }
            var origResume = AC.prototype.resume
            if (origResume) {
                AC.prototype.resume = function () {
                    var ctx = this
                    var result = origResume.apply(ctx, arguments)
                    if (result && typeof result.catch === 'function') {
                        result.catch(function (err) {
                            try {
                                window.__centrioPendingMediaErrors.push({
                                    type: 'audiocontext-resume-rejected',
                                    src: '',
                                    code: null,
                                    message: (err && (err.name || '')) + ': ' + (err && err.message ? String(err.message) : ''),
                                    networkState: null,
                                    readyState: ctx.state
                                })
                                if (window.__centrioPendingMediaErrors.length > 20) {
                                    window.__centrioPendingMediaErrors.splice(0, window.__centrioPendingMediaErrors.length - 20)
                                }
                            } catch (e) {}
                        })
                    }
                    return result
                }
            }
        }
    } catch (e) {}

    return 'patched'
})()`

const MEDIA_DIAG_DRAIN_SCRIPT = `(function() {
    if (!window.__centrioPendingMediaErrors || !window.__centrioPendingMediaErrors.length) return []
    return window.__centrioPendingMediaErrors.splice(0, window.__centrioPendingMediaErrors.length)
})()`

const MEDIA_DIAG_POLL_MS = 3000

// BUGFIX (2026-08-27 v2.3.27, see the long comment above HTMLMediaElement.
// prototype.play in MEDIA_DIAG_PATCH_SCRIPT for the full history): the
// cooldown/attempt-cap state for the "reload the guest page to refresh an
// expired signed media URL" workaround now lives HERE, in main-process
// memory, instead of inside the guest page (sessionStorage → threw;
// location.hash → silently wiped by the SPA's own router). A WebContents'
// `.id` is stable across that same page reloading, so this Map survives
// exactly the event that kept destroying every previous persistence
// attempt. MEDIA_RELOAD_MAX_ATTEMPTS is a hard, unconditional ceiling: even
// if some other cause turns out to be re-triggering 'play-rejected' rapidly
// (e.g. an unrelated notification-sound element, not just the voice
// message), this guarantees "gives up after 2 tries" instead of "reloads
// forever" — which is what the user actually hit on v2.3.26.
const MEDIA_RELOAD_COOLDOWN_MS = 60000
const MEDIA_RELOAD_MAX_ATTEMPTS = 2
const MEDIA_RELOAD_ATTEMPT_WINDOW_MS = 600000
const mediaReloadState = new Map() // contents.id -> { lastTs, count }

// BUGFIX ("подвисания на 10-15 сек когда приходит сообщение в Яндекс-мессенджере"):
// три независимых опроса (unread/notif/media-diag) каждый ставят свой
// executeJavaScript() на фиксированном таймере, не дожидаясь, пока
// предыдущий вызов для ТОЙ ЖЕ гостевой страницы завершится. Тяжёлый ре-рендер
// Яндекса на входящее сообщение и так ненадолго блокирует JS-стек этой
// страницы — если за это время накопится очередь из нескольких неразрешённых
// executeJavaScript() (interval не ждёт предыдущий вызов), они все разом
// исполнятся при разблокировке, продлевая ощущаемое зависание. Пропускаем
// тик, если предыдущий запрос к этой же contents ещё не вернулся.
function startMediaDiagPolling(contents, getMainWindow) {
    const messengerId = findMessengerIdForSession(contents.session)
    let inFlight = false

    const poll = () => {
        if (contents.isDestroyed() || inFlight) return
        inFlight = true
        contents.executeJavaScript(MEDIA_DIAG_DRAIN_SCRIPT).then((items) => {
            if (!Array.isArray(items) || !items.length) return
            let reloadRequested = false
            items.forEach((item) => {
                log.warn(
                    `[media-diag] messenger=${messengerId || '?'} ${item.type} ` +
                    `src=${item.src} code=${item.code} message="${item.message}" ` +
                    `networkState=${item.networkState} readyState=${item.readyState}`
                )
                if (item && item.shouldReload) reloadRequested = true
            })

            if (!reloadRequested || contents.isDestroyed()) return

            const now = Date.now()
            const prev = mediaReloadState.get(contents.id) || { lastTs: 0, count: 0 }
            const withinAttemptWindow = (now - prev.lastTs) <= MEDIA_RELOAD_ATTEMPT_WINDOW_MS
            const count = withinAttemptWindow ? prev.count : 0

            if (count >= MEDIA_RELOAD_MAX_ATTEMPTS) {
                log.warn(`[media-diag] messenger=${messengerId || '?'} play-rejected-auto-reload-capped: ${MEDIA_RELOAD_MAX_ATTEMPTS} auto-reload attempts already used in this window, giving up (no more reloads for ~${Math.round(MEDIA_RELOAD_ATTEMPT_WINDOW_MS / 60000)} min)`)
                return
            }
            if ((now - prev.lastTs) <= MEDIA_RELOAD_COOLDOWN_MS) {
                log.warn(`[media-diag] messenger=${messengerId || '?'} play-rejected-auto-reload-throttled: cooldown active, ${MEDIA_RELOAD_COOLDOWN_MS - (now - prev.lastTs)}ms remaining`)
                return
            }

            mediaReloadState.set(contents.id, { lastTs: now, count: count + 1 })
            log.warn(`[media-diag] messenger=${messengerId || '?'} play-rejected-auto-reload: reloading guest page to refresh an expired signed media URL (attempt ${count + 1}/${MEDIA_RELOAD_MAX_ATTEMPTS})`)
            contents.reload()
        }).catch(() => {}).finally(() => { inFlight = false })
    }

    const timer = setInterval(poll, MEDIA_DIAG_POLL_MS)
    contents.once('destroyed', () => {
        clearInterval(timer)
        mediaReloadState.delete(contents.id)
    })
}

function startNotifPolling(contents, getMainWindow) {
    const messengerId = findMessengerIdForSession(contents.session)
    if (!messengerId) return
    let inFlight = false

    const poll = () => {
        if (contents.isDestroyed() || inFlight) return
        inFlight = true
        contents.executeJavaScript(NOTIF_DRAIN_SCRIPT).then((items) => {
            if (!Array.isArray(items) || !items.length) return
            const win = getMainWindow()
            if (!win || win.isDestroyed()) return
            items.forEach((payload) => {
                win.webContents.send('messenger-site-notification', messengerId, payload)
            })
        }).catch(() => {}).finally(() => { inFlight = false })
    }

    const timer = setInterval(poll, NOTIF_POLL_MS)
    contents.once('destroyed', () => clearInterval(timer))
}

function findMessengerIdForSession(targetSession) {
    try {
        const messengers = store.get('messengers', []) || []
        for (const m of messengers) {
            if (m && m.id && session.fromPartition(`persist:${m.id}`) === targetSession) return m.id
        }
    } catch {}
    return null
}

// Full messenger record (id + url), used by the media-diag hostname gate
// below — findMessengerIdForSession() only returns the id, not enough to
// check which service a webview belongs to.
function findMessengerRecordForSession(targetSession) {
    try {
        const messengers = store.get('messengers', []) || []
        for (const m of messengers) {
            if (m && m.id && session.fromPartition(`persist:${m.id}`) === targetSession) return m
        }
    } catch {}
    return null
}

// BUGFIX (2026-08-26, "другие мессенджеры периодически сами перезагружаются"
// — regression from the Yandex-only audio fix above): MEDIA_DIAG_PATCH_SCRIPT
// was being injected into EVERY messenger's webview, and startMediaDiagPolling()
// can call contents.reload() on ANY of them the moment a play() rejection
// looks like the Yandex NETWORK_NO_SOURCE signature (isNotSupported &&
// networkState === 3) — a shape that isn't unique to Yandex (e.g. a
// notification/preview sound blocked by an adblock rule in WhatsApp/
// Telegram/VK/MAX can throw the same NotSupportedError). The whole
// diagnostic+auto-reload mechanism was only ever meant for Yandex Messenger's
// voice-message bug — scope it to that messenger's own hostnames so no other
// messenger's webview gets patched or can be silently reloaded by it.
// CODE REVIEW FIX (2026-08-26): the first version of this check matched any
// `*.yandex.<tld>` hostname, which also caught the catalog's two OTHER Yandex
// products (renderer/constants.js) — Yandex Mail (mail.yandex.ru) and Alice
// (alice.yandex.ru) — silently re-opening the exact bug this gate exists to
// close, since Alice in particular is audio-heavy and could retrigger the
// "tab reloads itself" symptom for a messenger the fix wasn't even about.
// Я.Мессенджер's actual catalog entry is exactly https://yandex.ru/chat —
// requiring the BARE host `yandex.ru` (no subdomain wildcard) plus a `/chat`
// path excludes both of those unrelated products.
function isYandexMessengerUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false
    try {
        const u = new URL(urlStr)
        const host = u.hostname.toLowerCase()
        if (host === 'yandex.ru') return u.pathname.startsWith('/chat')
        // Not currently used by the catalog, kept for a future redirect/URL
        // change without reintroducing a broad *.yandex.<tld> match.
        return host === 'ya.ru' || host === 'messenger.yandex.ru' || host === 'messenger.yandex.net' || host === 'messenger.yandex.com'
    } catch {
        return false
    }
}

function startUnreadPolling(contents, getMainWindow) {
    const messengerId = findMessengerIdForSession(contents.session)
    if (!messengerId) return

    let lastSent = -1
    let inFlight = false
    const sendIfChanged = (count) => {
        const n = Number.isFinite(count) && count >= 0 ? count : 0
        if (n === lastSent) return
        lastSent = n
        const win = getMainWindow()
        if (win && !win.isDestroyed()) win.webContents.send('messenger-unread-count', messengerId, n)
    }
    const poll = () => {
        if (contents.isDestroyed() || inFlight) return
        inFlight = true
        contents.executeJavaScript(UNREAD_DETECT_SCRIPT).then(sendIfChanged).catch(() => {}).finally(() => { inFlight = false })
    }

    poll()
    const timer = setInterval(poll, UNREAD_POLL_MS)
    contents.once('destroyed', () => clearInterval(timer))
}

// ── Детект "играет ли сейчас медиа" (мини-плеер в правом сайдбаре) ─────────
// BUGFIX (2026-08-28, "когда играет Яндекс музыка - он не определяет, что
// музыка играет"): изначально детект жил в webview-preload.js
// (bindMediaPlaybackDetection, capture-фаза play/pause/ended на document,
// sendToHost('media-state', ...)) — тот же самый мёртвый канал, что и у
// непрочитанных/site-уведомлений выше (см. комментарий над UNREAD_DETECT_SCRIPT):
// preload-атрибут <webview> на этой версии Electron (39.x) не исполняется в
// гостевой странице вообще, ни для одного мессенджера. То есть индикатор не
// появлялся не только для Яндекс Музыки — он был нерабочим в принципе для
// ВСЕХ мессенджеров, репорт про Яндекс Музыку просто оказался первым живым
// тестом. Чинится тем же подтверждённо рабочим каналом: contents.executeJavaScript()
// на интервале, без event-листенеров и патчинга — состояние play/pause у
// HTMLMediaElement всегда синхронно читаемо через el.paused/el.ended, так что
// патч+очередь (как у site-notification) не нужны, достаточно "детект"-скрипта
// в духе UNREAD_DETECT_SCRIPT, вычисляющего текущее состояние заново на каждый
// опрос.
// BUGFIX (2026-08-28 v2, live retest: "Инстаграм запускает медиа, а вот
// Яндекс Музыка нет. И нет кнопок управления"): the plain <audio>/<video>
// element scan below is exactly right for Instagram (a normal HTML5
// <video>), but Yandex Music — like Yandex Messenger's voice messages, see
// the long history in MEDIA_DIAG_PATCH_SCRIPT above — is the classic case
// for the Web Audio API (AudioContext + decodeAudioData +
// AudioBufferSourceNode) instead of a plain <audio> tag, specifically so it
// can crossfade/gapless-transition between tracks. No HTMLMediaElement is
// ever "playing" in that architecture, so the element scan alone can never
// see it. Apps built this way still need OS media-key integration (Windows
// SMTC play/pause/next/prev), which is only possible through the
// MediaSession API — they set `navigator.mediaSession.playbackState`
// explicitly and register `setActionHandler('play'|'pause'|'previoustrack'|
// 'nexttrack', fn)`. That's an equally authoritative, playback-mechanism-
// agnostic signal, and it also happens to be exactly what next/prev buttons
// need: capturing the registered handlers (via MEDIA_CONTROL_PATCH_SCRIPT
// below) is the only way to invoke "next track" from outside the page at
// all, since the MediaSession API has no public "trigger" method — the
// browser only lets you register a handler, never call someone else's.
const MEDIA_CONTROL_PATCH_SCRIPT = `(function() {
    if (window.__centrioMediaControlPatched) return 'already-patched'
    window.__centrioMediaControlPatched = true
    window.__centrioMediaActions = window.__centrioMediaActions || {}
    try {
        if (navigator.mediaSession && navigator.mediaSession.setActionHandler) {
            var origSetActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession)
            navigator.mediaSession.setActionHandler = function (action, handler) {
                window.__centrioMediaActions[action] = handler
                return origSetActionHandler(action, handler)
            }
        }
    } catch (e) {}
    return 'patched'
})()`

const MEDIA_STATE_DETECT_SCRIPT = `(function() {
    var playing = false
    var els = document.querySelectorAll('video, audio')
    for (var i = 0; i < els.length; i++) {
        if (!els[i].paused && !els[i].ended) { playing = true; break }
    }
    if (!playing) {
        try {
            if (navigator.mediaSession && navigator.mediaSession.playbackState === 'playing') playing = true
        } catch (e) {}
    }
    var title = ''
    var hasNext = false
    var hasPrev = false
    if (playing) {
        try {
            var meta = navigator.mediaSession && navigator.mediaSession.metadata
            if (meta && meta.title) title = String(meta.title)
        } catch (e) {}
        if (!title) title = document.title || ''
        try {
            var actions = window.__centrioMediaActions || {}
            hasNext = typeof actions.nexttrack === 'function'
            hasPrev = typeof actions.previoustrack === 'function'
        } catch (e) {}
    }
    return { playing: playing, title: title, hasNext: hasNext, hasPrev: hasPrev }
})()`

const MEDIA_STATE_POLL_MS = 2000

function startMediaStatePolling(contents, getMainWindow) {
    const messengerId = findMessengerIdForSession(contents.session)
    if (!messengerId) return

    let inFlight = false
    let lastPlaying = false
    let lastTitle = ''
    let lastHasNext = false
    let lastHasPrev = false

    const poll = () => {
        if (contents.isDestroyed() || inFlight) return
        inFlight = true
        contents.executeJavaScript(MEDIA_STATE_DETECT_SCRIPT).then((result) => {
            if (!result || typeof result !== 'object') return
            const playing = !!result.playing
            const title = typeof result.title === 'string' ? result.title : ''
            const hasNext = !!result.hasNext
            const hasPrev = !!result.hasPrev
            if (playing === lastPlaying && title === lastTitle && hasNext === lastHasNext && hasPrev === lastHasPrev) return
            lastPlaying = playing
            lastTitle = title
            lastHasNext = hasNext
            lastHasPrev = hasPrev
            const win = getMainWindow()
            if (!win || win.isDestroyed()) return
            win.webContents.send('media-state', messengerId, { playing, title, hasNext, hasPrev })
        }).catch(() => {}).finally(() => { inFlight = false })
    }

    poll()
    const timer = setInterval(poll, MEDIA_STATE_POLL_MS)
    // Вкладку закрыли/перезагрузили с играющим медиа — явно шлём "не играет",
    // иначе мини-плеер молча "зависнет" на последнем известном состоянии
    // (иконка в сайдбаре останется видимой для уже не существующей вкладки).
    contents.once('destroyed', () => {
        clearInterval(timer)
        if (!lastPlaying) return
        const win = getMainWindow()
        if (win && !win.isDestroyed()) win.webContents.send('media-state', messengerId, { playing: false, title: '', hasNext: false, hasPrev: false })
    })
}

// BUGFIX ("настройка звука уведомлений (и в целом любая настройка) не
// сохраняется — откатывается после перезапуска"): renderer's auto-cloud-sync
// (notifySyncedStoreWrite() in renderer.js) debounces the push by 1500ms so a
// burst of writes doesn't spam the network. If the app quits inside that
// window, scheduleAutoCloudSync() never even fires — main's pendingSyncPush
// (see waitForPendingSyncPush() below) stays empty, so before-quit has
// nothing to wait for. Local disk is correct, the cloud copy is stale, and
// the very next launch's cloudSyncPull() silently overwrites local with that
// stale value. Ask the renderer to flush its debounced push immediately and
// wait for its ack (bounded) before proceeding — this closes the race at the
// source instead of only covering pushes that already started.
function flushRendererCloudSync(getMainWindow) {
    return new Promise((resolve) => {
        const win = getMainWindow?.()
        if (!win || win.isDestroyed()) {
            resolve()
            return
        }

        const ACK_TIMEOUT_MS = 5000
        let settled = false

        const finish = () => {
            if (settled) return
            settled = true
            ipcMain.removeListener('app-quitting-flushed', finish)
            resolve()
        }

        ipcMain.once('app-quitting-flushed', finish)
        setTimeout(finish, ACK_TIMEOUT_MS)

        try {
            win.webContents.send('app-quitting')
        } catch {
            finish()
        }
    })
}

function registerAppEvents({
    app,
    getMainWindow,
    showMainWindow,
    createWindow,
    unregisterShortcuts,
    handleProtocolUrl,
    isQuittingRef
}) {
    app.on('browser-window-created', (_e, win) => {
        win.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // DEBUG (2026-08-24, "Яндекс сам открывает браузер" —
                // shell.openExternal() был молчаливым во всём кодбейзе на
                // успехе, так что этот конкретный отчёт пользователя
                // (авторизация в попапе проходит, но потом ещё и открывается
                // внешний браузер) нельзя было привязать к конкретной точке
                // вызова без нового живого лога. Этот handler ловит ЛЮБОЙ
                // window.open() из ЛЮБОГО BrowserWindow (включая сам
                // OAuth-попап) на http(s)-URL, который не был явно
                // распознан выше как OAuth-попап — кандидат №1.
                log.info(`[oauth-broker][DEBUG] browser-window-created setWindowOpenHandler → shell.openExternal url=${url} fromWindowTitle=${(() => { try { return win.getTitle() } catch { return '?' } })()}`)
                shell.openExternal(url).catch(() => {})
            }
            return { action: 'deny' }
        })

        // BUGFIX ("при скачивании открывает окно пустое белое" — live-
        // reproduced for a MAX file attachment: the popup opened by
        // webview-tabs-bind.js's 'new-window' handler → open-popup-window
        // already has its own hide()+close-on-done fix in
        // main/ipc/window.js, but that only covers popups THIS app
        // deliberately creates. When a <webview> guest calls
        // window.open()/target=_blank for what turns out to be a direct
        // file-download link and nothing intercepts it first (the guest's
        // own webContents has no setWindowOpenHandler — only top-level
        // BrowserWindows get one, right above), Electron falls back to
        // silently auto-creating a brand new, completely blank
        // BrowserWindow and navigating it straight to the download URL.
        // That window has nothing to render (the response is a file, not
        // HTML) and nothing else in the app ever closes it, so it's left
        // sitting there indefinitely — stuck behind the native Save-As
        // dialog Electron shows whenever no save path was set. This
        // listener is a safety net that catches EVERY new BrowserWindow
        // in the app, whichever path created it, and applies the exact
        // same hide()-now/close()-on-'done' pattern already proven for the
        // explicit open-popup-window flow: hide() is synchronous and wins
        // the race against the native dialog (Windows won't let a window
        // close while it still owns an open modal); close() only runs
        // once the download item's 'done' event fires, well after any
        // save dialog has resolved. Scoped to downloadWebContents ===
        // win.webContents so it can't react to unrelated downloads
        // elsewhere in a shared persist:<messengerId> session, and the
        // listener is removed on 'closed' so it can't leak onto the
        // session for the rest of the app's lifetime.
        const onSessionDownload = (_event, item, downloadWebContents) => {
            if (downloadWebContents !== win.webContents) return
            if (!win.isDestroyed()) win.hide()
            if (item) {
                item.once('done', () => {
                    if (!win.isDestroyed()) win.close()
                })
            } else if (!win.isDestroyed()) {
                win.close()
            }
        }
        try {
            const winSession = win.webContents.session
            winSession.on('will-download', onSessionDownload)
            win.once('closed', () => {
                try { winSession.removeListener('will-download', onSessionDownload) } catch {}
            })
        } catch {}
    })

    // SECURITY: validate every <webview> attachment before Electron creates the
    // guest process. Without this, a compromised/exploited main-window renderer
    // (XSS, supply-chain bug in a bundled dep, etc.) could attach a webview with
    // attacker-controlled webPreferences (e.g. nodeIntegration:true or a
    // malicious preload script) or point it at an arbitrary session partition
    // (e.g. another messenger's persisted cookies), since the renderer builds
    // <webview> elements itself via DOM APIs (renderer/messengers.js,
    // renderer/webview-tabs-bind.js) and the host process otherwise trusts
    // whatever attributes it declared. This is the standard Electron mitigation
    // (see Electron security checklist §12, "verify webview options before
    // creation") and was previously missing entirely. Every legitimate webview
    // in this app uses partition `persist:<messenger.id>` for a messenger that
    // actually exists in the store and the app's own webview-preload.js — both
    // are cheap to check here and let us fail closed (deny attachment) on any
    // mismatch instead of guessing.
    app.on('web-contents-created', (_e, contents) => {
        // Каждый мессенджер живёт в своей персистентной сессии
        // (persist:<messenger.id>), поэтому 'will-download' нужно подключать
        // отдельно к сессии каждого webview — сессия главного окна не видит
        // загрузки, инициированные внутри мессенджеров (файлы из чатов и т.д.)
        if (contents.getType() === 'webview') {
            // BUGFIX ("фоновые вкладки не обновляются без клика" — messages/
            // badges only refresh once the user actually clicks back into a
            // tab): win.webContents.setBackgroundThrottling(false) was only
            // ever applied to the main window's own webContents
            // (main/window.js) — every messenger <webview> guest, which stays
            // mounted (display:none) rather than destroyed when its tab isn't
            // active (renderer/messengers.js), never got the same treatment.
            // Chromium throttles a backgrounded guest's timers/JS/sockets by
            // default, so its DOM (and whatever it renders for unread counts,
            // incoming messages, etc.) goes stale even though our own 3-5s
            // main-process polling (startUnreadPolling/startNotifPolling
            // above) keeps firing on schedule — the poll just reads a frozen
            // page. Disabling it here, once per webview contents, keeps every
            // background tab's own JS actually running like the foreground one.
            try { contents.setBackgroundThrottling(false) } catch {}

            // BUGFIX (2026-08-26, Gmail-in-webview-tab Google rejection): the
            // webview's own base `useragent` attribute
            // (renderer/webview-tabs-bind.js) explicitly claims Chrome for
            // every messenger — the exact combination live A/B testing
            // (scripts/ua-matrix.js, run against the user's real Gmail
            // session) found Google rejects on its own accounts.* pages. See
            // the BUGFIX comment above isGoogleAccountsUrl() in
            // main/ipc/window.js for the evidence. That attribute is still
            // wanted for every OTHER page (fixes a real, separate stale-UA-
            // vs-Client-Hints mismatch, e.g. Yandex Alice), so instead of
            // removing it, reset the UA to the session's untouched default
            // only while on an accounts.google.* host, and restore the
            // webview's normal UA the moment it navigates away.
            // BUGFIX (2026-08-26, segfault during live testing: process crashed
            // with a native "Segmentation fault" right after
            // openOAuthBroker() fired for this same webview's own
            // ServiceLogin navigation): this used to call
            // contents.setUserAgent() synchronously from inside 'will-navigate'
            // — the exact same event the OAuth-broker handler further below
            // also listens on to event.preventDefault() + (deferred, but
            // still same tick) construct a popup for the SAME navigating
            // guest. The BUGFIX comment above openOAuthBroker() already
            // documents that Electron holds the guest's cross-process
            // navigation swap open, synchronously, for the whole duration of
            // 'will-navigate' handling — mutating that same guest's UA
            // in-flight, from a second independent listener on the same
            // event, is exactly the kind of same-tick collision that comment
            // warns about (there it caused a hang; here, on this Gmail path,
            // it segfaulted instead — same race, different native failure
            // mode). Deferring the actual setUserAgent() call to setImmediate
            // moves it off this synchronous event-handling stack entirely,
            // same fix shape as openOAuthBroker()'s own popup construction.
            let normalWebviewUserAgent = null
            const syncGoogleAccountsUa = (url) => {
                let shouldUseSessionUa
                try {
                    shouldUseSessionUa = isGoogleAccountsUrl(url)
                } catch {
                    return
                }
                setImmediate(() => {
                    try {
                        if (contents.isDestroyed()) return
                        if (shouldUseSessionUa) {
                            if (normalWebviewUserAgent === null) normalWebviewUserAgent = contents.getUserAgent()
                            contents.setUserAgent(contents.session.getUserAgent())
                        } else if (normalWebviewUserAgent !== null) {
                            contents.setUserAgent(normalWebviewUserAgent)
                        }
                    } catch {}
                })
            }
            contents.on('will-navigate', (_event, url) => syncGoogleAccountsUa(url))
            contents.on('did-redirect-navigation', (_event, url) => syncGoogleAccountsUa(url))

            try { wireSessionDownloads(contents.session, getMainWindow) } catch (err) {
                log.error('[downloads] failed to wire webview session:', err.message)
            }

            // CDP-мост для Service Worker realm (см. main/services/swNotifPatcher.js)
            // — покрывает push-уведомления, которые мессенджер показывает изнутри
            // своего SW (self.registration.showNotification), а не со страницы.
            // Прикрепляем один раз на весь contents (не на dom-ready): CDP-таргет
            // webview переживает внутренние навигации, Target.setAutoAttach сам
            // подхватывает новые service_worker-таргеты по мере их появления.
            try {
                const messengerId = findMessengerIdForSession(contents.session)
                attachServiceWorkerNotifBridge(contents, messengerId, getMainWindow)
            } catch (err) {
                log.error('[sw-notif] failed to attach bridge:', err.message)
            }

            // Непрочитанные сообщения — детект через executeJavaScript on
            // dom-ready (см. startUnreadPolling выше), не через preload:
            // preload-атрибут <webview> подтверждённо не исполняется на этой
            // версии Electron (диагностика: ни console.log, ни созданный им
            // DOM-узел ни разу не появились на гостевой странице, хотя
            // will-attach-webview ниже репортит верный путь к файлу),
            // executeJavaScript — подтверждённо рабочая альтернатива. dom-ready
            // может сработать повторно при перезагрузке страницы — не
            // запускаем второй параллельный интервал поверх уже идущего.
            // Computed once per webview contents (a messenger's persisted
            // partition/url doesn't change over its lifetime) — see BUGFIX
            // above isYandexMessengerUrl() for why this gates the media-diag
            // patch+polling below to Yandex Messenger only.
            const messengerRecordForMediaDiag = findMessengerRecordForSession(contents.session)
            const isYandexMessengerWebview = !!(messengerRecordForMediaDiag && isYandexMessengerUrl(messengerRecordForMediaDiag.url))

            let unreadPollingStarted = false
            let notifPollingStarted = false
            let mediaDiagPollingStarted = false
            let mediaStatePollingStarted = false
            contents.on('dom-ready', () => {
                if (!unreadPollingStarted) {
                    unreadPollingStarted = true
                    startUnreadPolling(contents, getMainWindow)
                }

                // Мини-плеер в правом сайдбаре ("играет ли сейчас медиа" +
                // кнопки вперёд/назад). Патч перехвата mediaSession
                // setActionHandler нужно ставить заново на КАЖДЫЙ dom-ready
                // (та же причина, что и у NOTIF_PATCH_SCRIPT выше — навигация
                // внутри <webview> создаёт новый document/window) — сам
                // скрипт идемпотентен внутри одной страницы
                // (window.__centrioMediaControlPatched). Опрос состояния
                // запускаем один раз на contents.
                contents.executeJavaScript(MEDIA_CONTROL_PATCH_SCRIPT).catch(() => {})

                if (!mediaStatePollingStarted) {
                    mediaStatePollingStarted = true
                    startMediaStatePolling(contents, getMainWindow)
                }

                // Патч window.Notification/SW showNotification нужно ставить
                // заново на КАЖДЫЙ dom-ready (не один раз за весь contents) —
                // навигация внутри <webview> создаёт новый document/window, и
                // прошлый патч исчезает вместе с ним. Сам скрипт идемпотентен
                // внутри одной страницы (флаг window.__centrioNotifPatched).
                contents.executeJavaScript(NOTIF_PATCH_SCRIPT).catch(() => {})

                if (!notifPollingStarted) {
                    notifPollingStarted = true
                    startNotifPolling(contents, getMainWindow)
                }

                // Диагностика бага "аудиосообщения иногда не воспроизводятся"
                // (изначально Яндекс Мессенджер) — см. комментарий над
                // MEDIA_DIAG_PATCH_SCRIPT. Тот же паттерн, что и NOTIF_PATCH_SCRIPT
                // выше: патч ставим на каждый dom-ready (новый document/window
                // при внутренней навигации), опрос очереди — один раз на contents.
                // Scoped to Yandex Messenger only (see isYandexMessengerWebview
                // above) — this mechanism can call contents.reload() on its own,
                // which used to be able to fire for any messenger.
                if (isYandexMessengerWebview) {
                    contents.executeJavaScript(MEDIA_DIAG_PATCH_SCRIPT).catch(() => {})

                    if (!mediaDiagPollingStarted) {
                        mediaDiagPollingStarted = true
                        startMediaDiagPolling(contents, getMainWindow)
                    }
                }
            })

            // BUGFIX ("ссылки открываются в новом окне Centrio, обычно
            // открывались в браузере"): a <webview> guest's own webContents
            // never got a setWindowOpenHandler — only top-level
            // BrowserWindows do (see 'browser-window-created' above). The
            // <webview> tag's DOM 'new-window' event (still wired in
            // renderer/messengers.js and renderer/webview-tabs-bind.js for
            // backwards compatibility) no longer fires on this Electron
            // version — setWindowOpenHandler on the guest's own webContents
            // is the only mechanism Chromium still calls. Without it, EVERY
            // window.open()/target=_blank click from inside a messenger
            // (a shared link, "open in new tab", etc.) fell through to
            // Electron's default behavior: silently auto-creating a real,
            // fully-rendering BrowserWindow right inside Centrio instead of
            // handing off to the OS default browser like a normal desktop
            // app.
            //
            // We can't just deny() outright here: some of these
            // window.open() calls are actually file downloads in disguise
            // (see the 'browser-window-created' BUGFIX above, live-
            // reproduced for a MAX attachment) — denying would suppress the
            // network request before it ever fires 'will-download', silently
            // breaking those downloads. So: allow the window to be created
            // (so a real download can still start and get picked up by the
            // existing will-download safety net below), but hide it
            // immediately and, unless it turns out to be a download, hand
            // the URL to the OS default browser and close it as soon as it
            // tries to actually navigate/render — mirroring the existing
            // hide-now/close-later pattern already proven for downloads,
            // just triggered by "this became a real page" instead of "this
            // became a download".
            //
            // BUGFIX ("Google/Yandex sign-in внутри мессенджера виснет и
            // показывает 'Не удалось войти в аккаунт' прямо в Centrio"):
            // main/ipc/window.js уже содержит полноценный OAuth-брокер
            // (createPopupWindow → isOAuthBroker: спуфинг UA обычного
            // desktop Chrome, ретрай при неудачной загрузке, детект
            // Google-страницы отказа по содержимому, отслеживание
            // did-navigate-in-page) — но единственный код-путь, которым он
            // реально вызывался (webview.addEventListener('new-window', ...)
            // в renderer/webview-tabs-bind.js → IPC 'open-popup-window'),
            // мёртв: DOM-событие 'new-window' на этой версии Electron не
            // исполняется вообще (см. комментарий выше). Реально Chromium
            // зовёт ТОЛЬКО этот setWindowOpenHandler на гостевом webContents
            // — а он раньше безусловно возвращал {action:'allow'} и отдавал
            // окно ниже, в наивный once('did-navigate')-хендлер без спуфинга
            // UA и без обработки in-page навигации, из-за чего Google видел
            // в UA буквально "Electron/..." и рендерил отказ ВНУТРИ этого
            // окна, а once('did-navigate') либо уже сработал на раннем
            // about:blank, либо просто не ловил дальнейший client-side
            // рендер отказа (did-navigate-in-page) — окно так и оставалось
            // висеть открытым у пользователя.
            //
            // Чиним, оставляя старое поведение (allow + hide/redirect ниже)
            // для ВСЕХ остальных window.open() (звонки, "открыть в новой
            // вкладке", share-диалоги) — трогаем только явно распознанные
            // OAuth-провайдеры, и для них полностью отдаём управление уже
            // проверенному createPopupWindow() вместо создания окна по
            // умолчанию.
            //
            // Общий для нескольких хендлеров ниже ('will-frame-navigate' и
            // 'will-redirect') список служебных путей Google, которые
            // формально совпадают с isOAuthProviderUrl() по хосту, но
            // никогда не являются настоящим экраном входа — см. BUGFIX-
            // комментарий у 'will-frame-navigate' ниже для полной истории.
            //
            // BUGFIX (2026-08-26, live-reproduced, Gmail webview tab: "окно
            // закрылось раньше, чем прошло подтверждение на телефоне"):
            // '/restart' добавлен отдельно от остальных трёх. Живой лог
            // (messengerId=1787737455269) показал точную цепочку: сначала
            // ServiceLogin/v3-signin-identifier ушли в брокер нормально, но
            // 145мс-2мин спустя тот же гостевой webContents САМ (не попап)
            // получил ещё одну навигацию на
            // accounts.google.com/restart?...&dsh=...&flowEntry=ServiceLogin
            // — одноразовый continuation-хоп с state-токеном (dsh), уже
            // привязанным к конкретному браузинг-контексту, где реально
            // прошёл вход. openOAuthBroker() отреагировал на неё как на
            // новый вход и открыл ВТОРОЕ, не связанное с тем контекстом
            // popup-окно (та же партиция, но чистый top-level load) — тот
            // сразу получил loadURL failed: ERR_FAILED (-2) на этом же
            // /restart URL (одноразовый токен не переживает загрузку в
            // независимом окне), и 9мс спустя maybeFinishOAuth() увидел
            // случайный докат на workspace.google.com и закрыл попап,
            // приняв обрыв за успешное завершение — реальный вход (для
            // которого пользователю ещё требовалось подтверждение на
            // телефоне) в этом окне так и не отрендерился. '/restart' —
            // всегда continuation-хоп, а не экран входа (аналогично
            // остальным трём путям в этом списке), поэтому его нужно
            // пропускать не через брокер, а обычной навигацией того
            // webContents, где он и возник — тот же, уже проверенный,
            // отказ от UA-спуфинга должен пропустить и его.
            const GOOGLE_INTERNAL_PATH_PREFIXES = ['/_/', '/RotateCookiesPage', '/ListAccounts', '/CheckCookie', '/restart']
            const isGoogleInternalPath = (url) => {
                try {
                    const path = new URL(url).pathname
                    return GOOGLE_INTERNAL_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
                } catch {
                    return false
                }
            }

            // BUGFIX (2026-08-24, "Яндекс.Почта — лишний второй попап"):
            // живой лог показал, что после успешного входа в Яндекс через
            // первый (легитимный) попап на passport.yandex.ru main-процесс
            // ~2 секунды спустя открывал ВТОРОЙ попап на
            // sso.passport.yandex.ru/prepare — и тут же закрывал его через
            // maybeFinishOAuth (0.2с спустя), т.к. тот успевал уйти на
            // sso.ya.ru/sync. sso.passport.yandex.ru — это тот же класс
            // внутренней cross-domain cookie-sync служебной страницы, что и
            // Google-эндпоинты выше (bscframe/RotateCookiesPage) — она
            // ПОДСТРОЧНО матчит OAUTH_PROVIDER_HOST_RE (regex завязан на
            // суффикс "passport.yandex.ru", а не на конкретный хост), но
            // никогда не является настоящим экраном входа. В отличие от
            // Google-случая отличать её нужно по ХОСТУ, а не по пути — сам
            // путь /prepare не уникален для служебных страниц.
            //
            // BUGFIX (2026-08-25): список (включая добавленный
            // cookier.360.yandex.ru) вынесен в shared/oauthProviders.js и
            // импортирован в начале файла — main/ipc/window.js's
            // maybeFinishOAuth() теперь читает тот же список, чтобы не
            // закрывать OAuth-попап преждевременно на этих же хостах (см.
            // BUGFIX-комментарий в shared/oauthProviders.js для полной
            // истории "зависает после входа в Яндекс").

            // BUGFIX (2026-08-26, «зависает намертво ровно в момент открытия
            // окна Google, при этом в диспетчере задач приложение
            // «Отвечает»»): openOAuthBroker() вызывается из обработчиков
            // навигации ГОСТЯ (will-navigate / will-redirect /
            // will-frame-navigate). Эти события Electron эмитит СИНХРОННО и
            // держит навигацию гостя, пока обработчик не вернёт управление:
            // рендерер гостя в это время заблокирован в ожидании вердикта.
            // createPopupWindow() — async-функция, но её тело до первого
            // await исполняется синхронно, а `new BrowserWindow(...)` там
            // как раз до него — то есть целое окно со своей сессией
            // конструировалось прямо внутри этого удержания. Создание окна
            // на Windows прокачивает вложенный нативный цикл сообщений
            // (поэтому Windows и считает приложение «Отвечающим»), и он
            // пересекается с незавершённым межпроцессным переходом гостя —
            // рендерер главного окна встаёт намертво в нативном коде, тогда
            // как main-процесс и остальные вкладки живы (ровно то, что
            // показала прежняя CDP-диагностика).
            //
            // Лечится не отменой перехвата, а тем, что решение принимается
            // синхронно (возвращаем true → вызывающий сразу отменяет
            // навигацию и разблокирует гостя), а само окно строится уже
            // ПОСЛЕ выхода из обработчика. Franz по той же причине никогда
            // не строит BrowserWindow вручную внутри навигационных событий,
            // а отдаёт создание Electron'у через setWindowOpenHandler.
            //
            // brokerDeferredIds закрывает окно между «решили открыть» и
            // «реально открыли»: до setImmediate() guard в
            // createPopupWindow() ещё не взведён, и второе навигационное
            // событие успело бы запросить второй попап.
            const brokerDeferredIds = new Set()

            const openOAuthBroker = (url) => {
                const messengerId = findMessengerIdForSession(contents.session)
                log.info(`[oauth-broker][DEBUG] openOAuthBroker url=${url} messengerId=${messengerId} guardHas=${isOAuthBrokerActive(messengerId)}`)
                if (!messengerId) return false

                // See BUGFIX comment on the shared guard import above —
                // swallow (still counts as "handled" so the caller cancels
                // the guest navigation) rather than opening a second popup
                // while one is already open for this messenger. This is
                // just a fast-path short-circuit: createPopupWindow() below
                // enforces the authoritative version of this same check
                // (and marks/clears the guard itself) right before actually
                // constructing a BrowserWindow — do NOT mark the guard here
                // too, or createPopupWindow() would immediately see it as
                // already held and swallow its own popup as a false-positive
                // duplicate.
                if (isOAuthBrokerActive(messengerId) || brokerDeferredIds.has(messengerId)) return true

                const messengers = store.get('messengers', []) || []
                const messenger = messengers.find((m) => m && m.id === messengerId)

                // BUGFIX (2026-08-26, live-reproduced: Gmail tab never opens
                // the broker at all — [oauth-broker][DEBUG] logs showed
                // openOAuthBroker() called ~350-450ms apart, ~67 times in a
                // row, for the exact same ServiceLogin URL, and
                // `contents.getURL()` was empty on every single call. Root
                // cause: for a messenger whose OWN configured url (e.g.
                // mail.google.com) immediately redirects to Google's login
                // before the guest webview ever commits a first page,
                // `contents.getURL()` genuinely has nothing to report yet —
                // this used to read as "no return host, bail out" below,
                // which meant this code path NEVER opened the broker popup
                // for such a messenger at all. The guest webview was left to
                // load Google's ServiceLogin directly inside the embedded
                // <webview>, which Google's own embedded-browser detection
                // keeps rejecting/redirecting — that bounce IS the repeating
                // ServiceLogin navigation the user saw, not a bug in the
                // retry/backoff logic (which was correctly ruled out earlier
                // by timing). Falling back to the messenger's own configured
                // url when nothing has committed yet fixes this the same way
                // `returnHost` already gets used elsewhere: it only needs to
                // be A hostname to open the broker with, not the exact
                // currently-loaded one.
                let returnHost = ''
                try { returnHost = new URL(contents.getURL()).hostname } catch {}
                if (!returnHost && messenger?.url) {
                    try { returnHost = new URL(messenger.url).hostname } catch {}
                }
                if (!returnHost) return false

                brokerDeferredIds.add(messengerId)
                setImmediate(() => {
                    brokerDeferredIds.delete(messengerId)
                    log.info(`[oauth-broker][DEBUG] deferred popup creation running for messengerId=${messengerId}`)
                    createPopupWindow(url, {
                        width: 500,
                        height: 650,
                        name: messenger?.name || 'Centrio',
                        partition: `persist:${messengerId}`,
                        returnHost
                    }, getMainWindow).catch((err) => {
                        log.error('[oauth-broker] createPopupWindow failed:', err?.message)
                    })
                })
                return true
            }

            // BUGFIX (window.opener OAuth handshake — гипотеза, проверяется):
            // настоящий window.open() (в отличие от will-navigate/
            // will-frame-navigate ниже — там нет ни window.open(), ни
            // естественного opener'а вовсе) до сих пор шёл через
            // openOAuthBroker() → createPopupWindow(), который ОТКАЗЫВАЕТ
            // Electron'у в создании его собственного попапа и строит
            // отдельный, несвязанный `new BrowserWindow()` сам. У такого
            // попапа window.opener === null — а именно на него полагается
            // Google Identity Services (и не только), чтобы
            // window.opener.postMessage(...) вернул токен обратно на
            // страницу, которая открыла попап. Тот же паттерн у Franz —
            // setupExternalLinkHandler/nativePopupOptions в его собственном
            // main-процессе — возвращает `{action:'allow',
            // overrideBrowserWindowOptions}` вместо ручного BrowserWindow,
            // именно чтобы эта связь не рвалась. Здесь — то же самое: даём
            // Electron создать попап нативно (тем самым сохраняя
            // window.opener), а всю остальную обвязку (спуфинг UA, детект
            // завершения флоу, ретрай, детект отказа Google) навешиваем на
            // уже созданное окно через did-create-window ниже — см.
            // wireOAuthPopup() в main/ipc/window.js.
            const oauthPendingMessengerIds = new Set()
            contents.setWindowOpenHandler(({ url }) => {
                if (!isOAuthProviderUrl(url)) return { action: 'allow' }

                // DEBUG (Grok "2 окна" investigation): openOAuthBroker() already
                // logs its own entry — this handler didn't log at all, so a live
                // repro couldn't tell whether a second REAL window.open() call
                // was racing the will-frame-navigate path below for the same
                // messenger, or whether the second "window" the user sees is a
                // non-navigation surface (FedCM/WebAuthn chrome-level UI — see
                // DISABLED_CHROMIUM_FEATURES in main.js) that never reaches this
                // handler in the first place.
                const messengerId = findMessengerIdForSession(contents.session)
                log.info(`[oauth-broker][DEBUG] setWindowOpenHandler url=${url} messengerId=${messengerId} guardHas=${isOAuthBrokerActive(messengerId)}`)
                if (!messengerId) return { action: 'allow' }

                // See BUGFIX comment on the shared guard import above —
                // swallow instead of opening a second popup while one is
                // already open for this messenger (via this native path, the
                // openOAuthBroker()/will-frame-navigate path below, OR the
                // renderer's will-navigate → createPopupWindow() path — all
                // three now read/write this same shared guard).
                if (isOAuthBrokerActive(messengerId)) {
                    return { action: 'deny' }
                }

                let returnHost = ''
                try { returnHost = new URL(contents.getURL()).hostname } catch {}
                if (!returnHost) return { action: 'allow' }

                const messengers = store.get('messengers', []) || []
                const messenger = messengers.find((m) => m && m.id === messengerId)
                const partition = `persist:${messengerId}`

                // BUGFIX (2026-08-26): this used to force a session-level
                // Chrome UA onto the OAuth partition here. Removed — live
                // A/B testing (scripts/ua-matrix.js against the user's real
                // Gmail session) proved claiming Chrome gets this popup
                // rejected by Google, whereas leaving the UA untouched does
                // not. See the BUGFIX comment above isGoogleAccountsUrl() in
                // main/ipc/window.js for the full evidence.
                try {
                    const oauthSession = session.fromPartition(partition)
                    // BUGFIX (2026-08-25, "не удалось войти" / whole-app freeze
                    // after Google auth) — Permissions-Policy response-header
                    // block for accounts.google.* WebAuthn conditional UI. See
                    // detailed BUGFIX comment in main/ipc/window.js.
                    ensureGoogleAccountsWebAuthnBlock(oauthSession, partition)
                } catch {}

                const mainWin = getMainWindow()
                // FEATURE (2026-08-26, Franz-style OAuth popup chrome — live
                // user request with reference screenshot): wider/taller than
                // the old 500x650, centered on mainWin rather than tucked in
                // its bottom-right corner. Keep in sync with
                // OAUTH_POPUP_WIDTH/HEIGHT in main/ipc/window.js — this path
                // (setWindowOpenHandler's overrideBrowserWindowOptions) can't
                // import that file's internal constants directly since
                // Electron applies these options before wireOAuthPopup() (the
                // only place that constant lives) ever sees this window.
                const OAUTH_POPUP_WIDTH = 860
                const OAUTH_POPUP_HEIGHT = 720
                let x, y
                if (mainWin && !mainWin.isDestroyed()) {
                    const [mx, my] = mainWin.getPosition()
                    const [mw, mh] = mainWin.getSize()
                    x = mx + Math.round((mw - OAUTH_POPUP_WIDTH) / 2)
                    y = my + Math.round((mh - OAUTH_POPUP_HEIGHT) / 2)
                }

                markOAuthBrokerActive(messengerId)
                oauthPendingMessengerIds.add(messengerId)

                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        width: OAUTH_POPUP_WIDTH, height: OAUTH_POPUP_HEIGHT, x, y,
                        title: messenger?.name || 'Centrio',
                        frame: false,
                        resizable: true, minimizable: true, maximizable: true,
                        skipTaskbar: true, show: false,
                        // BUGFIX (2026-08-25, "зависает после входа, ничего
                        // не нажимается" — same fix and same reasoning as
                        // createPopupWindow() in main/ipc/window.js: an
                        // ownerless alwaysOnTop popup gives Windows nothing
                        // to hand input focus back to once it's destroyed.
                        // `parent` (not `modal`) makes this a properly
                        // OS-owned child window without disabling mainWin.
                        //
                        // BUGFIX (2026-08-25, live retest: freeze persisted
                        // with `parent` alone): `alwaysOnTop: true` dropped
                        // entirely — see the matching, more detailed BUGFIX
                        // comment in createPopupWindow() (main/ipc/window.js)
                        // for the full reasoning (topmost windows sit in a
                        // separate Windows z-order band that can break the
                        // owner/child auto-refocus-on-close behavior `parent`
                        // is meant to provide; redundant anyway once `parent`
                        // already keeps this popup above mainWin). The
                        // matching focus-reclaim fix (topmost-toggle trick)
                        // lives in wireOAuthPopup()'s `closed` handler, which
                        // wires this window too — see main/ipc/window.js.
                        parent: (mainWin && !mainWin.isDestroyed()) ? mainWin : undefined,
                        webPreferences: {
                            nodeIntegration: false,
                            contextIsolation: true,
                            sandbox: true,
                            partition,
                            // BUGFIX ("Не удалось войти в аккаунт" внутри
                            // этого нативного попапа) — см.
                            // main/services/oauthPopupPreload.js: тот же
                            // navigator.userAgentData-разрыв, что и в
                            // createPopupWindow() ниже по файлу.
                            preload: path.join(__dirname, '..', 'services', 'oauthPopupPreload.js')
                        }
                    }
                }
            })

            // BUGFIX ("Sign in with Google" внутри мессенджера — например,
            // Grok/xAI — подтверждённо рендерится ВНУТРИ iframe той же
            // гостевой страницы: сайдбар остаётся виден на протяжении всего
            // флоу, ни window.open()/setWindowOpenHandler выше, ни
            // top-level 'will-navigate' ни разу не срабатывают, потому что
            // это навигация САБ-фрейма, а не главного или нового окна — весь
            // OAuth-брокер выше для этого конкретного флоу структурно
            // недостижим, независимо от его корректности). 'will-frame-
            // navigate' — единственное событие на этой версии Electron,
            // которое Chromium эмитит для навигации ЛЮБОГО фрейма гостевого
            // webContents, включая sub-frame/iframe (isMainFrame: false), и
            // единственное позволяющее её отменить (event.preventDefault())
            // до того как iframe успеет отрендерить google-отказ. При
            // обнаружении навигации НЕ-главного фрейма на распознанный
            // OAuth-хост — отменяем её (iframe останется пустым) и вместо
            // этого открываем тот же проверенный createPopupWindow(), что и
            // для window.open()-варианта выше.
            // BUGFIX (2026-08-26, "клик по «Войти через Google» в Grok —
            // открывается окно Google и Centrio намертво зависает; в
            // диспетчере задач ничего не висит; в Rambox/Franz работает"):
            // навигацию ГЛАВНОГО фрейма гостя на OAuth-провайдера до сих пор
            // перехватывал только renderer/webview-tabs-bind.js — через
            // DOM-событие <webview>'will-navigate' + e.preventDefault().
            // У тега <webview> это событие, в отличие от одноимённого события
            // webContents, НЕ отменяемое: оно лишь уведомляет о навигации,
            // которая уже началась (офиц. документация webview-tag
            // перечисляет у него только параметр `url`, без семантики отмены).
            // preventDefault() там не делал ничего, и в main-процессе
            // верхнеуровневой точки перехвата не было вообще: 'will-frame-
            // navigate' ниже отсекает главный фрейм первой же строкой, а
            // 'will-redirect' срабатывает только на серверный редирект.
            //
            // Живой лог воспроизведения это подтвердил: в 11:24:55.566
            // открывался попап, а через 228 мс will-redirect отменял
            // навигацию гостя на accounts.google.com — то есть кросс-origin
            // навигация главного фрейма <webview> успевала СТАРТОВАТЬ (а с
            // ней и смена процесса гостя) и обрывалась уже на лету, ровно в
            // тот момент, когда создаётся и показывается дочернее окно
            // попапа. Обрыв кросс-процессной навигации гостя одновременно с
            // пере-аттачем guest view к эмбеддеру — и есть тот native-блок в
            // рендерере ГЛАВНОГО окна, который прошлая CDP-диагностика
            // зафиксировала как зависание, недостижимое для Debugger.pause
            // (main-процесс и все остальные webview при этом оставались
            // живыми — отсюда и "в диспетчере ничего не висит").
            //
            // Отменяем такую навигацию здесь, на webContents гостя, где
            // preventDefault() реально работает — навигация не стартует
            // вовсе, процесс гостя не переключается, обрывать нечего.
            contents.on('will-navigate', (event, url) => {
                if (!isOAuthProviderUrl(url)) return
                if (isGoogleInternalPath(url)) return
                if (isYandexInternalSsoHost(url)) return

                if (openOAuthBroker(url)) {
                    event.preventDefault()
                }
            })

            contents.on('will-frame-navigate', (details) => {
                if (details.isMainFrame) return

                // DEBUG (Grok "2 окна" investigation): log EVERY sub-frame
                // navigation, matched or not — the isOAuthProviderUrl() check
                // below silently drops anything that doesn't match, which is
                // exactly the blind spot that would hide a GSI/FedCM iframe
                // using a host this regex doesn't recognize (e.g. a
                // gstatic.com-hosted picker, or an about:blank frame that
                // never re-navigates because Chromium renders its content via
                // FedCM's chrome-level UI instead of an actual page load).
                log.info(`[oauth-broker][DEBUG] will-frame-navigate subframe url=${details.url} matchesOAuthHost=${isOAuthProviderUrl(details.url)}`)

                if (!isOAuthProviderUrl(details.url)) return

                // BUGFIX ("Google: бесконечный повторяющийся [popup] loadURL
                // failed ERR_FAILED loading '.../_/bscframe'" — live-
                // reproduced, root-caused via [oauth-broker][DEBUG] logging):
                // paths under accounts.google.com/_/... (bscframe and
                // similar) are Google's own internal cross-origin cookie-
                // sync iframes — never meant to be loaded top-level, and NOT
                // the actual sign-in flow. They still match
                // isOAuthProviderUrl (hostname-only check) and re-navigate
                // every ~1-1.5s for as long as the real sign-in iframe is
                // open. Worse than merely pointless: intercepting them
                // grabs the ONE guard slot in activeOAuthBrokerMessengerIds
                // for this messenger, so when Google's own JS goes on to
                // open the REAL sign-in popup via window.open() (handled by
                // setWindowOpenHandler above, sharing the same guard), that
                // legitimate popup finds the guard already held and gets
                // silently swallowed too — the two code paths were fighting
                // over the same slot, which is why the single-flight guard
                // alone (added earlier) never fixed the loop. Skip these
                // internal paths entirely and let the guest iframe navigate
                // normally; only genuine sign-in sub-frames should ever
                // reach openOAuthBroker() here.
                //
                // BUGFIX (2026-08-24, "два окна при входе" — re-diagnosed
                // after the single-flight guard fix above turned out NOT to
                // be the (sole) cause: live screenshot + [oauth-broker][DEBUG]
                // log cross-reference proved the two visible windows were
                // TWO DIFFERENT messengers' popups, not a duplicate of the
                // same flow — so the per-messenger guard correctly did NOT
                // block the second one). RotateCookiesPage is the same
                // category of Google-internal cross-domain cookie-sync
                // endpoint as bscframe above (rotates the session cookie
                // across google.com subdomains — Gmail's webview triggers it
                // ambiently in the background, with no user action), but it
                // lives at the root path, not under /_/, so the filter above
                // never caught it. Unlike bscframe it doesn't fail to load
                // and retry — it loads "successfully" into a popup, but
                // being an internal utility page it never navigates away
                // from google.com, and popup close-on-completion
                // (maybeFinishOAuth in main/ipc/window.js) is keyed on
                // exactly that "left the provider's domain" signal. Net
                // result: a popup that opens and then NEVER closes on its
                // own, silently leaking window-turned-forever-open — for a
                // background operation the user never asked for. If the
                // user then separately signs into a DIFFERENT messenger
                // while this stale popup is still sitting open, the two
                // unrelated popups appear together and look exactly like
                // "two windows fighting over one sign-in" even though
                // there's no race at all. Extending the skip-list rather
                // than trying to auto-close popups more aggressively — an
                // internal housekeeping endpoint should never have opened a
                // user-facing window to begin with.
                //
                // BUGFIX (2026-08-24, regression introduced by the very
                // fix above): the first version of this filter was a single
                // regex `^\/(_\/|RotateCookiesPage|...)(\/|$)` that required
                // a "/" or end-of-string immediately after the matched
                // segment. That's correct for RotateCookiesPage (a leaf
                // page — nothing follows it in the path), but wrong for
                // "/_/" — that's a PREFIX under which many different
                // internal pages live, e.g. "/_/bscframe" has "bscframe"
                // immediately after "_/" with no separating slash, so the
                // trailing "(\/|$)" never matched and bscframe silently
                // fell through to openOAuthBroker() again — reintroducing
                // the exact "blank popup opens on its own" symptom this was
                // meant to fix (confirmed live: user added the Gmail tab,
                // an empty white popup titled "Gmail" appeared before any
                // sign-in attempt; logs showed createPopupWindow for
                // .../_/bscframe with no matching "popup closed" ever).
                // Switched to plain prefix checks (mirroring the original,
                // known-working `startsWith('/_/')` check) instead of a
                // single combined regex, since "/_/" and the named leaf
                // pages have different shapes and conflating them into one
                // pattern is exactly what broke this.
                if (isGoogleInternalPath(details.url)) return

                if (openOAuthBroker(details.url)) {
                    details.preventDefault()
                }
            })

            // BUGFIX (2026-08-24, "Не удалось войти в аккаунт" продолжает
            // появляться даже после фикса порядка проверки в 'will-navigate'
            // renderer/webview-tabs-bind.js — live-reproduced пользователем
            // на билде с этим фиксом): тот фикс закрывал только один путь —
            // навигацию, которую Electron классифицирует как 'will-navigate'
            // (переход по ссылке или JS-присвоение window.location СО
            // СТОРОНЫ страницы). Реальный необращённый вход в Gmail — это
            // mail.google.com отвечающий HTTP 302 на accounts.google.com
            // ПРЯМО НА УРОВНЕ СЕРВЕРА, а не JS-редирект. Electron в принципе
            // не эмитит 'will-navigate' для таких редиректов (см. офиц.
            // документацию will-navigate — редиректы идёт отдельным
            // событием). 'will-frame-navigate' выше тоже не ловит этот
            // случай: он либо не эмитится для серверных редиректов так же,
            // как и will-navigate, либо эмитится, но обрывается на первой
            // строке (`if (details.isMainFrame) return`) — тот early-return
            // был добавлен специально для случая Grok/xAI, где вход рисуется
            // в САБ-фрейме гостевой страницы, и никогда не предполагался
            // защитой и от навигации ГЛАВНОГО фрейма тоже. В сумме редирект
            // на accounts.google.com проходил мимо вообще всех точек
            // перехвата и рендерился прямо во вкладке с обычным (не
            // подмененным) UA Electron — то самое отказное сообщение Google.
            //
            // 'will-redirect' — единственное событие гостевого webContents,
            // которое Chromium реально эмитит для серверных редиректов (до
            // 'did-redirect-navigation', и в отличие от него — отменяемое).
            // Используем его как отдельную точку перехвата именно для этого
            // случая, с тем же списком служебных путей и тем же
            // openOAuthBroker(), что и 'will-frame-navigate' выше.
            contents.on('will-redirect', (details) => {
                if (!isOAuthProviderUrl(details.url)) return
                if (isGoogleInternalPath(details.url)) return
                if (isYandexInternalSsoHost(details.url)) return

                if (openOAuthBroker(details.url)) {
                    details.preventDefault()
                }
            })

            contents.on('did-create-window', (childWindow, details) => {
                if (childWindow.isDestroyed()) return

                // Попап, который мы сами пометили как OAuth в
                // setWindowOpenHandler выше (overrideBrowserWindowOptions
                // уже применён Electron'ом при создании childWindow) — вся
                // остальная обвязка (спуфинг UA, детект завершения флоу,
                // ретрай, детект отказа Google) навешивается через
                // wireOAuthPopup(), общую с createPopupWindow()'s isOAuthBroker
                // веткой в main/ipc/window.js.
                const oauthMessengerId = findMessengerIdForSession(contents.session)
                if (oauthMessengerId && oauthPendingMessengerIds.has(oauthMessengerId)) {
                    oauthPendingMessengerIds.delete(oauthMessengerId)

                    wireOAuthPopup(childWindow, {
                        url: details?.url || childWindow.webContents.getURL(),
                        mainWin: getMainWindow(),
                        partition: `persist:${oauthMessengerId}`
                    })

                    childWindow.once('closed', () => {
                        clearOAuthBrokerActive(oauthMessengerId)
                    })
                    return
                }

                childWindow.hide()

                let isDownload = false
                const childSession = childWindow.webContents.session
                const onChildDownload = (_evt, _item, downloadWebContents) => {
                    if (downloadWebContents === childWindow.webContents) isDownload = true
                }
                try { childSession.on('will-download', onChildDownload) } catch {}

                childWindow.webContents.once('did-navigate', (_evt, navUrl) => {
                    if (isDownload || childWindow.isDestroyed()) return
                    if (!navUrl || navUrl === 'about:blank') return
                    // DEBUG (2026-08-24, see matching comment on
                    // browser-window-created above) — this is the fallback
                    // for a webview-originated window.open() that did NOT
                    // get recognized as an OAuth popup (oauthPendingMessengerIds
                    // didn't have it): candidate #2 for the Yandex
                    // "opens external browser" report, if a mid-flow
                    // window.open() from the Yandex login popup itself (or
                    // the underlying webview) targets a host that
                    // isOAuthProviderUrl()/the new isYandexInternalSsoHost()
                    // skip above don't recognize.
                    log.info(`[oauth-broker][DEBUG] did-create-window fallback → shell.openExternal navUrl=${navUrl}`)
                    shell.openExternal(navUrl).catch(() => {})
                    childWindow.close()
                })

                childWindow.once('closed', () => {
                    try { childSession.removeListener('will-download', onChildDownload) } catch {}
                })
            })
        }

        contents.on('will-attach-webview', (event, webPreferences, params) => {
            try {
                const partition = params.partition || webPreferences.partition || ''
                const messengers = store.get('messengers', []) || []
                const isKnownPartition = messengers.some((m) => m && m.id && `persist:${m.id}` === partition)

                let expectedPreload = null
                try { expectedPreload = getWebviewPreloadPath() } catch (err) {
                    log.error('[security] will-attach-webview: failed to resolve expected preload path:', err.message)
                }

                const normalizedExpected = normalizePreloadPath(expectedPreload)
                const normalizedActual = normalizePreloadPath(webPreferences.preload)
                const preloadOk = !!normalizedExpected && normalizedExpected === normalizedActual

                if (!isKnownPartition || !preloadOk) {
                    log.warn('[security] will-attach-webview blocked — unexpected partition or preload', {
                        partition,
                        preload: webPreferences.preload
                    })
                    event.preventDefault()
                    return
                }

                // Re-assert safe defaults regardless of what the guest page/DOM declared.
                webPreferences.nodeIntegration = false
                webPreferences.nodeIntegrationInSubFrames = false
                webPreferences.contextIsolation = true

                // BUGFIX (root cause of "webview-preload.js never runs in guest
                // pages" — previously mis-diagnosed as an Electron 39 platform
                // limitation, see the dom-ready/executeJavaScript workaround
                // above): webPreferences.preload is a *native* Electron option
                // consumed by web_contents_preferences.cc, which requires a
                // plain absolute filesystem path and rejects anything that
                // fails base::FilePath::IsAbsolute() — a file:// URL string does
                // NOT qualify. Assigning the file:// URL here silently failed
                // preload injection while logging "preload script must have
                // absolute path" once per messenger webview at startup (matches
                // main.log exactly: 8 occurrences for 8 webviews). preloadOk
                // above still passed because normalizePreloadPath() converts
                // both sides back to a path before comparing, masking the
                // mismatch. getWebviewPreloadPath() returns a file:// URL
                // because that's the format the <webview preload="..."> HTML
                // attribute expects (renderer/messengers.js,
                // renderer/webview-tabs-bind.js) — but this native
                // webPreferences assignment needs the raw filesystem path.
                webPreferences.preload = expectedPreload.startsWith('file://')
                    ? fileURLToPath(expectedPreload)
                    : expectedPreload

                // BUGFIX ("не вставляется картинка из буфера обмена в Алисе"):
                // без явного permission-хендлера Electron по умолчанию НЕ
                // выдаёт guest-контенту <webview> разрешение 'clipboard-read' —
                // именно его запрашивает navigator.clipboard.read()/readText(),
                // которым современные чат-интерфейсы (включая Алису) чаще
                // всего реализуют вставку изображений по Ctrl+V — обычное
                // текстовое paste-событие эту вставку не покрывает.
                // 'media'/'notifications'/'geolocation' здесь же разрешены
                // явно, чтобы не сломать уже рабочие голосовые/видеозвонки,
                // геолокацию для шаринга и сайт-уведомления — раньше они
                // проходили через дефолтное поведение Electron (никакого
                // хендлера не было вовсе), теперь это дефолтное поведение
                // заменяется явным списком, и без них список стал бы строже,
                // чем было. Экзотика без легитимного применения в чат-вебапе
                // (midi/hid/usb/serial/window-management и т.п.) — не
                // допускается вообще.
                if (!clipboardPermissionPartitions.has(partition)) {
                    clipboardPermissionPartitions.add(partition)
                    try {
                        const guestSession = session.fromPartition(partition)
                        // 'hid'/'usb'/'serial' added alongside the rest (BUGFIX
                        // attempt, Google/Yandex OAuth rejection investigation):
                        // Ferdium's own real merged fix for this exact "This
                        // browser or app may not be secure" rejection
                        // (ferdium/ferdium-app#2360, closing #2324/#2316/#1801/
                        // #1487/#1131) paired a user-agent fix with granting
                        // these three permissions specifically to let WebAuthn/
                        // FIDO2 hardware security-key and passkey checks
                        // complete during Google sign-in — without them, a
                        // browser's passkey/security-key challenge can silently
                        // stall or fail closed, which surfaces to the user
                        // identically to Google's embedded-browser block. This
                        // session is shared with the OAuth broker popup (see
                        // isSharedMessengerSession in createPopupWindow), so
                        // granting these here also covers the popup, not just
                        // the webview.
                        const ALLOWED_PERMISSIONS = new Set([
                            'clipboard-read', 'clipboard-sanitized-write',
                            'media', 'notifications', 'geolocation',
                            'fullscreen', 'pointerLock', 'display-capture',
                            'hid', 'usb', 'serial'
                        ])
                        guestSession.setPermissionRequestHandler((_webContents, permission, callback) => {
                            callback(ALLOWED_PERMISSIONS.has(permission))
                        })
                        if (typeof guestSession.setPermissionCheckHandler === 'function') {
                            guestSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))
                        }

                        // BUGFIX (2026-08-26): a session-level Firefox
                        // User-Agent override for accounts.google.* used to be
                        // wired here too. Removed — it produced exactly the
                        // rejected "Firefox header + Chrome navigator.userAgent"
                        // mismatch the webview's own `useragent` attribute
                        // (renderer/webview-tabs-bind.js) already creates. The
                        // per-navigation UA reset in the 'web-contents-created'
                        // handler above (search isGoogleAccountsUrl) now handles
                        // the Gmail-in-webview-tab case instead. See the BUGFIX
                        // comment above isGoogleAccountsUrl() in
                        // main/ipc/window.js for the live A/B evidence.
                        // BUGFIX (2026-08-25, whole-app freeze after Google auth,
                        // reproduced on a plain webview tab too, not just the
                        // OAuth popup) — same Permissions-Policy WebAuthn block,
                        // wired here for the webview's own top-level/iframe
                        // requests. See BUGFIX comment in main/ipc/window.js.
                        ensureGoogleAccountsWebAuthnBlock(guestSession, partition)

                        // DIAGNOSTIC (2026-08-25, temporary, targeted at the
                        // "аудио не воспроизводится в Яндекс Мессенджере" bug):
                        // [media-diag] already proved the failing <audio> is a
                        // real HTMLMediaElement (not Web Audio API) whose
                        // play() rejects with NotSupportedError /
                        // networkState=NETWORK_NO_SOURCE for URLs on
                        // files.messenger.yandex.net — but that only tells us
                        // the BROWSER gave up, not WHY (could be an HTTP error
                        // status, a Content-Type Chromium refuses to play, or
                        // something about how the request left this process).
                        // onCompleted/onErrorOccurred are observer-only (unlike
                        // onBeforeSendHeaders/onHeadersReceived, Electron allows
                        // multiple listeners for these — see the "only ONE
                        // listener" comments elsewhere in this file), so this is
                        // safe to add without touching the existing UA-override
                        // listener. Scoped tightly to this one CDN host so it
                        // produces near-zero log noise for users who don't use
                        // Yandex Messenger. Remove once the real cause is found.
                        guestSession.webRequest.onCompleted(
                            { urls: ['*://files.messenger.yandex.net/*'] },
                            (details) => {
                                log.warn(
                                    `[cdn-diag] onCompleted url=${details.url} method=${details.method} statusCode=${details.statusCode} statusLine=${details.statusLine} fromCache=${details.fromCache} responseHeaders=${JSON.stringify(details.responseHeaders)}`
                                )
                            }
                        )
                        guestSession.webRequest.onErrorOccurred(
                            { urls: ['*://files.messenger.yandex.net/*'] },
                            (details) => {
                                log.warn(
                                    `[cdn-diag] onErrorOccurred url=${details.url} method=${details.method} error=${details.error} fromCache=${details.fromCache}`
                                )
                            }
                        )
                    } catch (err) {
                        log.error('[security] failed to set clipboard permission handler:', err.message)
                    }
                }
            } catch (err) {
                log.error('[security] will-attach-webview validation error, denying attach:', err.message)
                event.preventDefault()
            }
        })
    })

    app.on('open-url', (event, url) => {
        event.preventDefault()
        handleProtocolUrl(url, getMainWindow, showMainWindow)
    })

    app.on('before-quit', (event) => {
        if (isQuittingRef._flushed) return
        event.preventDefault()
        isQuittingRef._flushed = true
        isQuittingRef.value = true
        tracker.stop()

        // tracker.flush() makes a network call (see api.js/trackStats) that,
        // before this fix, had no timeout anywhere in the chain — a stalled
        // connection (dead network, VPN torn down mid-quit) meant `before-quit`
        // could hang forever and the app would never actually exit. Race it
        // against a hard deadline so quitting is never blocked on the network.
        //
        // BUGFIX ("сайдбар не сохраняется" / "возвращает старый сайдбар"):
        // also wait for any in-flight cloud sync push (renderer's
        // cloudSyncPush() in sidebar-dnd-bind.js / split.js is fire-and-forget
        // on the renderer side). Without this, a reorder or preset save
        // immediately followed by closing the window (closeBehavior:"quit")
        // could get its push killed mid-request — local disk already has the
        // correct order, but the stale cloud copy survives and overwrites it
        // right back on the next launch's cloudSyncPull(). See
        // main/ipc/api.js waitForPendingSyncPush() for the other half, and
        // flushRendererCloudSync() above for the debounce-window race it
        // still didn't cover (e.g. notification sound toggle reverting).
        // Deadline bumped from 4000 to 6000ms to give the renderer-flush
        // round trip (send 'app-quitting' → renderer pushes → ack) room to
        // land before we give up and quit anyway.
        const FLUSH_DEADLINE_MS = 6000
        const deadline = new Promise((resolve) => setTimeout(resolve, FLUSH_DEADLINE_MS))

        Promise.race([
            Promise.all([
                tracker.flush().catch(() => {}),
                flushRendererCloudSync(getMainWindow)
                    .then(() => waitForPendingSyncPush())
                    .catch(() => {})
            ]),
            deadline
        ]).finally(() => app.quit())
    })

    app.on('will-quit', () => { unregisterShortcuts() })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('activate', () => {
        const win = getMainWindow()
        if (!win || win.isDestroyed()) createWindow()
        else showMainWindow()
    })
}

module.exports = registerAppEvents
