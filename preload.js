const { contextBridge, ipcRenderer } = require('electron')

const validReceiveChannels = new Set([
    'app-hidden',
    'app-quitting',
    'update-available',
    'update-downloaded',
    'update-error',
    'download-progress',
    'switch-messenger-index',
    'switch-messenger-next',
    'switch-messenger-prev',
    'reload-active',
    'open-settings',
    'notification-clicked-id',
    'update-status',
    // BUGFIX (2026-09-06, live report "Центрио думает" — ассистент никогда
    // не получал ответ): этот allowlist не обновлялся по мере добавления
    // новых фич, из-за чего ipcRenderer.on(...) на эти каналы молча
    // блокировался в preload (см. warning "[preload] Blocked subscription
    // to channel: ..." в chrome_debug.log) — main-процесс честно слал
    // события, renderer их просто никогда не получал. Затронуты были не
    // только ассистент, но и медиаплеер/OAuth/загрузки/диплинки/экран
    // блокировки — добавлены все каналы, которые реально шлются главным
    // процессом и на которые подписывается renderer (см. main/ipc/*.js
    // webContents.send(...) и renderer/*.js ipcRenderer.on(...)).
    'assistant:stream-chunk',
    'assistant:tool-call',
    'assistant:done',
    'assistant:error',
    'media-state',
    'downloads:item-update',
    'deep-link-route',
    'show-lock-screen',
    'oauth-add-as-service',
    'oauth-popup-started',
    'oauth-popup-done',
    'oauth-popup-closed',
    'auto-launch-result',
    // BUGFIX (2026-09-09, "VPN постоянно отваливается") — see main/ipc/vpn.js
    // setUnexpectedExitHandler; without this in the allowlist the event
    // above would be silently swallowed here, same class of bug this
    // allowlist's own 2026-09-06 comment already documents.
    'vpn-unexpected-disconnect',
    // BUGFIX (2026-09-09, "уведомления перестали приходить в последней
    // версии" — live user report, THE actual root cause, not the macOS
    // code-signing red herring): main/services/swNotifPatcher.js and
    // main/bootstrap/registerAppEvents.js both webContents.send this channel
    // for every push notification a messenger's own Service Worker shows
    // (WhatsApp/Telegram/MAX/etc — see swNotifPatcher.js's long comment on
    // why SW-realm notifications need this separate CDP-based pipeline at
    // all). renderer/webview-notify.js subscribes via ipcRenderer.on(...) —
    // exactly the pattern this allowlist's own 2026-09-06 comment warns
    // about — and this channel had simply never been added, so EVERY
    // background-tab push notification from EVERY messenger was silently
    // dropped in preload with a console warning nobody was watching for.
    // This affects all platforms, not just unsigned macOS builds.
    'messenger-site-notification',
    // Same audit, same file (renderer/webview-notify.js) — the unread-badge
    // counterpart of the notification pipeline above, also never added.
    'messenger-unread-count',
    // Same audit — main/ipc/appNotifications.js sends this for live updates
    // to the in-app "Уведомления" (admin/changelog) history; renderer/
    // app-notif-bind.js subscribes but this was missing too, so that panel
    // never live-updated without a manual reopen.
    'app-notifs:item-update',
    // main/window.js sends this after restoring a saved VPN connection on
    // startup (_tryRestoreVpn); renderer/vpn-bind.js subscribes to update the
    // toggle once restore finishes, but it was missing here too — the VPN
    // button could sit on a stale "connecting..." state after launch even
    // though the connection actually came up.
    'vpn-restored'
])

const invokeChannelMap = {
    'app:checkForUpdates': 'app:checkForUpdates',
    'dialog:selectDirectory': 'dialog:selectDirectory',
    'install-update': 'install-update'
}

// SECURITY (2026-09-06, аудит): раньше electronAPI.invoke(channel, ...)
// пробрасывал ЛЮБОЕ имя канала в ipcRenderer.invoke без проверки —
// invokeChannelMap был просто таблицей алиасов (3 записи), а не гейтом.
// Любой JS в контексте главного окна (например будущий supply-chain-баг в
// одной из renderer-зависимостей) мог напрямую дёрнуть store:secure-get,
// security:verify-pin или любой другой ipcMain.handle-канал в обход
// специально отобранной поверхности electronAPI. Список ниже — точное
// зеркало ВСЕХ каналов, реально зарегистрированных через
// ipcMain.handle/safeHandle в main.js и main/**/*.js (сверено программно
// с каждым вызовом invokeIpc/authorizedInvoke/electronAPI.invoke в
// renderer/*.js — ни один легитимный вызов не пропущен). webview'ы сюда
// не попадают вообще (у них свой отдельный preload, см.
// webview-preload.js) — это только про код самого главного окна.
const validInvokeChannels = new Set([
    'api-assistant-usage',
    'api-device-trial-redeem',
    'api-get-notifications',
    'api-get-stats',
    'api-login',
    'api-logout',
    'api-me',
    'api-notes-create',
    'api-notes-delete',
    'api-notes-list',
    'api-notes-reorder',
    'api-notes-update',
    'api-org-get-messenger-assignments',
    'api-org-get-settings',
    'api-org-get-vpn',
    'api-org-push-messenger-stats',
    'api-read-all-notifications',
    'api-redeem-promo',
    'api-refresh',
    'api-register',
    'api-sync-pull',
    'api-sync-push',
    'api-update-profile',
    'api-vk-desktop',
    'api-yandex-desktop',
    'app-notifs:get-history',
    'app:checkForUpdates',
    'app:getVersion',
    'apply-global-proxy',
    'apply-messenger-proxy',
    'assistant:chat',
    'assistant:get-status',
    'assistant:ollama-test',
    'assistant:tool-result',
    'check-for-updates',
    'choose-download-dir',
    'copy-image-to-clipboard',
    'copy-text-to-clipboard',
    'dialog:selectDirectory',
    'downloads:get-history',
    'downloads:open-file',
    'downloads:read-file-bytes',
    'ext:apply-to-session',
    'ext:install',
    'ext:list',
    'ext:toggle',
    'ext:uninstall',
    'get-auto-launch',
    'get-save-image-path',
    'get-webview-preload-path',
    'get-window-visibility-state',
    'install-update',
    'lock-bg:choose-custom',
    'lock-bg:clear',
    'lock-bg:get',
    'lock-bg:set-preset',
    'oauth-google',
    'oauth-yandex',
    'open-popup-window',
    'screenshot:capture',
    'security:hash-pin',
    'security:verify-pin',
    'settings:export',
    'settings:import',
    'store:clear-all',
    'store:delete',
    'store:get',
    'store:secure-delete',
    'store:secure-get',
    'store:secure-set',
    'store:set',
    'test-proxy',
    'tracker:msg-received',
    'tracker:msg-sent',
    'tracker:notif',
    'tracker:service-time',
    'vpn-connect',
    'vpn-connect-saved',
    'vpn-delete-config',
    'vpn-disconnect',
    'vpn-download-and-connect',
    'vpn-get-app-modes',
    'vpn-get-subscription',
    'vpn-ping',
    'vpn-refresh-subscription',
    'vpn-set-app-vpn',
    'vpn-status',
    'weather:get'
])

const sendChannelMap = {
    'set-app-zoom': 'set-app-zoom',
    'open-url': 'open-url'
}

function mapInvokeChannel(channel) {
    return invokeChannelMap[channel] || channel
}

function mapSendChannel(channel) {
    return sendChannelMap[channel] || channel
}

function normalizePayload(channel, args) {
    if (channel === 'update-status') {
        const data = args[0]

        if (!data || typeof data !== 'object') {
            console.warn(`[preload] Invalid payload for channel "${channel}":`, data)
            return [{ status: 'unknown' }]
        }

        return [data]
    }

    return args
}

const electronAPI = {
    storeGet: (key, def) => ipcRenderer.invoke('store:get', key, def),
    storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
    storeDelete: (key) => ipcRenderer.invoke('store:delete', key),

    // SECURITY (2026-09-06, аудит): эти три канала никогда не были
    // проброшены сюда, хотя main.js (store:secure-set/get/delete) реализует
    // их правильно (main/services/secureStore.js — OS safeStorage:
    // DPAPI/Keychain/libsecret). Из-за отсутствия моста renderer.js
    // (store.secureSet/secureGetAsync/secureDelete) молча проваливался в
    // plaintext-фолбэк (window.electronAPI.storeSet/...) на КАЖДЫЙ вызов —
    // токены входа (cloud.accessToken/refreshToken), пароль прокси
    // (globalProxy.password) и собственные API-ключи пользователя для
    // ИИ-провайдеров (assistant.byok.*.keyEnc) годами писались на диск в
    // открытом виде вместо зашифрованного. Добавлено без изменений в
    // main.js/renderer.js — там код уже был правильным.
    storeSecureSet: (key, value) => ipcRenderer.invoke('store:secure-set', key, value),
    storeSecureGet: (key, def) => ipcRenderer.invoke('store:secure-get', key, def),
    storeSecureDelete: (key) => ipcRenderer.invoke('store:secure-delete', key),

    getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),

    invoke: (channel, ...args) => {
        const mapped = mapInvokeChannel(channel)
        if (!validInvokeChannels.has(mapped)) {
            console.warn(`[preload] Blocked invoke to channel: ${mapped}`)
            return Promise.resolve({ success: false, error: 'blocked_channel' })
        }
        return ipcRenderer.invoke(mapped, ...args)
    },

    send: (channel, ...args) => {
        const mapped = mapSendChannel(channel)
        return ipcRenderer.send(mapped, ...args)
    },

    on: (channel, listener) => {
        if (!validReceiveChannels.has(channel)) {
            console.warn(`[preload] Blocked subscription to channel: ${channel}`)
            return () => {}
        }

        if (typeof listener !== 'function') {
            console.warn(`[preload] Listener for channel "${channel}" is not a function`)
            return () => {}
        }

        const wrapped = (_event, ...args) => {
            try {
                const normalizedArgs = normalizePayload(channel, args)
                listener(...normalizedArgs)
            } catch (error) {
                console.error(`[preload] Error while handling channel "${channel}":`, error)
            }
        }

        ipcRenderer.on(channel, wrapped)

        return () => {
            ipcRenderer.removeListener(channel, wrapped)
        }
    },

    once: (channel, listener) => {
        if (!validReceiveChannels.has(channel)) {
            console.warn(`[preload] Blocked one-time subscription to channel: ${channel}`)
            return
        }

        if (typeof listener !== 'function') {
            console.warn(`[preload] One-time listener for channel "${channel}" is not a function`)
            return
        }

        ipcRenderer.once(channel, (_event, ...args) => {
            try {
                const normalizedArgs = normalizePayload(channel, args)
                listener(...normalizedArgs)
            } catch (error) {
                console.error(`[preload] Error while handling one-time channel "${channel}":`, error)
            }
        })
    },

    removeAllListeners: (channel) => {
        if (!validReceiveChannels.has(channel)) return
        ipcRenderer.removeAllListeners(channel)
    },

    onUpdateStatus: (listener) => {
        if (typeof listener !== 'function') return () => {}
        return electronAPI.on('update-status', listener)
    },

    installUpdate: () => ipcRenderer.invoke('install-update'),

    setAppZoom: (value) => ipcRenderer.send('set-app-zoom', value),
    getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    openExternal: (url) => ipcRenderer.send('open-url', url),

    // VPN progress events
    onVpnProgress: (listener) => {
        let handler = null
        if (typeof listener === 'function') {
            handler = (_event, data) => listener(data)
            ipcRenderer.on('vpn-download-progress', handler)
        }
        return handler
    },
    offVpnProgress: () => {
        ipcRenderer.removeAllListeners('vpn-download-progress')
    },

    // Extensions
    extList:           ()         => ipcRenderer.invoke('ext:list'),
    extInstall:        (id)       => ipcRenderer.invoke('ext:install', id),
    extUninstall:      (id)       => ipcRenderer.invoke('ext:uninstall', id),
    extToggle:         (id, on)   => ipcRenderer.invoke('ext:toggle', id, on),
    extApplyToSession: (partition) => ipcRenderer.invoke('ext:apply-to-session', partition),

    openPopupWindow: (url, opts) => ipcRenderer.invoke('open-popup-window', url, opts)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)