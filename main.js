require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { app, ipcMain, BrowserWindow, protocol, Menu } = require('electron')

// BUGFIX (Mac): голое Menu.setApplicationMenu(null) на macOS ломает
// буфер обмена целиком — Cmd+C/Cmd+V (и остальные системные акселераторы)
// на macOS диспетчеризуются через application menu ролей copy/paste/cut/
// selectAll, а не независимо от него, как на Windows/Linux. Без Edit-меню
// эти сочетания не срабатывают нигде в приложении, включая обычные текстовые
// поля внутри мессенджеров-webview — отсюда жалобы "не работают вообще
// никакие сочетания клавиш". role: 'appMenu'/'editMenu' — встроенные
// Electron-роли, дают стандартный минимальный Mac-меню-бар (About/Hide/Quit
// + Undo/Redo/Cut/Copy/Paste/SelectAll) без необходимости расписывать пункты
// вручную. На Windows/Linux экономия места на меню не нужна — там эти
// сочетания и так работают через сам webview/OS, оставляем как было (null).
if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' }
    ]))
} else {
    Menu.setApplicationMenu(null)
}


// ── GPU / compositing fixes (must run before app.whenReady) ──────────────────
// BUGFIX ("Грок открывает 2 окна" при входе через Google — live-reported;
// то же семейство проблем, что и "Не удалось войти в аккаунт"): начиная с
// Chromium ~108 Google Identity Services переключает "Sign in with Google"
// на FedCM (Federated Credential Management), если браузер его
// поддерживает — а этот Electron (39.x → Chromium 130+) поддерживает
// полностью. FedCM рендерит выбор аккаунта/пасскей-запрос НЕ как обычную
// страницу/iframe/window.open(), а как chrome-level UI прямо поверх
// вьюпорта (тот самый "Windows Hello"-подобный native-диалог) — этот слой
// в принципе недостижим ни для will-navigate/will-frame-navigate/
// setWindowOpenHandler в registerAppEvents.js, ни для preload-инъекции в
// webview-preload.js/oauthPopupPreload.js: там просто нечего перехватывать,
// это не DOM и не отдельное BrowserWindow. Внутри вложенного <webview>
// (тем более без нативного window-хрома вокруг вьюпорта) это либо не
// рендерится вовсе, либо рендерится некорректно поверх страницы — отсюда
// "вторая карточка", о которой сообщил пользователь, одновременно с уже
// штатно открывшимся OAuth-попапом (createPopupWindow/setWindowOpenHandler
// ниже). Отключаем FedCM целиком через фичефлаг Chromium — Google сам
// откатывается на классический flow (iframe/window.open на
// accounts.google.com), который уже полностью обрабатывается существующим
// OAuth-брокером (will-frame-navigate + setWindowOpenHandler +
// oauthPopupPreload.js). Это НЕ отключает вход через Google — только
// заставляет его идти по уже поддерживаемому пути.
//
// BUGFIX (2026-08-25, "Google запрашивает ключ у Windows на любой
// авторизации, не только в Grok, на разных компьютерах" — live retest of the
// JS-level fix in webview-preload.js/oauthPopupPreload.js showed it did NOT
// stop the prompt): that fix overrides `PublicKeyCredential.
// isConditionalMediationAvailable()` and short-circuits `navigator.
// credentials.get({mediation:'conditional'})` from PAGE JavaScript — but on
// Chromium, "conditional UI" passkey autofill isn't only triggered by an
// explicit page-JS call. Chromium's own autofill layer can watch
// username/password `<input>` fields and offer/launch the platform
// authenticator (Windows Hello) itself once such a field is focused, even
// if the page's own script never calls the WebAuthn API — this is a
// browser-native feature, not something a page-context script override can
// intercept, which is exactly why the earlier JS-only fix didn't hold.
// `WebAuthenticationConditionalUI` is the actual Chromium feature flag
// gating this browser-level behavior — disabling it at the engine level
// (same mechanism already used for FedCM above) removes the trigger
// entirely, regardless of which code path (page JS or browser-native
// autofill) would have fired it. Kept alongside the existing JS-level
// overrides rather than replacing them — belt and suspenders, and the JS
// overrides still matter for any embedded WebView that doesn't share this
// process-wide command-line switch. A deliberate, explicit (non-conditional)
// "sign in with a security key" click is a separate WebAuthn call path and
// is not affected by this flag.
const DISABLED_CHROMIUM_FEATURES = ['FedCm', 'FedCmIdpSigninStatus', 'FedCmMultipleIdentityProviders', 'WebAuthenticationConditionalUI']

if (process.platform === 'win32') {
    // Electron 36+ on Windows: CalculateNativeWinOcclusion can mark the window
    // as hidden → GPU stops presenting frames → black screen.
    // Merged into one --disable-features= call together with the FedCM flags
    // above — Chromium's command-line parsing keeps only the LAST
    // --disable-features value if appendSwitch('disable-features', ...) is
    // called more than once, so a second separate call would have silently
    // dropped this GPU fix instead of adding to it.
    app.commandLine.appendSwitch('disable-features', [...DISABLED_CHROMIUM_FEATURES, 'CalculateNativeWinOcclusion'].join(','))
    // BUGFIX (2026-08-25, "app freezes permanently after an OAuth popup
    // closes" — four prior attempts, see BUGFIX comments in
    // main/ipc/window.js and main/window.js, all live-retested and confirmed
    // NOT to fix it): live diagnosis via CDP `Debugger.pause` against the
    // frozen host window's own renderer process, cross-checked against the
    // main process (Node inspector) and every individual <webview>'s own
    // renderer process, showed the freeze is a genuine native-code block —
    // `Debugger.pause` never fires, meaning the thread isn't executing
    // interpretable JS bytecode at all — and it is isolated ONLY to the host
    // window's own renderer. The main process stayed responsive throughout,
    // and all 9 concurrently-open messenger <webview> tabs (each its own
    // renderer process) kept responding to Runtime.evaluate the entire time.
    // That pattern — one specific window's renderer wedged in native code at
    // exactly the moment Windows hands focus back after an owned child
    // window (the OAuth popup) is destroyed, while the GPU process is
    // otherwise still servicing every other renderer fine — matches a
    // swapchain/compositor deadlock scoped to that one window's own
    // presentation surface, not a GPU-process-wide failure. This flag
    // (forcing the ANGLE D3D11 backend) was added specifically as a
    // swapchain workaround for a DIFFERENT problem and is a known trigger,
    // on some Windows GPU driver combinations, for exactly this class of
    // hang on window activate/restore. Removing it to let Chromium pick its
    // own default ANGLE backend fixed it: live-verified 2026-08-26 via CDP
    // against a fresh build of this exact source, first with an empty store
    // (3/3 popup open/close cycles, mainWin stayed responsive) and then
    // reloaded with a copy of the real production config.json (9 real
    // messenger <webview> guests attached, matching the original repro
    // conditions exactly) — 8/8 open/close cycles across two runs, mainWin
    // stayed fully responsive (executeJavaScript round-trips succeeded)
    // every time. Zero reproductions of the freeze with the flag removed,
    // versus a previously 100%-reproducible hang with it present.
    // D3D11 is Windows-only; do NOT apply on Linux/macOS.
} else {
    app.commandLine.appendSwitch('disable-features', DISABLED_CHROMIUM_FEATURES.join(','))
}
if (process.platform === 'linux') {
    // On Linux (especially VMs / Ubuntu without full GPU support) the GPU
    // sandbox can cause an immediate crash. Disable it for stability.
    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
}
// ─────────────────────────────────────────────────────────────────────────────

// Логирование необработанных ошибок главного процесса
function _writeCrashLog(label, err) {
    try {
        const logDir = app.isReady()
            ? app.getPath('userData')
            : path.join(process.env.APPDATA || '', 'Centrio')
        const logFile = path.join(logDir, 'crash.log')
        const line = `[${new Date().toISOString()}] ${label}: ${err?.stack || err}\n`
        fs.appendFileSync(logFile, line, 'utf8')
        console.error(line)
    } catch {}
}

process.on('uncaughtException', (err) => {
    _writeCrashLog('uncaughtException', err)
})

process.on('unhandledRejection', (reason) => {
    _writeCrashLog('unhandledRejection', reason)
})

// Ошибки из рендерера (window.onerror / unhandledrejection)
ipcMain.on('renderer-error-log', (_event, data) => {
    _writeCrashLog('renderer-js', JSON.stringify(data))
})

// Рендерер просит перестроить tray-меню на текущем языке (после смены языка)
ipcMain.on('update-tray-menu', () => { updateTrayMenu() })

const { APP_USER_MODEL_ID } = require('./main/config/constants')

const {
    createWindow,
    getMainWindow,
    showMainWindow,
    setIsQuittingRef
} = require('./main/window')

const {
    initTray,
    createTray,
    updateTrayMenu
} = require('./main/tray')

const { unregisterShortcuts } = require('./main/services/shortcuts')
const { registerProtocol, handleProtocolUrl } = require('./main/services/protocol')
const { initSingleInstance } = require('./main/services/singleInstance')
const store = require('./main/services/store')
const { consumeSecurityChangeGrant } = require('./main/services/pinGrant')

const registerIpc = require('./main/bootstrap/registerIpc')
const registerAppEvents = require('./main/bootstrap/registerAppEvents')
const initApp = require('./main/bootstrap/initApp')

const isQuittingRef = { value: false }
setIsQuittingRef(isQuittingRef)

initTray({
    getMainWindow,
    showMainWindow,
    isQuittingRef
})

app.setAppUserModelId(APP_USER_MODEL_ID)

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

// ── SECURITY: settings-key schema for store:get/set/delete ──────────────────
// The renderer can call these handlers with an arbitrary key string. Without
// validation, a compromised/exploited renderer (or a bug in a bundled webview
// preload) could read/write electron-store keys never meant to be renderer-
// controlled, or attempt a prototype-pollution-style key (`__proto__`,
// `constructor`, `prototype`) against the underlying conf/lodash path setter.
// Allowlist is built from every store key actually read/written by renderer
// code (renderer.js's `store` shim + renderer/*.js) — keep in sync when a new
// setting is introduced. electron-store supports dot-notation for nested
// values (e.g. "settings.language"), so we only need to allowlist the root
// segment before the first dot.
const ALLOWED_STORE_ROOTS = new Set([
    'settings', 'security', 'cloud', 'extensionsState', 'foldersEnabled',
    'menuCollapsed', 'messengers', 'mutedMessengers', 'globalMuteAll',
    'globalProxy', 'sidebarOrder', 'vpnAppModes', 'vpnActiveLink',
    'vpnSubUrl', 'vpnSubLinks', 'tabZoomLevel', 'appZoomLevel', 'folders',
    'dividers', 'lockOnStartup', 'pinEnabled', 'pinHash', 'split',
    // BUGFIX ("пресеты в сплитах не сохраняются"): these keys were added to
    // split.js/renderer.js well after this allowlist was written for the
    // store:get/set/delete IPC gate. store:set silently returned
    // { success: false } for any key not in this set (see isValidStoreKey
    // below), and the renderer's store.set() shim never inspects that
    // return value — so every splitPresets/pref write was dropped on the
    // floor with zero error surfaced anywhere, no matter how many times the
    // save button was clicked or how the renderer-side save flow was fixed.
    'splitPresets', 'splitLeftPctPref', 'gridRowPctPref', 'gridSidePctPref',
    // BUGFIX ("выбранный мессенджер не сохраняется между перезапусками"):
    // switchTab() in renderer.js needs to persist the active tab id so it can
    // be restored on next launch — same disease as the splitPresets bug above
    // (store:set silently rejected for any key missing from this allowlist).
    'activeTabId',
    // Онбординг-экран первого запуска (renderer/onboarding-auth.js) — same
    // disease as the two bugs above: a new persisted key added without also
    // adding it here silently never gets read or written.
    'onboardingAuthSeen',
    // 14-day Pro trial for onboarding users without an account — see
    // api-device-trial-redeem in main/ipc/api.js and the requirePro()/
    // addMessenger() checks in renderer.js.
    'localProTrialExpiresAt',
    // Expandable left sidebar (icon-only <-> icon+label, Franz-style) —
    // renderer.js applySidebarCollapsed()
    'sidebarBarExpanded',
    // Todos panel in the right sidebar — renderer/todos-bind.js, purely
    // local, never synced to the server.
    'todos',
    // AI-ассистент — режим инференса, BYOK-ключи (зашифрованы через
    // store:secure-* под assistant.byok.<provider>.keyEnc), адрес Ollama,
    // локальная история чата. См. main/services/aiProviders/index.js и
    // renderer/assistant-bind.js. Никогда не синхронизируется с облаком.
    'assistant'
])

const DANGEROUS_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

function isValidStoreKey(key) {
    if (typeof key !== 'string' || key.length === 0) return false
    const segments = key.split('.')
    if (segments.some(seg => DANGEROUS_KEY_SEGMENTS.has(seg))) return false
    return ALLOWED_STORE_ROOTS.has(segments[0])
}

// ── SECURITY: PRO-entitlement keys — writable only from the main process ────
// `cloud.user` (its `.plan`/`.planExpiresAt` fields specifically) and
// `localProTrialExpiresAt` are the sole inputs every PRO-gate in the app
// trusts (renderer.js's hasEffectivePro()/requirePro(), main/ipc/extensions.js's
// isProUser()). Until this fix, both were reachable through the *generic*
// store:set/store:secure-set IPC channel — which isValidStoreKey() above only
// gates by key *root* ('cloud' is a legitimate root for tokens/sync metadata),
// not by value. Any renderer-context JS (trivially: DevTools Console, which
// F12 opens by default — Menu.setApplicationMenu(null) above only removes the
// native menu bar, it doesn't disable devtools) could therefore grant itself
// Pro forever, fully offline, with one line:
//   window.electronAPI.storeSet('cloud.user', {plan: 'PRO', planExpiresAt: '2099-01-01'})
// The same write is achievable by editing the electron-store JSON file on disk
// while the app is closed. See scripts/_check_pro_gating_result.txt and the
// PRO-gating audit for the full writeup.
//
// Fix: these two keys can now only be *set* by main/services/entitlement.js,
// which is called exclusively from main/ipc/api.js and main/ipc/oauth.js
// after main itself receives a response over TLS from the real backend — never
// from data the renderer supplies directly. Reads remain unrestricted (display
// only), and *deletes* remain allowed (logout / clearing a stale trial only
// ever reduces privilege, never grants it).
const PROTECTED_SET_KEYS = new Set(['cloud', 'cloud.user', 'localProTrialExpiresAt'])

// SECURITY: the 4 built-in Pro-gated extension toggles persisted under the
// `extensionsState` store key (see NATIVE_EXTENSIONS in
// renderer/extensions-ui.js) — kept here so the store:set backstop below and
// any future main-process check can share one source of truth instead of
// duplicating the id list.
const NATIVE_EXTENSION_IDS = ['adblock', 'screenshot', 'darkmode', 'split', 'notes']

// SECURITY: free-plan defaults for the Pro-gated theme/accent-color settings
// (settings-bind.js's requirePro('themes')/requirePro('accent') gates the
// picker UI; these are the exact fallback values renderer/settings-ui.js's
// applySettings()/collectSettings() already treat as "no Pro theme/accent
// selected" — keep in sync with FREE_THEME/FREE_ACCENT in renderer.js).
const FREE_THEME = 'embedded'
const FREE_ACCENT = '#7b68ee'

function isProtectedSetKey(key) {
    if (PROTECTED_SET_KEYS.has(key)) return true
    return key.startsWith('cloud.user.')
}

safeHandle('store:get', async (_event, key, def) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:get for disallowed key "${key}"`)
        return def
    }
    try {
        return store.get(key, def)
    } catch (error) {
        console.error(`store:get error for key "${key}"`, error)
        return def
    }
})

safeHandle('store:set', async (_event, key, value) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:set for disallowed key "${key}"`)
        return { success: false, error: 'Disallowed key' }
    }
    if (isProtectedSetKey(key)) {
        console.warn(`[store] Blocked store:set for protected key "${key}" — ` +
            'PRO entitlement is main-process-owned, see main/services/entitlement.js')
        return { success: false, error: 'Protected key' }
    }
    // SECURITY (2026-09-06, аудит): без этого любой renderer-контекст мог
    // напрямую вызвать window.electronAPI.storeSet('security', {enabled:
    // false, hash: null}) и молча снять экран блокировки (или подменить PIN
    // на известный себе), полностью в обход security:verify-pin — легитимный
    // UI (renderer/lock.js/settings-bind.js) уже требует ввести текущий PIN
    // перед отключением, но store:set сам по себе этого не проверял. Когда
    // PIN уже установлен (store.get('security').hash существует), запись
    // разрешается только сразу после успешной security:verify-pin
    // (см. main/services/pinGrant.js — разовый грант на несколько секунд).
    // Первичная настройка PIN (hash ещё не установлен) не требует гранта —
    // защищать пока нечего.
    if (key === 'security') {
        const existingHash = (store.get('security', {}) || {}).hash
        if (existingHash && !consumeSecurityChangeGrant()) {
            console.warn('[store] Blocked store:set for "security" — no recent PIN verification')
            return { success: false, error: 'PIN verification required' }
        }
    }
    // SECURITY: the four PRO-gated backstops below (messengers/folders/
    // extensionsState/settings) all key off *exact* equality against the
    // root key (`key === 'messengers'`, etc.) and validate/strip the *whole*
    // value they receive. electron-store supports dot-notation nested
    // writes though, and isValidStoreKey() above only allowlists the root
    // segment — so `store:set('extensionsState.split', true)` or
    // `store:set('settings.theme', '<pro-theme>')` would satisfy
    // isValidStoreKey() (root 'extensionsState'/'settings' is allowlisted)
    // and isProtectedSetKey() (neither key is in PROTECTED_SET_KEYS), fall
    // straight through every `key === 'X'` check below since none of them
    // match a dotted key, and land unchecked in store.set(key, value) at the
    // bottom of this handler — a live, no-restart-required Pro bypass via a
    // single DevTools console line, same threat model as the cloud.user fix
    // above. Confirmed via grep that no current renderer code legitimately
    // writes a dotted nested path under any of these four roots (the one
    // historical case, settings.downloadDir, was already refactored to a
    // whole-object read/merge/write in renderer/downloads.js's
    // updateCachedSetting() — see the BUGFIX comment there), so it's safe to
    // just reject dotted writes to these roots outright rather than trying
    // to merge-and-revalidate a partial nested value.
    const PRO_GATED_STORE_ROOTS = new Set(['messengers', 'folders', 'extensionsState', 'settings'])
    if (PRO_GATED_STORE_ROOTS.has(key.split('.')[0]) && key.includes('.')) {
        console.warn(`[store] Blocked nested store:set("${key}", …) — write the whole root object/array instead`)
        return { success: false, error: 'nested_write_disallowed' }
    }
    // SECURITY: defense-in-depth for the free-plan messenger cap. The real
    // gate is renderer.js's addMessenger()/hasEffectivePro(), but that only
    // protects the UI path — nothing previously stopped `messengers` (a
    // legitimately renderer-writable key, needed for reorder/rename/mute)
    // from being persisted with more than FREE_MESSENGER_LIMIT entries via a
    // direct IPC call or a hand-edited store file, then reloaded on next
    // launch. Now that entitlement.isEffectivePro() can no longer be forged
    // (see isProtectedSetKey above), this check is actually load-bearing.
    if (key === 'messengers' && Array.isArray(value)) {
        const entitlement = require('./main/services/entitlement')
        if (!entitlement.isEffectivePro()) {
            if (value.length > entitlement.FREE_MESSENGER_LIMIT) {
                console.warn(`[store] Blocked store:set('messengers', …) — ${value.length} exceeds ` +
                    `free plan limit of ${entitlement.FREE_MESSENGER_LIMIT}`)
                return { success: false, error: 'pro_required', code: 'messenger_limit' }
            }
            // SECURITY: defense-in-depth for per-messenger custom notification
            // sounds (messenger-sound-ui.js's requirePro('sound') gate on
            // openMessengerSoundModal()). messenger-sound-bind.js's
            // saveMessengerSoundBtn handler writes messenger.notifSound with no
            // Pro re-check of its own — it trusts the modal could only have
            // been opened by a Pro account. `'__default__'` (and falsy) is the
            // free-plan sentinel (see messenger-sound-ui.js/sounds.js); strip
            // anything else back to it rather than rejecting the whole write,
            // since this array also carries legitimate free-plan edits
            // (rename/reorder/mute) that must not be blocked by a stale sound
            // left over from a lapsed Pro plan/trial.
            let soundsStripped = 0
            value = value.map(m => {
                if (m && m.notifSound && m.notifSound !== '__default__') {
                    soundsStripped++
                    return { ...m, notifSound: '__default__' }
                }
                return m
            })
            if (soundsStripped > 0) {
                console.warn(`[store] Stripped non-Pro per-messenger notifSound overrides: ${soundsStripped}`)
            }
            // SECURITY: defense-in-depth for the Pro-gated "Add your own
            // messenger" feature. The real gate is add-modal-bind.js's
            // addCustomBtn handler (requirePro('customMessenger')), but once
            // a custom entry is in `messengers` it's indistinguishable from a
            // catalog one to any other write path — nothing previously
            // stopped a forged direct IPC call (or hand-edited store file)
            // from injecting an arbitrary-hostname entry while on the free
            // plan. Match by hostname against the same popularMessengers
            // catalog renderer.js's isCatalogMessenger()/reapplyMessengerLocks()
            // use, so both layers agree on what counts as "custom".
            //
            // Only reject when a custom entry is genuinely *new* (its id
            // wasn't already present in the currently-persisted array),
            // rather than rejecting the whole write whenever *any* custom
            // entry is present anywhere in it. renderer.js's
            // reapplyMessengerLocks() deliberately *keeps* (locks, doesn't
            // delete) a stale custom messenger after Pro lapses — since
            // saveData() round-trips the full array on nearly every
            // mutation (rename/mute/reorder/remove-other-messenger), a
            // blanket reject here would silently block every one of those
            // unrelated, otherwise-legitimate free-plan edits for as long as
            // that one stale entry remains. Comparing by id (not url/name —
            // a locked custom messenger's own id/url are never rewritten by
            // any edit path, see context-actions-bind.js's ctxEdit, which
            // only touches `.name`) means an edit/reorder/mute of the exact
            // same pre-existing entries always passes, while injecting an
            // id that didn't previously exist with a non-catalog hostname
            // still gets rejected, same as it would via the real
            // add-modal-bind.js gate.
            const { popularMessengers } = require('./renderer/constants')
            const catalogHostnames = new Set(
                popularMessengers
                    .map(pm => { try { return new URL(pm.url).hostname } catch { return null } })
                    .filter(Boolean)
            )
            const existingIds = new Set(
                (store.get('messengers', []) || []).map(m => m && m.id).filter(Boolean)
            )
            const isCustom = (m) => {
                if (!m || !m.url) return true
                try { return !catalogHostnames.has(new URL(m.url).hostname) } catch { return true }
            }
            const hasNewCustomMessenger = value.some(m => isCustom(m) && !existingIds.has(m && m.id))
            if (hasNewCustomMessenger) {
                console.warn(`[store] Blocked store:set('messengers', …) — new custom messenger requires Pro`)
                return { success: false, error: 'pro_required', code: 'custom_messenger' }
            }
        }
    }
    // SECURITY: defense-in-depth for the Pro-gated folders feature. The real
    // gate is context-actions-bind.js's ctxSidebarNewFolder/ctxNewFolder
    // handlers (both call requirePro('folders')) — creating a folder at all
    // requires Pro, there's no free-plan count like FREE_MESSENGER_LIMIT.
    // edit-modal-bind.js's saveEditBtn handler, which actually pushes into
    // `folders` on state.editMode === 'newFolder', has no Pro check of its
    // own; it trusts editMode can only reach that value via one of the two
    // gated entry points. `folders` is a legitimately renderer-writable key
    // (rename/reorder/icon-change), so reject the whole write — same as the
    // messengers cap above — rather than trying to strip individual entries,
    // since ANY non-empty array is itself the violation for a free account.
    if (key === 'folders' && Array.isArray(value)) {
        const entitlement = require('./main/services/entitlement')
        if (!entitlement.isEffectivePro() && value.length > 0) {
            console.warn(`[store] Blocked store:set('folders', …) — folders require Pro`)
            return { success: false, error: 'pro_required', code: 'folders_require_pro' }
        }
    }
    // SECURITY: defense-in-depth for the native Pro-gated extension toggles
    // (adblock/screenshot/darkmode/split — see NATIVE_EXTENSIONS in
    // renderer/extensions-ui.js). The real gate is that UI's getUserIsPro()
    // check on the toggle itself, but `extensionsState` is a legitimately
    // renderer-writable key (needed to persist which extensions are on), so
    // nothing previously stopped a forged direct IPC call — or a hand-edited
    // store file — from setting e.g. `adblock: true` while on the free plan.
    // Strip (rather than reject outright, unlike the messengers cap above)
    // so unrelated fields in the same object (other extensions' state, the
    // real Chrome-extension entries) aren't collaterally dropped.
    if (key === 'extensionsState' && value && typeof value === 'object' && !Array.isArray(value)) {
        const entitlement = require('./main/services/entitlement')
        if (!entitlement.isEffectivePro()) {
            const blocked = NATIVE_EXTENSION_IDS.filter(id => value[id] === true)
            if (blocked.length > 0) {
                value = { ...value, ...Object.fromEntries(blocked.map(id => [id, false])) }
                console.warn(`[store] Stripped non-Pro extensionsState flags: ${blocked.join(', ')}`)
            }
        }
    }
    // SECURITY: defense-in-depth for the Pro-gated theme/accent-color picker
    // (settings-bind.js's requirePro('themes')/requirePro('accent')). Same
    // reasoning as extensionsState above — `settings` is legitimately
    // renderer-writable (font size, language, download dir, dozens of other
    // free fields), so only strip the two Pro-gated fields, never the whole
    // object.
    if (key === 'settings' && value && typeof value === 'object' && !Array.isArray(value)) {
        const entitlement = require('./main/services/entitlement')
        if (!entitlement.isEffectivePro()) {
            const patch = {}
            if (value.theme && value.theme !== FREE_THEME) patch.theme = FREE_THEME
            if (value.accentColor && value.accentColor !== FREE_ACCENT) patch.accentColor = FREE_ACCENT
            if (Object.keys(patch).length > 0) {
                value = { ...value, ...patch }
                console.warn(`[store] Reset non-Pro settings fields to free defaults: ${Object.keys(patch).join(', ')}`)
            }
        }
    }
    try {
        store.set(key, value)
        return { success: true }
    } catch (error) {
        console.error(`store:set error for key "${key}"`, error)
        return { success: false, error: error.message }
    }
})

safeHandle('store:clear-all', async () => {
    try {
        store.clear()
        return { success: true }
    } catch (error) {
        console.error('store:clear-all error:', error)
        return { success: false, error: error.message }
    }
})

safeHandle('store:delete', async (_event, key) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:delete for disallowed key "${key}"`)
        return { success: false, error: 'Disallowed key' }
    }
    try {
        store.delete(key)
        return { success: true }
    } catch (error) {
        console.error(`store:delete error for key "${key}"`, error)
        return { success: false, error: error.message }
    }
})

// ── Encrypted store (safeStorage) ────────────────────────────────────────────
const { encryptValue, decryptValue } = require('./main/services/secureStore')

safeHandle('store:secure-set', async (_event, key, value) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:secure-set for disallowed key "${key}"`)
        return { success: false, error: 'Disallowed key' }
    }
    if (isProtectedSetKey(key)) {
        console.warn(`[store] Blocked store:secure-set for protected key "${key}"`)
        return { success: false, error: 'Protected key' }
    }
    try {
        store.set(key, encryptValue(value))
        return { success: true }
    } catch (error) {
        console.error(`store:secure-set error for key "${key}"`, error)
        return { success: false, error: error.message }
    }
})

safeHandle('store:secure-get', async (_event, key, def) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:secure-get for disallowed key "${key}"`)
        return def ?? null
    }
    try {
        const raw = store.get(key, null)
        if (raw === null || raw === undefined) return def ?? null
        return decryptValue(raw) ?? def ?? null
    } catch (error) {
        console.error(`store:secure-get error for key "${key}"`, error)
        return def ?? null
    }
})

safeHandle('store:secure-delete', async (_event, key) => {
    if (!isValidStoreKey(key)) {
        console.warn(`[store] Blocked store:secure-delete for disallowed key "${key}"`)
        return { success: false, error: 'Disallowed key' }
    }
    try {
        store.delete(key)
        return { success: true }
    } catch (error) {
        console.error(`store:secure-delete error for key "${key}"`, error)
        return { success: false, error: error.message }
    }
})

const started = initApp({
    app,
    createWindow,
    createTray,
    registerIpc,
    getMainWindow,
    showMainWindow,
    updateTrayMenu,
    isQuittingRef,
    registerProtocol,
    initSingleInstance,
    handleProtocolUrl
})

if (started) {
    registerAppEvents({
        app,
        getMainWindow,
        showMainWindow,
        createWindow,
        unregisterShortcuts,
        handleProtocolUrl,
        isQuittingRef
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        return
    }

    showMainWindow()
})