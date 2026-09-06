const path = require('path')
const { ipcMain, shell, app, BrowserWindow, WebContentsView, session, powerMonitor, webContents: electronWebContents, clipboard } = require('electron')
const pinHash = require('../services/pinHash')
const { grantSecurityChange } = require('../services/pinGrant')
const store = require('../services/store')
const { isOAuthProviderUrl, isYandexInternalSsoHost } = require('../services/oauthProviders')

let log
try { log = require('electron-log') } catch { log = console }

// FEATURE (2026-08-26, "сделай окно, которое открывается для авторизации,
// как у FRANZ" — live user request with reference screenshot): OAuth broker
// popups used to be a plain native-framed BrowserWindow with nothing but the
// bare provider page inside. These dimensions/this strip height are sized to
// match Franz's own popup proportions from the reference screenshot (wide,
// generous height, ~84px combined titlebar+toolbar).
const OAUTH_POPUP_WIDTH = 860
const OAUTH_POPUP_HEIGHT = 720
const OAUTH_CHROME_HEIGHT = 84

function safeOn(channel, listener) {
    ipcMain.removeAllListeners(channel)
    ipcMain.on(channel, listener)
}

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

// BUGFIX (security regression): both call sites below used to do
// `const { isPasswordEnabled } = require('../services/store')` — but
// main/services/store.js only exports the raw electron-store instance, it has
// no `isPasswordEnabled` export. That destructure silently evaluated to
// `undefined`, so `isPasswordEnabled()` threw a TypeError inside an
// ipcMain.on handler every time a user with "lock on minimize/hide" enabled
// actually minimized or hid the window — meaning the lock screen never
// appeared for them at all. Mirrors the equivalent (working) check in
// renderer/lock.js's own isPasswordEnabled().
function isPasswordEnabled(security) {
    return security?.enabled === true && !!security?.hash
}

// ── Google embedded-browser rejection fix ──
// BUGFIX (2026-08-26, live A/B testing against the user's REAL Gmail
// session, 5 UA strategies × 3 repeats each via scripts/ua-matrix.js):
// the Firefox-header-spoof approach below (superseded) was itself the
// cause of the rejection, not a fix for it. Results: leaving the UA
// completely untouched ("none") passed 3/3; explicitly claiming a
// consistent Chrome identity — even one matching Electron's real
// bundled Chromium version exactly ("cleanchrome") — was REJECTED 2/3;
// and the app's actual prior configuration (Firefox User-Agent header +
// Chrome navigator.userAgent, "appmix") was REJECTED 2/3 too, matching
// the user's live bug report exactly. Consistent Firefox impersonation
// ("firefox") also passed 3/3, but "none" is simpler and needs no
// spoofing code at all, so that's the fix applied here: every explicit
// UA/Client-Hints override for accounts.google.* has been removed from
// the OAuth broker popup (this file) and the OAuth session (see
// registerAppEvents.js). The one remaining wrinkle is the webview's own
// base `useragent` attribute (renderer/webview-tabs-bind.js), which
// explicitly claims Chrome for every messenger — same shape as the
// rejected "cleanchrome" case. That's handled per-navigation in
// registerAppEvents.js's 'web-contents-created' handler: reset to the
// session's untouched default the moment a webview navigates to
// accounts.google.*, restore the normal webview UA once it navigates
// away. isGoogleAccountsUrl() below is what scopes that reset.
const GOOGLE_ACCOUNTS_HOST_RE = /(^|\.)accounts\.google\.[a-z]{2,3}(\.[a-z]{2,3})?$/i
function isGoogleAccountsUrl(url) {
    try {
        return GOOGLE_ACCOUNTS_HOST_RE.test(new URL(url).hostname.toLowerCase())
    } catch {
        return false
    }
}

// BUGFIX (2026-08-25, "Гугл выдает про ключ на любой авторизации" /
// "Centrio целиком перестаёт реагировать на клики, ЗАКРЫТИЕ ПОПАПА НЕ
// ПОМОГАЕТ" — root-caused via live computer-use diagnosis: Диспетчер задач
// не показывал ни один процесс Centrio.exe как "Не отвечает", CPU не рос —
// не renderer-deadlock, а осиротевший нативный OS-диалог WebAuthn
// conditional UI; закрытие попапа не снимало блокировку, значит объект
// живёт вне жизненного цикла попап-окна — см. подробные BUGFIX-комментарии
// в webview-preload.js и main/services/oauthPopupPreload.js, где уже стоит
// первая линия защиты — JS-инъекция, подменяющая
// isConditionalMediationAvailable()/navigator.credentials.get(). Та защита
// работает только ПОСЛЕ появления document.head (через retry-таймер) — это
// гонка с собственным ранним inline-скриптом Google в <head>, который
// теоретически может вызвать conditional WebAuthn раньше. Этот заголовок —
// главный, не подверженный гонке барьер: Permissions-Policy применяется
// движком Chromium на уровне HTTP-ответа, ДО выполнения любого скрипта
// страницы вообще. onHeadersReceived нигде в кодовой базе не
// использовался (проверено grep) — свободная точка расширения, поэтому
// отдельная функция и отдельный per-partition guard.
// Скоуп — только accounts.google.* (тот же isGoogleAccountsUrl),
// т.к. это переписывание заголовка ОТВЕТА — не может протечь в остальные
// google-домены (Gmail, Drive и т.д.) или в трафик других мессенджеров.
const googlePermissionsPolicyWiredPartitions = new Set()
function ensureGoogleAccountsWebAuthnBlock(targetSession, partitionKey) {
    if (!targetSession || googlePermissionsPolicyWiredPartitions.has(partitionKey)) return
    googlePermissionsPolicyWiredPartitions.add(partitionKey)

    targetSession.webRequest.onHeadersReceived(
        { urls: ['*://*.google.com/*', '*://*.googleusercontent.com/*'] },
        (details, callback) => {
            if (!isGoogleAccountsUrl(details.url)) {
                callback({ responseHeaders: details.responseHeaders })
                return
            }
            const headers = { ...details.responseHeaders }
            headers['Permissions-Policy'] = ['publickey-credentials-get=(), publickey-credentials-create=()']
            callback({ responseHeaders: headers })
        }
    )
}

// BUGFIX (Gmail "лишнее пустое окно" / 2FA дублирующийся флоу → Google
// "error 400"; Grok "2 окна, авторизация не проходит" — live-reproduced,
// root-caused via [oauth-broker][DEBUG] logging): this single-flight guard
// used to live ONLY inside main/bootstrap/registerAppEvents.js, shared
// between its own two entry points (contents.setWindowOpenHandler() for real
// window.open() calls, and the will-frame-navigate → openOAuthBroker() path
// for sub-frame/iframe OAuth navigation). But there is a THIRD, completely
// independent entry point that creates OAuth broker popups: the top-level
// 'will-navigate' listener in renderer/webview-tabs-bind.js, which calls
// createPopupWindow() directly over the generic 'open-popup-window' IPC
// channel — with zero visibility into registerAppEvents.js's local Set. A
// live log capture proved this: for a single Gmail sign-in, exactly ONE
// openOAuthBroker() call was logged (the sub-frame path), yet the user saw
// TWO broker windows — the second one came from this unguarded renderer
// path racing the same sign-in attempt. Two independent, concurrent OAuth
// flows against the same Google account is exactly the kind of thing that
// invalidates one flow's state/nonce, which is the leading explanation for
// the Google "error 400" the user hit after going through the 2FA/passkey
// window. Moving the guard here — into createPopupWindow(), the one
// function ALL manual-BrowserWindow broker paths funnel through — closes
// that gap. The native-allow path (setWindowOpenHandler) still doesn't call
// createPopupWindow() (Electron builds that popup itself), so it reads/
// writes this same shared state directly via the exported helpers below.
const activeOAuthBrokerMessengerIds = new Set()

function isOAuthBrokerActive(messengerId) {
    return !!messengerId && activeOAuthBrokerMessengerIds.has(messengerId)
}

function markOAuthBrokerActive(messengerId) {
    if (messengerId) activeOAuthBrokerMessengerIds.add(messengerId)
}

function clearOAuthBrokerActive(messengerId) {
    if (messengerId) activeOAuthBrokerMessengerIds.delete(messengerId)
}

// partition is always `persist:${messengerId}` (see isKnownPartition check
// in createPopupWindow() below and the call sites in registerAppEvents.js /
// webview-tabs-bind.js) — never used to build a URL or navigate anywhere,
// only as a lookup key for the guard above.
function messengerIdFromPartition(partition) {
    if (typeof partition !== 'string' || !partition.startsWith('persist:')) return null
    return partition.slice('persist:'.length) || null
}

// FEATURE (2026-08-26, Franz-style OAuth popup chrome): a BrowserWindow
// cannot show two independently-navigable regions (a custom toolbar +
// the actual OAuth page) through its own single webContents — that needs
// Electron's multi-View API. `popup.contentView` already holds exactly one
// child (a WebContentsView wrapping popup.webContents) as soon as the
// window is constructed; shrinking that child's bounds and adding a second
// WebContentsView as a sibling on top gives a real toolbar strip without
// touching anything about how popup.webContents itself navigates/loads —
// every existing listener in wireOAuthPopup() below keeps working against
// popup.webContents completely unchanged. Only called for OAuth broker
// popups (both are always constructed with frame:false — see
// createPopupWindow() and overrideBrowserWindowOptions in
// main/bootstrap/registerAppEvents.js).
function attachOAuthPopupChrome(popup, { mainWin, name }) {
    const chromeView = new WebContentsView({
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, '..', 'services', 'oauthPopupChromePreload.js')
        }
    })

    const layout = () => {
        if (popup.isDestroyed()) return
        const [w, h] = popup.getContentSize()
        const baseView = popup.contentView.children[0]
        if (baseView) {
            baseView.setBounds({ x: 0, y: OAUTH_CHROME_HEIGHT, width: w, height: Math.max(0, h - OAUTH_CHROME_HEIGHT) })
        }
        chromeView.setBounds({ x: 0, y: 0, width: w, height: OAUTH_CHROME_HEIGHT })
    }

    popup.contentView.addChildView(chromeView)
    layout()
    popup.on('resize', layout)

    chromeView.webContents.loadFile(path.join(__dirname, '..', 'services', 'oauthPopupChrome.html')).catch(() => {})

    // FEATURE (2026-08-26, live user feedback: "Открыть в браузере - цвет
    // акцентный из программы"): Centrio's accent color is user-customizable
    // (renderer/settings-ui.js, --accent CSS var, default '#7b68ee') — this
    // chrome toolbar is its own isolated WebContentsView/document, it does
    // not inherit that CSS var from the main window at all, so it was stuck
    // on a hardcoded indigo that only coincidentally matched the app's own
    // default. Read straight from the store (same source of truth the
    // renderer reads via store.get('settings')) instead of duplicating a
    // hardcoded fallback color.
    let accentColor = '#7b68ee'
    try { accentColor = store.get('settings', {})?.accentColor || accentColor } catch {}

    const pushState = () => {
        if (popup.isDestroyed() || chromeView.webContents.isDestroyed()) return
        let url = ''
        try { url = popup.webContents.getURL() } catch {}
        chromeView.webContents.send('oauth-chrome:state', {
            url,
            title: name || 'Авторизация',
            isMaximized: popup.isMaximized(),
            accentColor
        })
    }
    popup.webContents.on('did-navigate', pushState)
    popup.webContents.on('did-navigate-in-page', pushState)
    popup.webContents.on('did-finish-load', pushState)
    popup.on('maximize', pushState)
    popup.on('unmaximize', pushState)
    chromeView.webContents.once('did-finish-load', pushState)

    // Scoped to this exact chromeView.webContents (Electron 16+ per-webContents
    // .ipc), not a global ipcMain.on — every concurrently-open OAuth popup gets
    // its own independent set of listeners, none of them cross-talk.
    chromeView.webContents.ipc.on('oauth-chrome:minimize', () => {
        if (!popup.isDestroyed()) popup.minimize()
    })
    chromeView.webContents.ipc.on('oauth-chrome:maximize', () => {
        if (popup.isDestroyed()) return
        if (popup.isMaximized()) popup.unmaximize()
        else popup.maximize()
    })
    chromeView.webContents.ipc.on('oauth-chrome:close', () => {
        if (!popup.isDestroyed()) popup.close()
    })
    chromeView.webContents.ipc.on('oauth-chrome:refresh', () => {
        if (!popup.isDestroyed()) popup.webContents.reload()
    })
    chromeView.webContents.ipc.on('oauth-chrome:copy-url', () => {
        try { clipboard.writeText(popup.webContents.getURL()) } catch {}
    })
    chromeView.webContents.ipc.on('oauth-chrome:open-external', () => {
        try { shell.openExternal(popup.webContents.getURL()).catch(() => {}) } catch {}
    })
    chromeView.webContents.ipc.on('oauth-chrome:add-service', () => {
        if (!mainWin || mainWin.isDestroyed()) return
        let url = ''
        try { url = popup.webContents.getURL() } catch {}
        if (!url) return
        mainWin.webContents.send('oauth-add-as-service', { url })
    })
}

// Вынесена из createPopupWindow() в отдельную функцию, применимую к УЖЕ
// существующему BrowserWindow — не только к тому, что createPopupWindow()
// строит сама (для брокера, вызываемого из will-navigate/will-frame-navigate
// в registerAppEvents.js, где нет естественной пары "opener→popup"), но и к
// нативно созданному Electron'ом попапу из contents.setWindowOpenHandler()
// (action:'allow' + overrideBrowserWindowOptions), где window.opener внутри
// попапа остаётся живым — см. BUGFIX-комментарий у setWindowOpenHandler в
// registerAppEvents.js. Google Identity Services и подобные провайдеры
// нередко замыкают OAuth-попап через `window.opener.postMessage(...)`
// обратно на страницу, которая его открыла — эта связь рвётся, если попап
// строить вручную через `new BrowserWindow()` (opener всегда null), именно
// так и делал старый брокер. Тот же паттерн — Franz's own bundled main-
// process source, setupExternalLinkHandler/nativePopupOptions.
function wireOAuthPopup(popup, { url, mainWin, partition }) {
    popup.setMenuBarVisibility(false)

    let popupTitle = 'Авторизация'
    try { popupTitle = popup.getTitle() || popupTitle } catch {}
    attachOAuthPopupChrome(popup, { mainWin, name: popupTitle })

    // FEATURE (2026-08-24, "всплывающее окно всё-равно открывается в Яндекс
    // ... нужно заглушку на основном окне ставить" — live user request):
    // попап — это ожидаемое, не устранимое поведение (Google/Яндекс сами
    // блокируют вход внутри embedded-браузера, поэтому OAuth и уводится в
    // отдельный BrowserWindow), но с точки зрения пользователя основная
    // вкладка при этом выглядит как будто просто ничего не происходит.
    // Шлём main-окну сигнал начала/конца попапа, чтобы renderer мог
    // показать поверх вкладки мессенджера ненавязчивую заглушку
    // "Авторизация происходит в отдельном окне" на всё время его жизни.
    // Канал должен быть заранее занесён в validReceiveChannels в preload.js,
    // иначе contextBridge молча проглотит событие.
    if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('oauth-popup-started', { partition })
    }
    popup.once('closed', () => {
        if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('oauth-popup-closed', { partition })
        }
    })

    // BUGFIX (2026-08-25 → 2026-08-25, three prior attempts, all live-retested
    // and confirmed NOT to fix the "app freezes permanently after the OAuth
    // popup closes" bug): every earlier iteration here (plain `.focus()`,
    // then a `setAlwaysOnTop(true)/.focus()/setAlwaysOnTop(false)` topmost
    // toggle, then that same toggle deferred via `setImmediate()`) tried to
    // reclaim OS focus for `mainWin` from inside the popup's own `closed`
    // handler. All three were live-retested against the same deliberate
    // repro (Grok → "Войти через Google" → close the popup) and all three
    // still froze mainWin's renderer afterward — confirmed via dual CDP:
    // the main-process Node inspector stayed fully responsive the whole
    // time (Runtime.evaluate answered in 3ms) while mainWin's OWN renderer
    // target never answered so much as a `Debugger.pause` even 15s later.
    // That combination rules out the "reentrant Win32 call blocks the main
    // process's message-loop thread" theory from the setImmediate attempt —
    // the main process was never stuck. The one thing all three failed
    // attempts had in common was calling `mainWin.focus()` (with or without
    // the topmost toggle, with or without deferring past the popup's own
    // destroy sequence) in reaction to the popup closing. Windows already
    // hands focus back to an owner window when an owned child window
    // (`parent: mainWin`, set above) is destroyed — that's the OS's own
    // default behavior, not something this app needs to reimplement. So the
    // fix this time is to stop reimplementing it: no `.focus()`, no
    // `setAlwaysOnTop` toggle, no synchronous *or* deferred touching of
    // `mainWin`'s window state from this handler at all. If a real
    // "mainWin doesn't get focus back" case still turns up after this, it
    // needs to be re-diagnosed from scratch rather than iterated on this
    // same code path a fourth time.

    // BUGFIX (2026-08-26): this used to force a Chrome UA onto the popup's
    // webContents here. Removed — live A/B testing proved that claiming
    // Chrome (even a version-accurate one) gets this popup rejected by
    // Google, whereas leaving the UA untouched does not. See the BUGFIX
    // comment above isGoogleAccountsUrl() for the full evidence.
    let hasStartedDownload = false
    const popupSession = popup.webContents.session
    ensureGoogleAccountsWebAuthnBlock(popupSession, partition)
    const onSessionDownload = (_e, item, downloadWebContents) => {
        if (downloadWebContents === popup.webContents) {
            hasStartedDownload = true
            if (!popup.isDestroyed()) popup.hide()
            if (item) {
                item.once('done', () => {
                    if (!popup.isDestroyed()) popup.close()
                })
            } else if (!popup.isDestroyed()) {
                popup.close()
            }
        }
    }
    popupSession.on('will-download', onSessionDownload)
    popup.once('closed', () => popupSession.removeListener('will-download', onSessionDownload))

    // OAuth-попап сам не открывает вложенных попапов.
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // BUGFIX (live-reported 2026-08-24, "вход прошёл, но окно так и
    // осталось открытым вместо возврата в основную вкладку" — reproduced
    // both on Grok's "Войти через Google" and on a direct Gmail sign-in
    // test): this used to require an EXACT hostname match against
    // `returnHost` (the messenger's own hostname captured BEFORE the OAuth
    // flow started) before closing the popup. Real provider redirects
    // routinely land somewhere else — a different subdomain, a dedicated
    // auth-callback host, an SPA client-side redirect that never fires a
    // classic top-level navigation event with a byte-for-byte matching
    // hostname — so the popup just sat there fully signed in and never
    // closed, and the main tab never got the reload signal below. The
    // signal that actually matters isn't "did we land back on the exact
    // original host" — it's "have we left the OAuth provider's own
    // domain". Once that's true the session cookie is already written into
    // the shared persist:<messengerId> partition, so it's safe to hand
    // back to the main tab regardless of which host the flow lands on.
    //
    // BUGFIX (2026-08-25, "зависает после входа в Яндекс, помогает только
    // перезапуск приложения" — live-reproduced via [oauth-broker][DEBUG]):
    // this check used to stop at isOAuthProviderUrl()/isGoogleAccountsUrl()
    // only, so any OTHER host was read as "left the provider, flow done".
    // Live log: popup opened on passport.yandex.ru/auth (real login
    // screen), then ~26s later navigated to
    // sso.ya.ru/sync?...&finish=https://cookier.360.yandex.ru/yandex360session?retpath=...yandex.ru/chat...
    // — a pure cross-domain cookie-sync hop, not the finished flow — and
    // this function closed the popup right there, before the sync chain
    // could reach cookier.360.yandex.ru and finish writing the session.
    // That left the persist:<messengerId> partition with a half-written
    // session that no webview.reload() could repair, matching the user's
    // report that only a full app restart (fresh process/session) helped.
    // isYandexInternalSsoHost() (shared/oauthProviders.js, previously only
    // consumed by registerAppEvents.js for a different guard) now keeps
    // the popup open through these known sync hosts too.
    // BUGFIX (2026-08-26, "авторизация доходит до конца, но не проходит в
    // самом Grok/сервисе" — live-reproduced via [oauth-broker][DEBUG]:
    // popup landed on https://accounts.x.ai/oauth-complete?return_url=
    // https%3A%2F%2Faccounts.x.ai, maybeFinishOAuth treated that as "done"
    // and closed the popup right there): this is the SAME bug shape already
    // fixed twice for hardcoded hosts — Yandex's sso.ya.ru/cookier.360
    // cross-domain cookie-sync bounce (see BUGFIX above) and Google's own
    // /restart continuation hop (registerAppEvents.js) — but this time on
    // a THIRD-PARTY identity broker (accounts.x.ai, xAI's own SSO for
    // Grok) that can't be hardcoded the same way: every messenger's OAuth
    // provider can have its own such intermediate "left Google/Yandex but
    // not actually finished yet" host, and there is no way to enumerate
    // them all up front. "Left the provider's domain" is not a reliable
    // done-signal by itself — it only means we left GOOGLE/YANDEX, not
    // that the site's OWN auth handoff (often another redirect chain
    // through its own accounts.* subdomain) has settled.
    // Fix: debounce instead of firing on the first non-provider hop. Arm a
    // short settle timer; any further navigation before it elapses either
    // cancels it (back on a known provider/internal host — flow isn't
    // done) or re-arms it (another intermediate hop, e.g. accounts.x.ai →
    // grok.com). Only close/notify once navigation has actually settled.
    const OAUTH_FINISH_SETTLE_MS = 1500
    let finishSettleTimer = null
    let finishFired = false
    const maybeFinishOAuth = (navUrl) => {
        if (finishFired || popup.isDestroyed()) return false
        if (!navUrl) return false
        if (isOAuthProviderUrl(navUrl) || isGoogleAccountsUrl(navUrl) || isYandexInternalSsoHost(navUrl)) {
            if (finishSettleTimer) {
                clearTimeout(finishSettleTimer)
                finishSettleTimer = null
            }
            return false
        }
        try {
            if (!new URL(navUrl).hostname) return false
        } catch {
            return false
        }

        log.info(`[oauth-broker][DEBUG] maybeFinishOAuth: left provider domain, navUrl=${navUrl}, arming settle timer`)
        if (finishSettleTimer) clearTimeout(finishSettleTimer)
        finishSettleTimer = setTimeout(() => {
            finishSettleTimer = null
            if (finishFired || popup.isDestroyed()) return
            finishFired = true
            log.info(`[oauth-broker][DEBUG] maybeFinishOAuth firing after settle, navUrl=${navUrl}`)
            if (mainWin && !mainWin.isDestroyed()) {
                // BUGFIX (2026-08-26, live user report: "Гугл - проходит
                // авторизацию в окне, закрывает окно и показывает Centrio с
                // чёрным окном Gmail"): this used to send only `{ partition }`,
                // and webview-tabs-bind.js's handler did a blind
                // `webview.reload()` — which just re-fetches whatever URL the
                // guest <webview> happened to be sitting on BEFORE the popup
                // opened (typically the pre-auth login prompt or an
                // intermediate blank state), not the page the popup actually
                // finished on. The popup's cookies land in the same
                // persist:<messengerId> partition, but nothing ever told the
                // guest tab WHERE to go with them. Forwarding the popup's own
                // final settled URL lets the renderer navigate the guest
                // webview there directly instead of guessing via reload().
                mainWin.webContents.send('oauth-popup-done', { partition, finalUrl: navUrl })
            }
            if (!popup.isDestroyed()) popup.close()
        }, OAUTH_FINISH_SETTLE_MS)
        return true
    }
    popup.once('closed', () => {
        if (finishSettleTimer) {
            clearTimeout(finishSettleTimer)
            finishSettleTimer = null
        }
    })

    // BUGFIX (2026-08-26, live-reproduced: "Grok — доходит до конца, но не
    // проходит" — [oauth-broker][DEBUG] log showed the settle-timer above
    // firing exactly as designed (re-armed three times, fired after 1.5s of
    // real quiet), yet the popup closes while STILL sitting on
    // https://accounts.x.ai/oauth-complete?return_url=...  — that page never
    // itself navigates further, so "settled" here just means "gave up
    // waiting", not "finished". accounts.x.ai/oauth-complete is xAI's own
    // identity-broker completion page — its shape (return_url pointing back
    // at itself, not at grok.com) matches the classic `window.opener.
    // postMessage(...)` handoff pattern already documented for Yandex
    // elsewhere in this codebase (see webview-tabs-bind.js), not a
    // redirect-based one. Our popup is always a manually-constructed
    // `new BrowserWindow()` (see comment above createPopupWindow()), so
    // `window.opener` is null in every popup regardless of entry path —
    // any postMessage this page tries to send has nowhere to arrive, and it
    // just sits there forever (or until some longer internal timeout we
    // haven't observed).
    //
    // Fix (experimental — narrowly scoped to accounts.x.ai only, so it
    // cannot regress Google/Yandex/any other provider's already-working
    // settle-timer path): oauthPopupPreload.js injects a `window.opener`
    // shim ONLY on *.x.ai hosts, whose postMessage() relays the call here
    // via a per-popup-scoped IPC channel (popup.webContents.ipc — bound to
    // this exact webContents, not a global listener). We forward the
    // message into the real guest <webview> (found by matching session —
    // popup and its originating tab share the same persist:<messengerId>
    // partition by construction) via executeJavaScript, simulating the
    // postMessage the page expects its real opener to receive. An actual
    // relay attempt is a far more reliable "flow is genuinely done" signal
    // than navigation-quiescence guessing, so it also short-circuits the
    // settle timer above instead of waiting out OAUTH_FINISH_SETTLE_MS.
    try {
        popup.webContents.ipc.on('oauth-relay-postmessage', (_event, payload) => {
            try {
                const guestContents = electronWebContents.getAllWebContents().find((wc) =>
                    wc !== popup.webContents && !wc.isDestroyed() && wc.session === popupSession
                )
                if (guestContents) {
                    const dataJson = JSON.stringify(payload && 'data' in payload ? payload.data : null)
                    const originJson = JSON.stringify((payload && payload.targetOrigin) || '*')
                    guestContents.executeJavaScript(`window.postMessage(${dataJson}, ${originJson})`).catch(() => {})
                    log.info('[oauth-broker][DEBUG] relayed opener.postMessage into guest webview')
                } else {
                    log.warn('[oauth-broker][DEBUG] opener.postMessage received but no matching guest webview found')
                }
            } catch (e) {
                log.error('[oauth-broker] relay postMessage failed:', e.message)
            }

            if (!finishFired && !popup.isDestroyed()) {
                finishFired = true
                if (finishSettleTimer) {
                    clearTimeout(finishSettleTimer)
                    finishSettleTimer = null
                }
                log.info('[oauth-broker][DEBUG] maybeFinishOAuth firing via postMessage relay signal')
                if (mainWin && !mainWin.isDestroyed()) {
                    mainWin.webContents.send('oauth-popup-done', { partition })
                }
                popup.close()
            }
        })
    } catch (e) {
        log.error('[oauth-broker] failed to register postMessage relay:', e.message)
    }

    popup.webContents.on('will-navigate', (event, navUrl) => {
        if (!navUrl.startsWith('http://') && !navUrl.startsWith('https://')) {
            event.preventDefault()
            return
        }
        maybeFinishOAuth(navUrl)
    })

    popup.webContents.on('did-navigate', (_event, navUrl) => maybeFinishOAuth(navUrl))
    popup.webContents.on('did-navigate-in-page', (_event, navUrl) => maybeFinishOAuth(navUrl))
    // Redundant safety net alongside the navigation-event listeners above —
    // did-finish-load fires whenever content actually finishes rendering,
    // independent of exactly which navigation-event flavor got the popup
    // there. Cheap and idempotent (maybeFinishOAuth no-ops once the popup
    // is already closed), and catches cases where the real completion
    // redirect doesn't cleanly match any single listened-for event.
    popup.webContents.on('did-finish-load', () => maybeFinishOAuth(popup.webContents.getURL()))

    let oauthLoadAttempts = 0
    popup.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return
        if (errorCode === -3) return
        if (popup.isDestroyed()) return

        log.error(`[oauth-broker] did-fail-load (${errorCode} ${errorDescription}) loading ${validatedURL}`)

        if (oauthLoadAttempts < 1) {
            oauthLoadAttempts++
            setTimeout(() => {
                if (popup.isDestroyed()) return
                log.info('[oauth-broker] retrying popup loadURL after did-fail-load')
                popup.loadURL(url).catch((e) => log.error('[oauth-broker] retry loadURL failed:', e.message))
            }, 800)
            return
        }

        // BUGFIX ("вся авторизация ведь не должна отправлять в браузер, мы
        // там передать не можем ключ" — live user report): раньше после
        // исчерпания попыток попап закрывался и URL летел в
        // shell.openExternal(). Для входа на СТОРОННЕМ сайте мессенджера
        // (не в самом Centrio) нет вообще никакого канала вернуть результат
        // авторизации из системного браузера обратно в это всплывающее окно
        // (в отличие от centrio://auth — у произвольного OAuth стороннего
        // мессенджера нет зарегистрированного протокол-хендлера для
        // возврата) — уход в браузер гарантированно обрывал вход и терял
        // сессию безвозвратно. Теперь просто оставляем попап открытым с
        // тем, что реально загрузилось (обычно родная страница ошибки сети
        // Electron) — пользователь видит проблему и может закрыть попап
        // или повторить сам, вместо тихой потери входа.
        log.error('[oauth-broker] popup failed to load after retries — leaving popup open (no external-browser fallback)')
        if (!popup.isDestroyed() && !popup.isVisible()) {
            popup.show()
            popup.focus()
        }
    })

    const OAUTH_SHOW_SAFETY_NET_MS = 5000
    setTimeout(() => {
        if (!popup.isDestroyed() && !popup.isVisible()) {
            popup.show()
            popup.focus()
        }
    }, OAUTH_SHOW_SAFETY_NET_MS)

    let googleRejectionHandled = false
    const checkGoogleRejection = async (navUrl) => {
        if (googleRejectionHandled || popup.isDestroyed()) return
        let hostname = ''
        try { hostname = new URL(navUrl || popup.webContents.getURL()).hostname } catch { return }
        // BUGFIX (2026-08-24, same ccTLD gap as isGoogleAccountsUrl() above):
        // this used to only recognize *.google.com / google.com, so a
        // rejection page rendered on an accounts.google.<ccTLD> hop (which
        // Google's own flow can land on mid-way, e.g. SetSID) would never be
        // detected here at all.
        const isPlainGoogleCom = hostname.endsWith('.google.com') || hostname === 'google.com'
        if (!isPlainGoogleCom && !GOOGLE_ACCOUNTS_HOST_RE.test(hostname)) return

        let pageText = ''
        try {
            pageText = await popup.webContents.executeJavaScript(
                'document.body ? document.body.innerText : ""'
            )
        } catch {
            return
        }
        if (popup.isDestroyed() || googleRejectionHandled) return

        const isRejectionPage = /this browser or app may not be secure|недостаточно безопасн|не удалось войти в аккаунт|не может использовать этот браузер/i.test(pageText || '')
        if (!isRejectionPage) return

        googleRejectionHandled = true
        // BUGFIX (same reasoning as did-fail-load above): closing the popup
        // and shell.openExternal()-ing here used to silently hand the login
        // off to the system browser, where Centrio has no way to receive a
        // third-party messenger site's session back. Just surface Google's
        // own rejection page instead — visible and honest about what
        // happened, rather than a login that quietly vanishes elsewhere.
        log.error('[oauth-broker] Google embedded-browser rejection page detected — leaving popup open (no external-browser fallback)')
        if (!popup.isDestroyed() && !popup.isVisible()) {
            popup.show()
            popup.focus()
        }
    }
    popup.webContents.on('did-navigate', (_event, navUrl) => checkGoogleRejection(navUrl))
    popup.webContents.on('did-finish-load', () => checkGoogleRejection(popup.webContents.getURL()))
    // BUGFIX (live-reproduced 2026-08-24, Grok/xAI "Sign in with Google" —
    // full [oauth-broker][DEBUG] log for this exact popup showed the initial
    // load of accounts.google.com/v3/signin/identifier and then NOTHING
    // else: no further did-navigate, no did-finish-load, no did-fail-load,
    // no "Google embedded-browser rejection page detected" — yet the user
    // watched the popup go on to show Google's "Не удалось войти в аккаунт"
    // page. accounts.google.com's own sign-in flow is a client-side SPA
    // past the very first load: picking an account, entering a password,
    // and — critically — the embedded-browser rejection screen itself are
    // all rendered via History API pushState, not a fresh top-level
    // navigation, so they only ever fire 'did-navigate-in-page'. That event
    // was already wired for maybeFinishOAuth() above (same class of gap,
    // already fixed there) but never for checkGoogleRejection() — this was
    // simply the one remaining unhandled event flavor, not a re-regression
    // of the UA/userAgentData spoofing (see oauthPopupPreload.js), which
    // stayed unchanged and unproven-broken by this repro.
    popup.webContents.on('did-navigate-in-page', (_event, navUrl) => checkGoogleRejection(navUrl))

    // BUGFIX (2026-08-24, Grok/xAI "Sign in with Google" — user saw "Не
    // удалось войти в аккаунт" on a LIVE retest of the did-navigate-in-page
    // fix above, and [oauth-broker][DEBUG] log for that exact popup proved
    // it: after the initial load of /v3/signin/identifier, there is
    // LITERALLY NOTHING further logged for this popup — no did-navigate, no
    // did-finish-load, no did-navigate-in-page, no rejection detected, ever
    // — while the user watched the popup's content change to the rejection
    // message. So none of the three navigation-flavored events this relies
    // on ever fired at all, meaning the rejection isn't rendered via a
    // navigation, hash change, or History API call (pushState/replaceState)
    // the way the account-picker/password/2FA steps are — it's most likely
    // a plain DOM swap done by Google's own client JS after an async
    // browser-trust check (e.g. a delayed navigator.userAgentData /
    // Client-Hints round-trip), at the SAME URL, with no history entry at
    // all. No Electron navigation event exists to hook for that case.
    // Falling back to a cheap poll instead of chasing a fourth specific
    // event that may not exist: check the popup's rendered text on a short
    // interval for as long as it's still sitting on a Google host and
    // hasn't already finished/closed. checkGoogleRejection() is already
    // idempotent (no-ops instantly once googleRejectionHandled is set or
    // the popup is destroyed), so this is safe to run alongside the
    // event-based checks above without double-handling anything.
    let googleRejectionPollInFlight = false
    const GOOGLE_REJECTION_POLL_MS = 1500
    const googleRejectionPollTimer = setInterval(() => {
        if (popup.isDestroyed() || googleRejectionHandled) {
            clearInterval(googleRejectionPollTimer)
            return
        }
        if (googleRejectionPollInFlight) return
        googleRejectionPollInFlight = true
        Promise.resolve(checkGoogleRejection(popup.webContents.getURL())).finally(() => {
            googleRejectionPollInFlight = false
        })
    }, GOOGLE_REJECTION_POLL_MS)
    popup.once('closed', () => clearInterval(googleRejectionPollTimer))

    popup.once('ready-to-show', () => {
        popup.show()
        popup.focus()
    })

    return { hasStartedDownload: () => hasStartedDownload }
}

// Вынесено из ipcMain-хендлера 'open-popup-window' в отдельную
// экспортируемую функцию, чтобы main/bootstrap/registerAppEvents.js мог
// вызвать её напрямую (без IPC-круга через renderer) из
// contents.setWindowOpenHandler() на уровне гостевого webContents webview —
// см. комментарий там про то, почему 'new-window' DOM-событие на <webview>
// (единственный путь, которым раньше сюда попадал OAuth-брокер) на текущей
// версии Electron больше не работает.
//
// ВАЖНО: этот путь (ручной `new BrowserWindow()`) остаётся в силе для
// случаев БЕЗ настоящего window.open() — top-level редирект на OAuth-провайдер
// (will-navigate в webview-tabs-bind.js) и OAuth внутри sub-frame/iframe
// (will-frame-navigate в registerAppEvents.js). У обоих в принципе нет
// естественного window.opener (это не popup, это либо сама вкладка, либо
// чужой iframe) — так что рефакторить их под нативный allow-попап не имеет
// смысла, вынесенный выше wireOAuthPopup() тут просто переиспользуется.
async function createPopupWindow(url, opts = {}, getMainWindow) {
    // DEBUG (Gmail/Grok duplicate-window investigation): every single caller
    // of createPopupWindow() (setWindowOpenHandler doesn't count — it never
    // reaches this function, see BUGFIX comment on activeOAuthBrokerMessengerIds
    // above) now logs here, closing the blind spot that let the renderer's
    // unguarded will-navigate → open-popup-window IPC path hide from the
    // previous round of [oauth-broker][DEBUG] logging.
    log.info(`[oauth-broker][DEBUG] createPopupWindow url=${url} partition=${opts.partition} returnHost=${opts.returnHost}`)
    // Set once the guard below is actually marked active — used as a safety
    // net in the catch{} at the bottom to release it if construction throws
    // before the popup's own 'closed' listener ever gets registered.
    let guardedMessengerId = null
    try {
        const w = opts.width  || 400
        const h = opts.height || 600

        const mainWin = getMainWindow ? getMainWindow() : null
        let x, y
        if (mainWin && !mainWin.isDestroyed()) {
            const [mx, my] = mainWin.getPosition()
            const [mw, mh] = mainWin.getSize()
            x = mx + mw - w - 20
            y = my + mh - h - 60
        }

        // Расширения (напр. Translate popup) грузятся в per-messenger сессию
        // (persist:<messengerId>), см. main/services/extensions.js. Без явного
        // указания той же session partition popup открылся бы в defaultSession —
        // расширение там не загружено, chrome.tabs не увидит webview мессенджера.
        // Разрешаем кастомную session ТОЛЬКО для partition реально существующего
        // мессенджера — иначе игнорируем opts.partition, чтобы этот generic-канал
        // нельзя было использовать для открытия произвольного URL в произвольной
        // persisted-сессии.
        //
        // BUGFIX (item #1 — popups falling through to the external browser):
        // this partition-sharing used to be gated on `url.startsWith('chrome-extension://')`,
        // so any regular http(s) window.open() from a messenger webview (call/
        // meeting windows, share dialogs, "sign in with X" popups, ...) never
        // qualified and fell through to shell.openExternal() in a logged-out
        // default browser profile instead. The scheme check added no real
        // security value on its own (the partition allowlist below is what
        // actually prevents session hijacking) — dropped it so any URL can
        // share a *known* messenger's own partition.
        const webPreferences = {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }

        let isSharedMessengerSession = false
        if (typeof opts.partition === 'string') {
            const messengers = store.get('messengers', []) || []
            const isKnownPartition = messengers.some((m) => m && m.id && `persist:${m.id}` === opts.partition)
            if (isKnownPartition) {
                webPreferences.session = session.fromPartition(opts.partition)
                isSharedMessengerSession = true
            }
        }

        // ── OAuth broker mode (item #6, renderer/webview-tabs-bind.js /
        // main/bootstrap/registerAppEvents.js) ──
        // Google (and most other providers) refuse to complete sign-in
        // inside an Electron <webview> guest page — it gets detected as
        // an embedded browser and rejected outright ("This browser or
        // app may not be secure"), which is why "Sign in with Google"
        // clicked inside a messenger webview used to just hang. A real
        // popup BrowserWindow sharing the messenger's session (see
        // isSharedMessengerSession above) passes that detection as long
        // as it also presents a normal desktop Chrome UA. opts.returnHost
        // is validated as a bare hostname — it is only ever compared
        // against navigation targets below, never used to build a URL or
        // navigate anywhere itself.
        const isOAuthBroker = isSharedMessengerSession &&
            typeof opts.returnHost === 'string' &&
            /^[a-z0-9.-]+$/i.test(opts.returnHost)

        // See BUGFIX comment on activeOAuthBrokerMessengerIds near the top of
        // this file — this is the guard closing the gap that let the
        // renderer's unguarded will-navigate path (webview-tabs-bind.js)
        // open a second, independent OAuth broker popup concurrently with
        // one already opened via will-frame-navigate/setWindowOpenHandler in
        // registerAppEvents.js. Checked BEFORE the BrowserWindow itself is
        // constructed below, so a duplicate call is swallowed with no
        // visible window at all (matches the existing behavior of the other
        // two entry points, which also just no-op/deny on a held guard).
        const oauthMessengerId = isOAuthBroker ? messengerIdFromPartition(opts.partition) : null
        if (isOAuthBroker && oauthMessengerId && isOAuthBrokerActive(oauthMessengerId)) {
            log.info(`[oauth-broker][DEBUG] createPopupWindow swallowed duplicate — guard already held for messengerId=${oauthMessengerId}`)
            return { success: false, error: 'oauth-broker-already-open' }
        }
        if (isOAuthBroker && oauthMessengerId) {
            markOAuthBrokerActive(oauthMessengerId)
            guardedMessengerId = oauthMessengerId
        }

        // BUGFIX ("Не удалось войти в аккаунт" всё ещё показывается внутри
        // самого попапа) — см. подробный комментарий в
        // main/services/oauthPopupPreload.js: тот же разрыв про
        // navigator.userAgentData, что уже был исправлен для вкладки
        // мессенджера через webview-preload.js, но не для этого попапа.
        if (isOAuthBroker) {
            webPreferences.preload = path.join(__dirname, '..', 'services', 'oauthPopupPreload.js')
        }

        // BUGFIX (2026-08-25, "после входа в Яндекс/Грок зависает — ничего
        // не нажимается вообще, помогает только перезапуск" — live-reported
        // AFTER confirming via [oauth-broker][DEBUG] log that the OAuth flow
        // itself completes correctly and maybeFinishOAuth()/popup.close() do
        // fire): this popup was created with no `parent` at all — a fully
        // independent top-level BrowserWindow, unrelated to mainWin as far
        // as Windows' own window manager is concerned, despite being
        // alwaysOnTop + skipTaskbar + toggled show:false→show()/hide() at
        // various points in its lifecycle (see the download/ready-to-show
        // handling below). Without an explicit owner, Windows has no
        // "return focus/activation to the owner" behavior to fall back on
        // when this window is destroyed — which window (if any) reclaims
        // input focus after popup.close() is then undefined, and in
        // practice can leave mainWin visible but never reactivated, which
        // looks exactly like "as if something is covering it" even though
        // no DOM overlay is actually stuck (both existing overlay
        // mechanisms — .oauth-popup-overlay and .popup-backdrop — are
        // geometrically scoped to #tabsContent/#contentArea and can't
        // explain sidebar buttons also being unresponsive). Setting
        // `parent: mainWin` is the standard Electron/Windows fix for this
        // class of bug: it makes this popup a properly OS-owned child
        // window, so closing it reliably hands activation back to its
        // owner. Not `modal` — mainWin stays fully interactive the whole
        // time the popup is open, exactly as before.
        //
        // BUGFIX (2026-08-25, live retest of the `parent` fix above: "не
        // помогло, зависание не прекратилось" — same categorical freeze,
        // both for Yandex and Grok): `parent` alone wasn't enough. This
        // popup was ALSO created with `alwaysOnTop: true` — a leftover
        // from before `parent` existed, when it was the only way to force
        // the popup above mainWin. `alwaysOnTop` (HWND_TOPMOST on Windows)
        // puts a window in a separate z-order band from normal/owned
        // windows, and there's a well-known class of Windows/Chromium bug
        // where a topmost window's automatic "return focus to owner on
        // destroy" behavior doesn't fire reliably — the two flags fight
        // over how Windows decides who gets activation next. Now that
        // `parent` exists, `alwaysOnTop` is redundant for stacking anyway:
        // an owned window is already always drawn above its owner by
        // Windows without needing the topmost flag. Dropped entirely.
        // FEATURE (2026-08-26, Franz-style OAuth popup chrome — live user
        // request with reference screenshot): only the OAuth-broker branch
        // gets the wider/taller frameless treatment. Other callers of this
        // function (call/meeting popups, share dialogs, plain window.open()
        // targets) keep the original native-framed small window untouched —
        // this is not a redesign of "every popup", only of the OAuth broker.
        let popupWidth = w, popupHeight = h, popupX = x, popupY = y
        if (isOAuthBroker) {
            popupWidth = OAUTH_POPUP_WIDTH
            popupHeight = OAUTH_POPUP_HEIGHT
            if (mainWin && !mainWin.isDestroyed()) {
                const [mx, my] = mainWin.getPosition()
                const [mw, mh] = mainWin.getSize()
                popupX = mx + Math.round((mw - popupWidth) / 2)
                popupY = my + Math.round((mh - popupHeight) / 2)
            }
        }
        const popup = new BrowserWindow({
            width: popupWidth, height: popupHeight, x: popupX, y: popupY,
            title: opts.name || 'Centrio',
            frame: !isOAuthBroker,
            resizable: true,
            minimizable: isOAuthBroker, maximizable: isOAuthBroker,
            skipTaskbar: true, show: false,
            parent: (mainWin && !mainWin.isDestroyed()) ? mainWin : undefined,
            webPreferences
        })

        popup.setMenuBarVisibility(false)

        // BUGFIX ("лишнее окно при скачивании файла"): a messenger's
        // download link often fires window.open()/target=_blank rather
        // than a plain same-tab navigation (call/meeting windows and
        // "open in new tab" download buttons both do this) — that's what
        // routes it through createPopupWindow in the first place (see
        // the BUGFIX comment above 'new-window' in webview-tabs-bind.js and
        // setWindowOpenHandler in registerAppEvents.js). But a download
        // isn't a page: the popup's own navigation to that URL resolves to
        // a file save, not content to display, so it never gets anything to
        // show and just sits there empty. The actual download itself still
        // works correctly — this session is the same persist:<messengerId>
        // session object the messenger's webview already uses, already
        // wired to Centrio's download manager via wireSessionDownloads() at
        // webview attach time — so there's nothing to fix about the download
        // path, only about the now-pointless blank window left behind.
        // session-level 'will-download' fires for the whole partition, not
        // just this popup, so the webContents argument scopes the close to
        // downloads THIS popup itself triggered.
        // session.fromPartition() returns the same singleton across every
        // popup ever opened for this messenger — without removing this
        // listener on close, each popup would leak one more 'will-download'
        // listener onto that shared session for the rest of the app's
        // lifetime.
        let hasStartedDownload = false
        const popupSession = popup.webContents.session
        const onSessionDownload = (_e, item, downloadWebContents) => {
            if (downloadWebContents === popup.webContents) {
                hasStartedDownload = true
                // BUGFIX ("при скачивании открывает окно пустое белое" —
                // live-reproduced by the user, not fixed by the plain
                // popup.close() this used to do): when no save path has
                // been set by the time this handler returns (true
                // whenever "спрашивать куда сохранять" is on), Electron
                // auto-shows a native OS "Save As" dialog owned by
                // *this* popup window. That dialog is a modal attached
                // to the popup — Windows refuses to actually close an
                // owner window while it still owns an open native
                // dialog, so the popup.close() call below silently lost
                // that race and the blank popup stayed on screen behind
                // the save dialog indefinitely. Hiding is synchronous
                // and wins the race every time (no window to attach the
                // dialog to visibly), and we only destroy the popup once
                // the download is actually done (saved/cancelled/failed),
                // well after any save dialog has resolved.
                if (!popup.isDestroyed()) popup.hide()
                if (item) {
                    item.once('done', () => {
                        if (!popup.isDestroyed()) popup.close()
                    })
                } else if (!popup.isDestroyed()) {
                    popup.close()
                }
            }
        }
        popupSession.on('will-download', onSessionDownload)
        popup.once('closed', () => popupSession.removeListener('will-download', onSessionDownload))

        // Lets callers (the OAuth-broker single-flight guard in
        // main/bootstrap/registerAppEvents.js) know when this popup is gone,
        // since createPopupWindow never otherwise exposes the popup
        // instance itself back to the caller.
        if (typeof opts.onClosed === 'function') {
            popup.once('closed', () => {
                log.info(`[oauth-broker][DEBUG] popup closed url=${url}`)
                try { opts.onClosed() } catch {}
            })
        }

        // Releases the guard set just above (isOAuthBroker && oauthMessengerId
        // branch) — independent of opts.onClosed, which callers may or may
        // not pass. Guaranteed to run regardless of how the popup closes
        // (successful hand-off via maybeFinishOAuth in wireOAuthPopup(),
        // user closing it manually, or a load failure).
        if (isOAuthBroker && oauthMessengerId) {
            popup.once('closed', () => clearOAuthBrokerActive(oauthMessengerId))
        }

        if (isOAuthBroker) {
            // Все UA-спуфинг/ретрай/детект-отказа-Google/показ-по-готовности
            // теперь живут в общей wireOAuthPopup() выше — этот код-путь
            // (ручной BrowserWindow, вызываемый из will-navigate/
            // will-frame-navigate, где нет window.opener) переиспользует ту
            // же логику, что и нативно созданный попап из
            // contents.setWindowOpenHandler() в registerAppEvents.js.
            wireOAuthPopup(popup, { url, mainWin, partition: opts.partition })
        } else {
            // BUGFIX ("куда ни нажми — открывает не пойми где, чаще в
            // браузере"; и отдельно — вход через OAuth-провайдера, не
            // входящего в жёстко зашитый список в oauthProviders.js,
            // безвозвратно терял сессию — live user report): раньше ЛЮБАЯ
            // навигация внутри этого попапа (даже безобидный редирект —
            // трекер, cookie-consent, http→https, региональный редирект —
            // они есть почти на каждой ссылке в интернете) считалась "надо
            // уйти из приложения" и мгновенно улетала в системный браузер, а
            // попап закрывался. Для обычной ссылки, шаренной в чате, это
            // выглядело как "почти ничего не открывается внутри, всё летит
            // в браузер". Для OAuth-провайдера, не входящего в
            // OAUTH_PROVIDER_HOST_RE (Facebook, Discord, GitHub, Twitter/X,
            // LinkedIn, Mail.ru, OK.ru, oauth.telegram.org и т.д. — сюда
            // попадает isOAuthBroker === false), это было ещё хуже: самый
            // первый редирект логин-флоу (который бывает практически
            // всегда, даже при успешном входе) мгновенно выкидывал
            // пользователя в системный браузер СРЕДИ авторизации — а
            // передать сессию/токен обратно оттуда физически нечем (в
            // отличие от centrio://auth, у стороннего сайта мессенджера нет
            // зарегистрированного протокол-хендлера для возврата). Теперь
            // попап ведёт себя как обычное мини-окно браузера — свободно
            // навигируется и показывает контент внутри себя (тот же
            // паттерн, что и в Grok/Franz), вложенный window.open()
            // подгружается в то же самое окно вместо ещё одного попапа или
            // системного браузера.
            popup.webContents.setWindowOpenHandler(({ url: newUrl }) => {
                if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
                    popup.webContents.loadURL(newUrl).catch(() => {})
                }
                return { action: 'deny' }
            })

            // BUGFIX ("при скачивании в MAX открывает окно пустое белое"):
            // the will-download close-on-download handler above only fires
            // once Chromium's download machinery actually kicks in. Some
            // messengers' "download" links resolve through an intermediate
            // page first (token exchange, auth redirect, a page that itself
            // triggers the real download via script) rather than a direct
            // Content-Disposition response — and when that intermediate step
            // fails to run correctly outside the original page's context
            // (missing referrer, SPA state the popup never got, ...), the
            // popup just sits there rendering an empty body forever. Showing
            // it the instant Chromium has *anything* to paint ('ready-to-show'
            // fires even for a blank body) is what turned that failure mode
            // into a visible stuck white window.
            const POPUP_SHOW_GRACE_MS = 900
            popup.once('ready-to-show', () => {
                setTimeout(async () => {
                    if (hasStartedDownload || popup.isDestroyed()) return

                    let hasVisibleContent = true
                    try {
                        const textLength = await popup.webContents.executeJavaScript(
                            'document.body ? document.body.innerText.trim().length : 0'
                        )
                        hasVisibleContent = textLength > 0
                    } catch {
                        // If we can't inspect the page, err on the side of
                        // showing it rather than silently swallowing a
                        // legitimate popup (share dialog, meeting window, ...).
                    }

                    if (popup.isDestroyed()) return

                    if (!hasVisibleContent && !hasStartedDownload) {
                        // Nothing rendered and no download started — almost
                        // certainly the failed-intermediate-page case above,
                        // not a real page the user needs to see.
                        popup.close()
                        return
                    }

                    popup.show()
                    popup.focus()
                }, POPUP_SHOW_GRACE_MS)
            })
        }

        popup.loadURL(url)
            .catch(e => log.error('[popup] loadURL failed:', e.message))

        return { success: true }
    } catch (e) {
        // Safety net: if the guard was marked but something threw before the
        // popup's own 'closed' listener got registered (e.g. BrowserWindow
        // construction itself failing), release it here instead of leaking
        // it forever and permanently blocking this messenger's OAuth broker.
        if (guardedMessengerId) clearOAuthBrokerActive(guardedMessengerId)
        log.error('[popup] error:', e.message)
        return { success: false, error: e.message }
    }
}

function registerWindowIpc({ getMainWindow, isQuittingRef }) {
    // expose getMainWindow for popup-window handler
    const _getMainWindow = getMainWindow
    safeOn('minimize-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (win && !win.isDestroyed()) {
            win.minimize()

            // Check for lock on minimize
            const settings = store.get('settings', {})
            const security = store.get('security', {})

            if ((settings.lockOnHide || security.lockOnHide) && isPasswordEnabled(security)) {
                win.webContents.send('show-lock-screen')
            }
        }
    })

    safeOn('maximize-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (!win || win.isDestroyed()) return

        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
    })

    safeOn('close-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (win && !win.isDestroyed()) win.close()
    })

    safeOn('quit-app', (_event, relaunch = false) => {
        isQuittingRef.value = true
        if (relaunch) app.relaunch()
        app.quit()
    })

    safeOn('hide-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (win && !win.isDestroyed()) {
            win.hide()

            // Check for lock on hide (tray behavior)
            const settings = store.get('settings', {})
            const security = store.get('security', {})

            if ((settings.lockOnHide || security.lockOnHide) && isPasswordEnabled(security)) {
                win.webContents.send('show-lock-screen')
            }
        }
    })

    safeOn('toggle-fullscreen', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (win && !win.isDestroyed()) {
            win.setFullScreen(!win.isFullScreen())
        }
    })

    safeOn('set-app-zoom', (event, level) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
        if (!win || win.isDestroyed()) return

        const zoomLevel = Number(level)
        if (!Number.isFinite(zoomLevel)) return
        // Clamp to a safe range: Electron allows -8 to 8, we restrict further
        const clamped = Math.max(-3, Math.min(3, zoomLevel))
        win.webContents.setZoomLevel(clamped)
    })

    safeOn('open-url', async (_event, url) => {
        if (!url || typeof url !== 'string') return

        // Only allow safe external protocols.
        // 'tg:' added for the deep-link fallback path (renderer/messengers.js,
        // webview-preload.js): when a user clicks a tg://resolve?domain=...
        // link and no Telegram tab is open in-app, we hand off to whatever the
        // OS has registered for tg:// (mirrors normal browser behavior) instead
        // of silently dropping it. Still an explicit allowlist entry, not a
        // wildcard — every other scheme remains blocked exactly as before.
        const ALLOWED_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:', 'tg:']
        // SECURITY (2026-08-26, deep-link review finding): this 'open-url'
        // channel is reachable WITHOUT the isTrusted/user-gesture gate that
        // protects the auto-tab-switch deep-link path — webview-preload.js's
        // target="_blank" click handler and renderer/webview-tabs-bind.js's
        // 'new-window' listener both forward here unconditionally, so a
        // synthetic (non-isTrusted) click or a bare window.open() call from
        // ANY guest page's script — no user interaction required — can reach
        // this handler with an attacker-chosen 'tg:' URL. Before this fix,
        // any tg:// shape was allowed through to shell.openExternal(), which
        // launches whatever the OS has registered as the tg:// handler
        // (often Centrio itself, or a real Telegram Desktop install) with
        // fully attacker-controlled content — the opposite of what the
        // isTrusted gate is meant to guarantee. Restrict 'tg:' specifically
        // (other schemes here are already no more powerful than a normal
        // browser link) to the same narrow, anchored shapes already trusted
        // elsewhere in the deep-link feature (tg://resolve?domain=...,
        // tg://join?invite=...) instead of trusting the bare scheme.
        const SAFE_TG_SHAPE_RE = /^tg:\/\/(resolve(\?|$)|join\?invite=)/i
        try {
            const parsed = new URL(url)
            if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
                console.warn('[security] open-url blocked — disallowed scheme:', parsed.protocol, url)
                return
            }
            if (parsed.protocol === 'tg:' && !SAFE_TG_SHAPE_RE.test(url)) {
                console.warn('[security] open-url blocked — unrecognized tg:// shape:', url)
                return
            }
        } catch {
            console.warn('[security] open-url blocked — invalid URL:', url)
            return
        }

        try {
            // DEBUG (2026-08-24, "Яндекс сам открывает браузер" — see
            // matching comments in registerAppEvents.js's
            // browser-window-created / did-create-window fallback):
            // candidate #3 — this is the shared 'open-url' IPC channel that
            // webview-preload.js's link-click interception and
            // renderer/messengers.js's 'new-window'/'will-navigate' guest
            // handlers both send straight to, bypassing the OAuth broker
            // entirely. shell.openExternal() below was silent on success
            // everywhere in the codebase, so this specific user report
            // (popup sign-in succeeds, then an external browser also opens)
            // couldn't be pinned to a call site from existing logs alone.
            log.info(`[oauth-broker][DEBUG] open-url IPC → shell.openExternal url=${url}`)
            await shell.openExternal(url)
        } catch (error) {
            console.error('open-url error:', error)
        }
    })

    safeHandle('open-popup-window', async (_event, url, opts = {}) => createPopupWindow(url, opts, _getMainWindow))

    safeOn('open-translate-window', (_event, text) => {
        try {
            const url = `https://translate.google.com/?sl=auto&tl=ru&text=${encodeURIComponent(text || '')}&op=translate`
            const mainWin = _getMainWindow()
            let x, y
            if (mainWin && !mainWin.isDestroyed()) {
                const [mx, my] = mainWin.getPosition()
                const [mw, mh] = mainWin.getSize()
                x = mx + Math.floor((mw - 800) / 2)
                y = my + Math.floor((mh - 600) / 2)
            }
            const popup = new BrowserWindow({
                width: 800, height: 600, x, y,
                title: 'Translate',
                resizable: true, minimizable: true, maximizable: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    // SECURITY: sandbox wasn't set here (unlike the equivalent
                    // open-popup-window handler above), leaving this renderer
                    // running without Chromium's OS-level sandbox for no reason —
                    // translate.google.com needs no Node/Electron API access.
                    sandbox: true,
                    partition: 'persist:translate'
                }
            })
            popup.setMenuBarVisibility(false)
            popup.webContents.setWindowOpenHandler(({ url: newUrl }) => {
                if (newUrl.startsWith('https://translate.google')) return { action: 'allow' }
                shell.openExternal(newUrl).catch(() => {})
                return { action: 'deny' }
            })
            popup.loadURL(url).catch(e => log.error('[translate] loadURL failed:', e.message))
        } catch (e) {
            log.error('[translate] error:', e.message)
        }
    })

    safeHandle('get-window-visibility-state', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()

        if (!win || win.isDestroyed()) {
            return {
                visible: false,
                focused: false,
                minimized: false
            }
        }

        return {
            visible: win.isVisible(),
            focused: win.isFocused(),
            minimized: win.isMinimized()
        }
    })

    safeHandle('app:getVersion', () => {
        return app.getVersion()
    })

    // ── Screen-lock PIN hashing (see main/services/pinHash.js) ─────────────
    // Done here in the main process, not in the renderer, because the
    // renderer runs with nodeIntegration:false + contextIsolation:true and
    // has no way to reach Node's `crypto` module (scryptSync) for a real KDF.
    // The renderer only ever handles the plaintext PIN transiently in memory
    // during entry — it never computes or stores the hash itself.
    safeHandle('security:hash-pin', (_event, pin) => {
        if (typeof pin !== 'string' || pin.length === 0) {
            throw new Error('Invalid PIN')
        }
        // Хэшировать новый PIN разрешено только когда СЕЙЧАС никакой PIN не
        // защищает экран блокировки — легитимный UI (renderer/lock.js
        // savePinClick) физически не может дойти сюда, пока старый PIN не
        // отключён через verify-pin (см. checkbox-обработчик в
        // settings-bind.js). Если hash уже есть, это store:set('security',
        // {...}) в обход verify-pin не даст ничего сделать без гранта —
        // см. store:set в main.js и pinGrant.js.
        const security = store.get('security', {}) || {}
        if (!security.hash) grantSecurityChange()
        return pinHash.hashPin(pin)
    })

    // SECURITY (2026-09-06, аудит): раньше здесь не было вообще никакой
    // защиты от подбора — а поскольку ipcMain.handle-каналы можно было
    // дёргать напрямую в обход UI (см. фикс electronAPI.invoke() выше по
    // истории этой же сессии), 4-значный PIN подбирался бы циклом из
    // renderer-контекста за секунды. Простой счётчик неудачных попыток +
    // временная блокировка в памяти процесса — этого достаточно для
    // локальной угрозы (кто-то с доступом к уже открытому приложению), не
    // претендует на защиту от перезапуска main-процесса.
    const PIN_MAX_ATTEMPTS = 5
    const PIN_LOCKOUT_MS = 30 * 1000
    let pinFailCount = 0
    let pinLockedUntil = 0

    // Verifies a PIN against store.get('security').hash. Transparently
    // migrates old-format (pre-scrypt) hashes to the new format on a
    // successful match — see verifyPin()'s `needsMigration` contract in
    // pinHash.js. Never throws on a wrong PIN; returns { valid: false }.
    safeHandle('security:verify-pin', (_event, pin) => {
        if (typeof pin !== 'string' || pin.length === 0) return { valid: false }

        if (Date.now() < pinLockedUntil) return { valid: false }

        const security = store.get('security', {}) || {}
        const result = pinHash.verifyPin(pin, security.hash)

        if (!result.valid) {
            pinFailCount += 1
            if (pinFailCount >= PIN_MAX_ATTEMPTS) {
                pinLockedUntil = Date.now() + PIN_LOCKOUT_MS
                pinFailCount = 0
            }
            return { valid: false }
        }

        pinFailCount = 0
        grantSecurityChange()
        if (result.needsMigration) {
            try {
                store.set('security', { ...security, hash: pinHash.hashPin(pin) })
            } catch (e) {
                log.error('[security] PIN hash migration failed:', e.message)
            }
        }

        return { valid: true }
    })

    // ── Автоблокировка при бездействии ────────────────────────────────────
    // Используем powerMonitor.getSystemIdleTime() — это OS-level счётчик
    // (секунды с последнего ввода мыши/клавиатуры во всей системе), а не
    // DOM-события в renderer. Это принципиально важно: активность ВНУТРИ
    // <webview> (переписка в мессенджере) не долетает до host-документа
    // как обычное DOM-событие (webview — изолированный гостевой процесс),
    // поэтому слушать mousemove/keydown на renderer document давало бы
    // ложные блокировки прямо во время набора сообщения. OS-level idle
    // time не имеет этой проблемы — он видит ввод независимо от того,
    // какой процесс/фрейм принял фокус.
    let lastIdleLockSentAt = 0
    setInterval(() => {
        try {
            const security = store.get('security', {}) || {}
            const minutes = Number(security.lockOnIdleMinutes) || 0
            if (minutes <= 0) return
            if (!security.enabled || !security.hash) return

            const win = getMainWindow()
            if (!win || win.isDestroyed()) return

            const idleSeconds = powerMonitor.getSystemIdleTime()
            if (idleSeconds < minutes * 60) return

            // Не спамим show-lock-screen чаще раза в минуту — пока пользователь
            // не пошевелит мышью, idleSeconds продолжит расти и мы будем сюда
            // попадать на каждом тике интервала.
            const now = Date.now()
            if (now - lastIdleLockSentAt < 60000) return
            lastIdleLockSentAt = now

            win.webContents.send('show-lock-screen')
        } catch (e) {
            log.error('[idle-lock] check failed:', e.message)
        }
    }, 20000)
}

module.exports = registerWindowIpc
module.exports.createPopupWindow = createPopupWindow
module.exports.wireOAuthPopup = wireOAuthPopup
module.exports.ensureGoogleAccountsWebAuthnBlock = ensureGoogleAccountsWebAuthnBlock
module.exports.isGoogleAccountsUrl = isGoogleAccountsUrl
module.exports.isOAuthBrokerActive = isOAuthBrokerActive
module.exports.markOAuthBrokerActive = markOAuthBrokerActive
module.exports.clearOAuthBrokerActive = clearOAuthBrokerActive