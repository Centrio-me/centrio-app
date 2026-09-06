const fs   = require('fs')
const path = require('path')
const store = require('./services/store')
const { clearBadges } = require('./services/badge')
const { PATHS, IPC_CHANNELS, API_URL } = require('./config/constants')
const { isWindowAlive, safeSendToWindow } = require('./utils/window')
const { createMainBrowserWindow } = require('./factory/browserWindow')

async function _tryRestoreVpn(win) {
    try {
        const { session } = require('electron')
        const fs2 = require('fs')
        const vpn  = require('./services/store')
        const { decryptValue } = require('./services/secureStore')
        const rawLink = vpn.get('vpnActiveLink', null)
        const link = rawLink ? decryptValue(rawLink) : null
        if (!link) return

        const vpnMgr = require('../vpn-manager')
        const st = vpnMgr.getStatus()
        if (st.active) return  // уже подключён

        const binPath = vpnMgr.getSingboxPath()
        if (!fs2.existsSync(binPath)) return

        if (link.startsWith('http://') || link.startsWith('https://')) return  // подписки не восстанавливаем

        let parsed
        try { parsed = vpnMgr.parseVpnLink(link) } catch { return }

        console.info('[VPN] auto-restore: starting sing-box...')
        await vpnMgr.startProxy(parsed, (line) => {
            if (win && !win.isDestroyed()) win.webContents.send('vpn-log', line)
        })

        // Применяем прокси — теперь все сессии уже инициализированы
        const { applyProxyToSession } = require('./services/proxy')
        const store2 = require('./services/store')
        const messengers = store2.get('messengers', [])
        const modes = store2.get('vpnAppModes', {}) || {}
        const proxyOn = { enabled: true, type: 'socks5', host: '127.0.0.1', port: vpnMgr.PROXY_PORT }

        await applyProxyToSession(session.defaultSession, proxyOn)

        // sing-box поднимает ЛОКАЛЬНЫЙ SOCKS5-listener (порт 7890) почти
        // мгновенно, даже если сам VPN-сервер из сохранённой ссылки мёртв,
        // просрочен или недоступен — vpn-manager.js's checkPortListening()
        // проверяет только локальный bind, а не сквозной туннель. Без этой
        // проверки session.defaultSession молча получает рабочий на вид, но
        // фактически дохлый прокси, и весь трафик через electron.net.fetch()
        // (AI-ассистент, погода, тест Ollama) начинает падать сырыми сетевыми
        // ошибками, которые даже не доходят до сервера — а UI показывает
        // только общее "Что-то пошло не так", потому что raw-сообщение об
        // ошибке не совпадает ни с одним известным кодом.
        const { net } = require('electron')
        const tunnelWorks = await Promise.race([
            net.fetch(`${API_URL}/health`).then(r => r.ok).catch(() => false),
            new Promise(resolve => setTimeout(() => resolve(false), 6000))
        ])

        if (!tunnelWorks) {
            console.warn('[VPN] auto-restore: local proxy port is up but tunnel is dead — reverting to direct')
            await applyProxyToSession(session.defaultSession, { enabled: false })
            await vpnMgr.stopProxy()
            if (win && !win.isDestroyed()) win.webContents.send('vpn-restore-failed')
            return
        }

        for (const m of messengers) {
            if (!m || !m.id) continue
            try {
                const enabled = modes[m.id] !== false
                const settings = enabled ? proxyOn : { enabled: false }
                const ses = session.fromPartition(`persist:${m.id}`)
                await applyProxyToSession(ses, settings)
            } catch (e) {
                console.warn('[VPN] auto-restore proxy apply error:', e.message)
            }
        }

        console.info('[VPN] auto-restore: done, proxy applied')

        // Уведомляем рендерер
        if (win && !win.isDestroyed()) {
            win.webContents.send('vpn-restored', vpnMgr.getStatus())
        }
    } catch (e) {
        // Не стираем сохранённую ссылку здесь: сбой в этом блоке чаще всего
        // временный (таймаут запуска sing-box, ошибка применения прокси к
        // сессии) — заведомо невалидные/непарсящиеся ссылки уже отсеиваются
        // раньше (см. return выше) без удаления настройки пользователя.
        console.warn('[VPN] auto-restore failed:', e.message)
    }
}

function _appendCrashLog(label, detail) {
    try {
        const { app } = require('electron')
        const logDir  = app.getPath('userData')
        const logFile = path.join(logDir, 'crash.log')
        const line    = `[${new Date().toISOString()}] ${label}: ${JSON.stringify(detail)}\n`
        fs.appendFileSync(logFile, line, 'utf8')
    } catch {}
}

// Crash logs previously only ever landed in the local userData/crash.log —
// nobody but the affected user could ever see them, so recurring crashes on
// a particular OS/GPU/webview combo were invisible to us. Best-effort,
// fire-and-forget report to the same already-deployed, already rate-limited,
// unauthenticated /api/visitors/* route family (see landing/visitor-route.js
// POST /crash-report) that visitor-tracker.js already posts anonymous pings
// to. Never throws, never blocks, never retries — a lost crash report isn't
// worth adding complexity for, the local crash.log remains the source of
// truth for the affected user's own troubleshooting.
function _reportCrashToServer(label, detail) {
    try {
        const { app } = require('electron')
        const https = require('https')
        const http  = require('http')
        const { API_URL } = require('./config/constants')
        const { getVisitorId } = require('./services/visitor-tracker')

        const body = JSON.stringify({
            visitorId:  getVisitorId(),
            platform:   process.platform,
            appVersion: app.getVersion(),
            label:      String(label).slice(0, 100),
            // Detail can contain arbitrary renderer-crash objects — cap size
            // so a pathological payload can't be used to bloat the request.
            detail:     JSON.stringify(detail || {}).slice(0, 4000)
        })

        const url = new URL(API_URL + '/api/visitors/crash-report')
        const mod = url.protocol === 'https:' ? https : http

        const req = mod.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => { res.resume() })

        req.on('error', () => {})
        req.setTimeout(8000, () => req.destroy())
        req.write(body)
        req.end()
    } catch {}
}

let mainWindow = null
let isQuittingRef = { value: false }

function setIsQuittingRef(ref) {
    isQuittingRef = ref
}

function injectAppLogo(win) {
    if (!isWindowAlive(win)) return

    const logoPath = `file://${String(PATHS.LOGO || '').replace(/\\/g, '/')}`

    win.webContents.executeJavaScript(`
        (() => {
            try {
                const logoImg = document.querySelector('.app-logo')
                if (logoImg) {
                    logoImg.src = ${JSON.stringify(logoPath)}
                }
            } catch {}
        })()
    `).catch((error) => {
        console.warn('[window] injectAppLogo failed:', error?.message || error)
    })
}

function bindWindowEvents(win) {
    let _lastCrashTime = 0
    let _crashCount = 0

    win.webContents.on('did-finish-load', () => {
        _crashCount = 0
        injectAppLogo(win)
        // VPN авто-восстановление — запускаем через 3 сек после загрузки окна
        // (когда вебвью и сессии уже инициализированы)
        setTimeout(() => _tryRestoreVpn(win), 3000)
    })

    win.webContents.on('render-process-gone', (_event, details) => {
        console.error('[window] render-process-gone:', details)
        _appendCrashLog('render-process-gone', details)

        if (details.reason === 'clean-exit') return

        _reportCrashToServer('render-process-gone', details)

        const now = Date.now()
        const sinceLastCrash = now - _lastCrashTime
        _lastCrashTime = now
        _crashCount++

        if (_crashCount > 5) {
            console.error('[window] crash loop detected — stopping auto-reload')
            _appendCrashLog('crash-loop-stopped', { count: _crashCount })
            return
        }

        // Если крашей много подряд быстро — ждём дольше
        const delay = sinceLastCrash < 3000 ? 5000 : 1500

        console.warn(`[window] renderer crashed (${details.reason}), attempt ${_crashCount}, reload in ${delay}ms`)

        setTimeout(() => {
            if (!win.isDestroyed()) {
                // reload() не работает после render-process-gone в Electron 36 — используем loadFile
                win.loadFile(PATHS.INDEX_HTML).catch(e => {
                    console.error('[window] loadFile after crash failed:', e)
                })
            }
        }, delay)
    })

    // Previously this only logged a console.warn — no crash-log entry, no
    // server visibility, and no way to tell an unresponsive window that
    // recovered on its own from one that stayed hung. A window can go briefly
    // unresponsive from legitimate heavy sync JS in a webview; forcing a
    // reload here would risk destroying in-progress state in every messenger
    // tab for what might just be a slow paint. So this only observes and
    // reports — it does not force a reload (unlike render-process-gone, which
    // reacts to an actual process crash, a fundamentally different signal).
    let _unresponsiveSince = 0

    win.webContents.on('unresponsive', () => {
        _unresponsiveSince = Date.now()
        console.warn('[window] main window became unresponsive')

        setTimeout(() => {
            // Still unresponsive after the threshold and hasn't recovered
            // (responsive handler below would have reset _unresponsiveSince to 0)
            if (_unresponsiveSince === 0) return
            const stuckMs = Date.now() - _unresponsiveSince
            console.error(`[window] still unresponsive after ${stuckMs}ms`)
            _appendCrashLog('unresponsive', { stuckMs })
            _reportCrashToServer('unresponsive', { stuckMs })
        }, 10000)
    })

    win.webContents.on('responsive', () => {
        if (_unresponsiveSince > 0) {
            const recoveredAfterMs = Date.now() - _unresponsiveSince
            console.info(`[window] recovered from unresponsive after ${recoveredAfterMs}ms`)
            _unresponsiveSince = 0
        }
    })

    win.once('ready-to-show', () => {
        clearBadges(getMainWindow)

        const settings = store.get('settings', {})
        if (settings?.startMinimized) {
            // Label promises "сразу в трей" (straight to tray), not a regular
            // taskbar minimize — hide() is what leaves only the tray icon.
            win.hide()
        } else {
            win.show()
        }
    })

    // Prevent GPU frame throttling (fixes "black webview, mouse sees content" issue
    // that can occur when Windows marks the window as occluded).
    try { win.webContents.setBackgroundThrottling(false) } catch {}

    // BUGFIX (2026-08-25): win.webContents.invalidate() used to be called here
    // on every 'focus'/'show' event, as a workaround for the
    // CalculateNativeWinOcclusion stale-frame bug. That Chromium feature is
    // already disabled globally via app.commandLine.appendSwitch('disable-features', ...)
    // in main.js, so this call was dead weight. Removed because it is also the
    // leading suspect for the "app freezes permanently after an OAuth popup
    // closes" bug: 'focus' fires on mainWin the instant Windows hands focus
    // back after the popup (an owned child window, with its own GPU/compositor
    // surface) is destroyed, and invalidate() forces a synchronous round-trip
    // to the GPU process to present a new frame — exactly the moment/pattern
    // every repro of the freeze has hit. Three prior fix attempts (see the
    // BUGFIX comment in main/ipc/window.js) touched unrelated code in
    // wireOAuthPopup and all failed live retest, which is what led to
    // examining this separate, previously-unexamined handler.
    win.on('focus', () => {
        clearBadges(getMainWindow)
    })

    win.on('close', (e) => {
        if (isQuittingRef.value) return

        const behavior = store.get('settings.closeBehavior', 'tray')

        if (behavior === 'tray') {
            e.preventDefault()
            win.hide()
            return
        }

        if (behavior === 'minimize') {
            e.preventDefault()
            win.minimize()
            return
        }

        isQuittingRef.value = true
    })

    win.on('hide', () => {
        safeSendToWindow(getMainWindow, IPC_CHANNELS.APP_HIDDEN)
    })

    win.on('minimize', () => {
        safeSendToWindow(getMainWindow, IPC_CHANNELS.APP_HIDDEN)
    })

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null
        }
    })
}

function createWindow() {
    if (isWindowAlive(mainWindow)) {
        return mainWindow
    }

    mainWindow = createMainBrowserWindow()
    bindWindowEvents(mainWindow)

    mainWindow.loadFile(PATHS.INDEX_HTML).catch((error) => {
        console.error('[window] failed to load index.html:', error)
    })

    return mainWindow
}

function getMainWindow() {
    return mainWindow
}

function showMainWindow() {
    if (!isWindowAlive(mainWindow)) {
        return createWindow()
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }

    if (!mainWindow.isVisible()) {
        mainWindow.show()
    }

    mainWindow.focus()
    return mainWindow
}

module.exports = {
    createWindow,
    getMainWindow,
    showMainWindow,
    setIsQuittingRef,
    appendCrashLog: _appendCrashLog,
    reportCrashToServer: _reportCrashToServer
}