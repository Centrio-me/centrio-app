const { registerShortcuts } = require('../services/shortcuts')
const { initUpdater, checkForUpdates, checkPendingUpdateOutcome } = require('../services/updater')
const { isProtocolUrl } = require('../services/protocol')
const tracker        = require('../services/tracker')
const visitorTracker = require('../services/visitor-tracker')
const { appendCrashLog, reportCrashToServer } = require('../window')

let log
try { log = require('electron-log') } catch { log = console }

function initApp({
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
}) {
    const singleInstanceOk = initSingleInstance({
        getMainWindow,
        showMainWindow,
        handleProtocolUrl
    })

    if (!singleInstanceOk) {
        return false
    }

    registerProtocol()

    app.whenReady().then(() => {
        createWindow()
        createTray()

        registerIpc({
            getMainWindow,
            showMainWindow,
            updateTrayMenu,
            isQuittingRef
        })

        // ── Start usage tracker ───────────────────────────────────
        tracker.start()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
            win.on('focus', () => tracker.onFocus())
            win.on('blur',  () => tracker.onBlur())
        }

        // ── Start visitor tracker (anonymous users only) ──────────
        visitorTracker.start()

        initUpdater(getMainWindow)
        checkPendingUpdateOutcome({ appendCrashLog, reportCrashToServer })

        // Initial adblock application
        try { require('../services/adblock').updateAllSessions() } catch(e) {}

        // ── Первая проверка через 10–20 сек после старта ─────────
        const delay = Math.floor(Math.random() * 10000) + 10000
        setTimeout(() => {
            checkForUpdates().catch((err) => {
                console.error('[initApp] Auto update check failed:', err)
            })
        }, delay)

        // ── Повторная проверка каждые несколько часов ────────────
        // Раньше было раз в 12 часов — слишком редко для тех, кто держит
        // приложение открытым сутками не закрывая: обновление могло висеть
        // на сервере полдня, прежде чем клиент его вообще заметит.
        const FEW_HOURS = 3 * 60 * 60 * 1000
        setInterval(() => {
            checkForUpdates().catch((err) => {
                console.error('[initApp] Periodic update check failed:', err)
            })
        }, FEW_HOURS)

        registerShortcuts({ getMainWindow, showMainWindow })

        // Handle protocol URL passed as CLI arg at startup (Windows + Linux)
        // macOS uses the 'open-url' event instead
        if (process.platform !== 'darwin') {
            // isProtocolUrl recognizes every scheme we register ourselves as
            // a handler for (centrio://, tg://, max://) — see
            // SUPPORTED_PROTOCOLS in main/config/constants.js.
            const deeplink = process.argv.find(isProtocolUrl)
            log.info('[initApp] cold-start argv:', process.argv, 'deeplink:', deeplink || '(none)')
            if (deeplink) {
                setTimeout(() => {
                    handleProtocolUrl(deeplink, getMainWindow, showMainWindow)
                }, 1000)
            }
        }
    })

    return true
}

module.exports = initApp