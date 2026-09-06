// ── Патч Service Worker notification realm через CDP ────────────────────────
// BUGFIX ("некоторые уведомления не долетают вообще, ни в OS-тост, ни в
// центр уведомлений"): NOTIF_PATCH_SCRIPT в registerAppEvents.js патчит
// window.Notification / window.ServiceWorkerRegistration.prototype в realm
// ГЛАВНОГО документа webview (через contents.executeJavaScript). Но многие
// мессенджеры (WhatsApp/Telegram/MAX и т.д.) показывают push-уведомления,
// когда вкладка не активна, ИЗНУТРИ собственного Service Worker'а —
// self.registration.showNotification(...) в обработчике 'push'. У SW
// отдельный JS-realm (self, свой ServiceWorkerRegistration.prototype) —
// патч, применённый в realm страницы, туда не достаёт вообще, поэтому такие
// уведомления полностью пропадали без единого следа.
//
// Официального Electron API для инъекции произвольного скрипта в realm
// воркера нет: ServiceWorkerMain (session.serviceWorkers) даёт только
// send()/ipc — это IPC-мост, а не executeJavaScript, и работает только если
// сам SW явно слушает ipcRenderer (сторонний код мессенджера об этом не
// знает и не будет). Рабочий путь — CDP: webContents.debugger, уже
// официальный публичный Electron API, без открытия сетевого порта.
// Target.setAutoAttach({flatten:true}) на debugger, прикреплённом к
// webview-contents, автоматически прикрепляет CDP-сессию и к
// service_worker-таргетам этой же страницы (тот же механизм, которым
// пользуется chrome://inspect/#service-workers) — дальше обычный
// Runtime.evaluate с этим дочерним sessionId.
//
// Пул-модель та же, что и для остального пайплайна (см. NOTIF_DRAIN_SCRIPT):
// патч копит уведомления в self.__centrioPendingNotifs, мы периодически
// вычитываем их через Runtime.evaluate + returnByValue.
const NOTIF_POLL_MS = 2000

let log
try { log = require('electron-log') } catch { log = console }

// Извлекаем правдоподобный URL из options.data — многие PWA кладут туда
// { url: '/chat/123' } или просто строку, чтобы в 'notificationclick'
// открыть нужный экран. Если получится вытащить — пригодится для клика по
// записи в центре уведомлений (переход не просто на вкладку, а в конкретный
// диалог). Если формата не узнали — молча остаёмся без url, ничего не ломаем.
const EXTRACT_URL_SNIPPET = `
        var __rawData = options && options.data
        var __url = null
        try {
            if (typeof __rawData === 'string') __url = __rawData
            else if (__rawData && typeof __rawData === 'object') {
                __url = __rawData.url || __rawData.link || __rawData.deepLink || __rawData.href || null
            }
        } catch (e) {}
`

// BUGFIX (диагностика "патч молча не применяется"): раньше 'return \'patched\''
// стоял ВНЕ try/catch, поэтому скрипт врал 'patched' даже если код внутри
// try выбросил исключение — self.__centrioSwNotifPatched=true не было
// доказательством, что переопределение реально произошло. Теперь скрипт
// возвращает JSON-диагностику (verified читается ПОСЛЕ попытки записи, из
// того же realm, а не через внешнее CDP-соединение) и мы логируем её.
const SW_PATCH_SCRIPT = `(function() {
    var __diag = { already: false, hadCtor: false, hadMethod: false, error: null, verified: false }
    __diag.already = !!self.__centrioSwNotifPatched
    self.__centrioSwNotifPatched = true
    self.__centrioPendingNotifs = self.__centrioPendingNotifs || []

    try {
        __diag.hadCtor = !!self.ServiceWorkerRegistration
        __diag.hadMethod = !!(self.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification)
        if (__diag.hadMethod && !__diag.already) {
            var origShow = ServiceWorkerRegistration.prototype.showNotification
            Object.defineProperty(ServiceWorkerRegistration.prototype, 'showNotification', {
                configurable: true,
                writable: true,
                enumerable: true,
                value: function __centrioShowNotification(title, options) {
                    try {
                        ${EXTRACT_URL_SNIPPET}
                        self.__centrioPendingNotifs.push({
                            title: String(title || ''),
                            body: String((options && options.body) || ''),
                            tag: String((options && options.tag) || ''),
                            icon: (options && options.icon) || '',
                            url: __url ? String(__url) : ''
                        })
                    } catch (e) {}
                    return origShow.call(this, title, options)
                }
            })
        }
    } catch (e) {
        __diag.error = String((e && e.message) || e)
    }

    try {
        __diag.verified = !!(self.ServiceWorkerRegistration &&
            ServiceWorkerRegistration.prototype.showNotification &&
            ServiceWorkerRegistration.prototype.showNotification.name === '__centrioShowNotification')
    } catch (e) {
        __diag.verifyError = String((e && e.message) || e)
    }

    return JSON.stringify(__diag)
})()`

const SW_DRAIN_SCRIPT = `(function() {
    if (!self.__centrioPendingNotifs || !self.__centrioPendingNotifs.length) return []
    return self.__centrioPendingNotifs.splice(0, self.__centrioPendingNotifs.length)
})()`

// Один bridge на один webview-contents. Держит карту sessionId → таймер
// поллинга, чтобы не плодить параллельные интервалы на один и тот же
// воркер (SW может пере-прикрепляться при обновлении версии скрипта).
function attachServiceWorkerNotifBridge(contents, messengerId, getMainWindow) {
    if (!messengerId || contents.getType() !== 'webview') return

    let dbg
    try {
        dbg = contents.debugger
    } catch {
        return
    }

    const workerTimers = new Map()

    function stopWorker(sessionId) {
        const timer = workerTimers.get(sessionId)
        if (timer) clearInterval(timer)
        workerTimers.delete(sessionId)
    }

    function stopAll() {
        workerTimers.forEach((timer) => clearInterval(timer))
        workerTimers.clear()
    }

    function pollWorker(sessionId) {
        if (contents.isDestroyed()) { stopWorker(sessionId); return }
        dbg.sendCommand('Runtime.evaluate', {
            expression: SW_DRAIN_SCRIPT,
            returnByValue: true,
            awaitPromise: false
        }, sessionId).then((res) => {
            const items = res && res.result && res.result.value
            if (!Array.isArray(items) || !items.length) return
            const win = getMainWindow()
            if (!win || win.isDestroyed()) return
            items.forEach((payload) => {
                win.webContents.send('messenger-site-notification', messengerId, payload)
            })
        }).catch(() => {
            // Сессия могла уже отвалиться (воркер остановлен) — не шумим в лог,
            // Target.detachedFromTarget ниже сам почистит таймер.
        })
    }

    function onMessage(_event, method, params) {
        if (method === 'Target.attachedToTarget') {
            const info = params && params.targetInfo
            const childSessionId = params && params.sessionId
            if (!info || info.type !== 'service_worker' || !childSessionId) return
            if (workerTimers.has(childSessionId)) return

            dbg.sendCommand('Runtime.enable', {}, childSessionId).catch(() => {})
            dbg.sendCommand('Runtime.evaluate', {
                expression: SW_PATCH_SCRIPT,
                returnByValue: true
            }, childSessionId).then((res) => {
                const raw = res && res.result && res.result.value
                let diag = null
                try { diag = JSON.parse(raw) } catch { diag = raw }
                if (diag && diag.verified === false) {
                    log.warn?.('[sw-notif] patch NOT verified for', messengerId, JSON.stringify(diag))
                } else {
                    log.info?.('[sw-notif] patch result for', messengerId, JSON.stringify(diag))
                }
            }).catch((e) => {
                log.warn?.('[sw-notif] patch evaluate failed for', messengerId, ':', e && e.message)
            })

            const timer = setInterval(() => pollWorker(childSessionId), NOTIF_POLL_MS)
            workerTimers.set(childSessionId, timer)
            return
        }
        if (method === 'Target.detachedFromTarget') {
            const childSessionId = params && params.sessionId
            if (childSessionId) stopWorker(childSessionId)
        }
    }

    try {
        if (!dbg.isAttached()) dbg.attach('1.3')
    } catch (e) {
        // Конфликтует с уже открытым DevTools для этого webview (ctxDevTools
        // в context-actions-bind.js) — редкий ручной кейс, деградируем молча:
        // остальной пайплайн (realm страницы) продолжает работать как раньше.
        log.warn?.('[sw-notif] debugger.attach failed for', messengerId, ':', e && e.message)
        return
    }

    dbg.on('message', onMessage)
    dbg.on('detach', () => stopAll())

    dbg.sendCommand('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true
    }).catch((e) => {
        log.warn?.('[sw-notif] setAutoAttach failed for', messengerId, ':', e && e.message)
    })

    contents.once('destroyed', () => {
        stopAll()
        try { if (dbg.isAttached()) dbg.detach() } catch {}
    })
}

module.exports = { attachServiceWorkerNotifBridge }
