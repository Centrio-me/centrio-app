// IPC-хендлеры для реальных Chrome-расширений (сейчас: Google Переводчик).
// Каналы уже объявлены (были мёртвыми/no-op) в preload.js и renderer/webview-tabs-bind.js —
// здесь только регистрируем реальную реализацию.

const { ipcMain } = require('electron')
const ext = require('../services/extensions')
const entitlement = require('../services/entitlement')

let log
try { log = require('electron-log') } catch { log = console }

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

// Реальные расширения — платная Pro-фича. Проверка на клиенте (renderer/extensions-ui.js)
// защищает только UI; сама установка/включение идёт через IPC, вызываемый из webview-контента
// в devtools можно дёрнуть window.electronAPI.extInstall/extToggle напрямую — так что источник
// правды (entitlement.isEffectivePro(), main/services/entitlement.js) проверяется здесь же,
// в main, а не только в renderer. Раньше эта функция читала store.cloud.user.plan напрямую —
// с тем же успехом, что и renderer, потому что тот же ключ был доступен на запись через общий
// store:set IPC-канал (см. PROTECTED_SET_KEYS в main.js для разбора и фикса), и не учитывала
// локальный 14-дневный триал вовсе (см. hasEffectivePro() в renderer.js) — оба недостатка
// закрыты общим entitlement-модулем.
function isProUser() {
    return entitlement.isEffectivePro()
}

function registerExtensionsIpc() {
    safeHandle('ext:list', () => {
        try {
            return { success: true, catalog: ext.getCatalogForUi() }
        } catch (err) {
            log.error('[ipc/extensions] ext:list error:', err.message)
            return { success: false, error: err.message, catalog: [] }
        }
    })

    safeHandle('ext:install', async (_event, key) => {
        if (typeof key !== 'string' || !ext.CATALOG[key]) {
            return { success: false, error: 'unknown-extension' }
        }
        if (!isProUser()) {
            return { success: false, error: 'pro-required' }
        }
        return ext.installExtension(key)
    })

    safeHandle('ext:uninstall', async (_event, key) => {
        if (typeof key !== 'string' || !ext.CATALOG[key]) {
            return { success: false, error: 'unknown-extension' }
        }
        return ext.uninstallExtension(key)
    })

    safeHandle('ext:toggle', async (_event, key, enabled) => {
        if (typeof key !== 'string' || !ext.CATALOG[key]) {
            return { success: false, error: 'unknown-extension' }
        }
        if (enabled && !isProUser()) {
            return { success: false, error: 'pro-required' }
        }
        return ext.setEnabledEverywhere(key, !!enabled)
    })

    // Вызывается при каждом создании webview (renderer/webview-tabs-bind.js:addWebview) —
    // должен быть дешёвым и безопасным no-op, если ничего не включено/не установлено.
    safeHandle('ext:apply-to-session', async (_event, partition) => {
        if (typeof partition !== 'string') {
            return { success: true, loaded: [] }
        }
        return ext.applyToSession(partition)
    })
}

module.exports = registerExtensionsIpc
