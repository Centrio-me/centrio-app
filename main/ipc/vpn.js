// VPN IPC-хендлеры
// Управляют подключением через sing-box, загрузкой бинарника, подписками.
// ВАЖНО: не используем wrapIpc — хендлеры сами формируют { success, ... }.
// applyAllSessionsProxy применяет прокси ко всем сессиям мессенджеров (не только defaultSession).

const { ipcMain, session } = require('electron')
const fs   = require('fs')
const { applyAllSessionsProxy, applyProxyToSession } = require('../services/proxy')
const store = require('../services/store')
const { encryptValue, decryptValue } = require('../services/secureStore')

// Ленивая загрузка vpn-manager (находится в корне проекта)
let vpnMgr = null
function getVpn () {
    if (!vpnMgr) vpnMgr = require('../../vpn-manager')
    return vpnMgr
}

// Общий обработчик ошибок — возвращает { success: false, error: '...', errorCode }
// errorCode — стабильный код для локализованного сообщения в рендерере (см. friendlyVpnError в vpn-bind.js);
// error остаётся техническим текстом для логов на случай, если код неизвестен рендереру.
function errResult (e) {
    return {
        success:   false,
        error:     e instanceof Error ? e.message : String(e),
        errorCode: (e instanceof Error && e.code) || null
    }
}

function subHttpOnlyError () {
    const err = new Error('Subscription URL must use HTTPS (plain HTTP is not allowed)')
    err.code = 'VPN_SUBSCRIPTION_HTTP_ONLY'
    return err
}

function subEmptyError () {
    const err = new Error('Configurations not found in subscription')
    err.code = 'VPN_SUBSCRIPTION_EMPTY'
    return err
}

// Прокси-настройки для включения/выключения VPN
function vpnProxyOn  (port) { return { enabled: true, type: 'socks5', host: '127.0.0.1', port } }
function vpnProxyOff ()     { return { enabled: false } }

// Сохраняем ссылку активного конфига — чтобы восстановить после перезапуска.
// Ссылки (vmess/vless/trojan/...) содержат креды в самом URI и подписочные
// URL нередко несут токен доступа в query — шифруем через safeStorage
// (main/services/secureStore.js) перед записью в electron-store.
function saveActiveLink (link) { store.set('vpnActiveLink', link ? encryptValue(link) : null) }
function loadActiveLink ()     { const v = store.get('vpnActiveLink', null); return v ? decryptValue(v) : null }

// Подписка (subscription URL) — запоминаем, чтобы можно было обновлять список серверов.
// vpnSubUrl   — последний введённый http(s) URL подписки
// vpnSubLinks — список ссылок конфигов, полученных из этой подписки (для корректного обновления)
function saveSubscription (url, links) {
    store.set('vpnSubUrl', url ? encryptValue(url) : null)
    store.set('vpnSubLinks', Array.isArray(links) ? links.map(encryptValue) : [])
}
function getSubUrl ()   { const v = store.get('vpnSubUrl', null); return v ? decryptValue(v) : null }
function getSubLinks () { return (store.get('vpnSubLinks', []) || []).map(decryptValue) }

// Per-app VPN modes: { [messengerId]: boolean }, true = use VPN (default)
function getAppModes ()             { return store.get('vpnAppModes', {}) || {} }
function setAppMode (id, enabled)   { const m = getAppModes(); m[id] = enabled; store.set('vpnAppModes', m) }

// Apply VPN proxy only to messengers that have it enabled (default = all)
async function applyVpnToEnabledSessions (proxySettings) {
    const modes = getAppModes()
    try {
        const messengers = store.get('messengers', [])
        await applyProxyToSession(session.defaultSession, proxySettings)
        const tasks = (messengers || [])
            .filter(m => m && m.id)
            .map(m => {
                const enabled = modes[m.id] !== false
                const settings = enabled ? proxySettings : { enabled: false }
                try {
                    const ses = session.fromPartition(`persist:${m.id}`)
                    return applyProxyToSession(ses, settings)
                } catch (e) { return Promise.resolve() }
            })
        await Promise.all(tasks)
    } catch (e) {
        console.error('[VPN] applyVpnToEnabledSessions error:', e.message)
    }
}

function registerVpnIpc ({ getMainWindow }) {

    // ── Получить текущий статус (БЕЗ авто-восстановления — оно теперь в window.js after did-finish-load) ──
    ipcMain.handle('vpn-status', async () => {
        try {
            const vpn = getVpn()
            return vpn.getStatus()
        } catch (e) {
            return { active: false, port: 7890, name: null, configs: [] }
        }
    })

    // ── Подключить (ссылка или URL подписки) ──────────────────────
    ipcMain.handle('vpn-connect', async (event, link) => {
        try {
            const vpn     = getVpn()
            const binPath = vpn.getSingboxPath()

            // sing-box ещё не скачан — сообщаем рендереру
            if (!fs.existsSync(binPath)) {
                return { success: false, needsDownload: true }
            }

            // Подписка: только HTTPS → скачать, распарсить, сохранить все, подключить к первому
            if (link.startsWith('http://') || link.startsWith('https://')) {
                if (link.startsWith('http://')) {
                    return { success: false, error: 'Subscription URL must use HTTPS (plain HTTP is not allowed)' }
                }
                const items = await vpn.fetchSubscription(link)
                if (!items || items.length === 0) {
                    return { success: false, error: 'Configurations not found in subscription' }
                }
                for (const item of items) vpn.saveConfig(item.parsed.name, item.link)
                saveSubscription(link, items.map(i => i.link))

                await vpn.startProxy(items[0].parsed, (line) => {
                    const win = getMainWindow()
                    if (win) win.webContents.send('vpn-log', line)
                })
                await applyVpnToEnabledSessions(vpnProxyOn(vpn.PROXY_PORT))
                saveActiveLink(items[0].link)
                return { success: true, status: vpn.getStatus(), imported: items.length }
            }

            // Одиночная VPN-ссылка
            const parsed = vpn.parseVpnLink(link)
            vpn.saveConfig(parsed.name, link)

            await vpn.startProxy(parsed, (line) => {
                const win = getMainWindow()
                if (win) win.webContents.send('vpn-log', line)
            })
            await applyVpnToEnabledSessions(vpnProxyOn(vpn.PROXY_PORT))
            saveActiveLink(link)
            return { success: true, status: vpn.getStatus() }

        } catch (e) {
            return errResult(e)
        }
    })

    // ── Скачать sing-box и подключить ─────────────────────────────
    ipcMain.handle('vpn-download-and-connect', async (event, link) => {
        try {
            const vpn = getVpn()
            const win = getMainWindow()

            await vpn.downloadSingbox((progress) => {
                if (win) win.webContents.send('vpn-download-progress', progress)
            })

            // Подписка: только HTTPS
            if (link.startsWith('http://') || link.startsWith('https://')) {
                if (link.startsWith('http://')) {
                    return { success: false, error: 'Subscription URL must use HTTPS (plain HTTP is not allowed)' }
                }
                const items = await vpn.fetchSubscription(link)
                if (!items || items.length === 0) {
                    return { success: false, error: 'Configurations not found in subscription' }
                }
                for (const item of items) vpn.saveConfig(item.parsed.name, item.link)
                saveSubscription(link, items.map(i => i.link))

                await vpn.startProxy(items[0].parsed, (line) => {
                    if (win) win.webContents.send('vpn-log', line)
                })
                await applyVpnToEnabledSessions(vpnProxyOn(vpn.PROXY_PORT))
                saveActiveLink(items[0].link)
                return { success: true, status: vpn.getStatus(), imported: items.length }
            }

            // Одиночная ссылка
            const parsed = vpn.parseVpnLink(link)
            vpn.saveConfig(parsed.name, link)

            await vpn.startProxy(parsed, (line) => {
                if (win) win.webContents.send('vpn-log', line)
            })
            await applyVpnToEnabledSessions(vpnProxyOn(vpn.PROXY_PORT))
            saveActiveLink(link)
            return { success: true, status: vpn.getStatus() }

        } catch (e) {
            return errResult(e)
        }
    })

    // ── Подключить по сохранённой ссылке (из списка) ──────────────
    ipcMain.handle('vpn-connect-saved', async (event, link) => {
        try {
            const vpn     = getVpn()
            const binPath = vpn.getSingboxPath()
            if (!fs.existsSync(binPath)) return { success: false, needsDownload: true }

            const parsed = vpn.parseVpnLink(link)
            await vpn.startProxy(parsed, (line) => {
                const win = getMainWindow()
                if (win) win.webContents.send('vpn-log', line)
            })
            await applyVpnToEnabledSessions(vpnProxyOn(vpn.PROXY_PORT))
            saveActiveLink(link)
            return { success: true, status: vpn.getStatus() }
        } catch (e) {
            return errResult(e)
        }
    })

    // ── Отключить VPN ─────────────────────────────────────────────
    ipcMain.handle('vpn-disconnect', async () => {
        try {
            const vpn = getVpn()
            await vpn.stopProxy()
            await applyAllSessionsProxy(vpnProxyOff())  // disconnect — убираем со всех
            saveActiveLink(null)
            return { success: true, status: vpn.getStatus() }
        } catch (e) {
            return errResult(e)
        }
    })

    // ── Пинг конфига (TCP-замер до сервера) ──────────────────────
    ipcMain.handle('vpn-ping', async (event, link) => {
        try {
            const ms = await getVpn().pingConfig(link)
            return { success: true, ms }
        } catch (e) {
            return { success: true, ms: null }
        }
    })

    // ── Удалить сохранённый конфиг ────────────────────────────────
    ipcMain.handle('vpn-delete-config', async (event, id) => {
        try {
            const configs = getVpn().deleteConfig(id)
            return { success: true, configs }
        } catch (e) {
            return errResult(e)
        }
    })

    // ── Получить сохранённый URL подписки (для отображения в выпадающем списке) ──
    ipcMain.handle('vpn-get-subscription', () => {
        return { success: true, url: getSubUrl() }
    })

    // ── Обновить список серверов из подписки ──────────────────────
    // Заново скачивает подписку по сохранённому URL, добавляет новые серверы,
    // удаляет исчезнувшие (которые ранее пришли из этой же подписки), обновляет имена.
    ipcMain.handle('vpn-refresh-subscription', async (event, explicitUrl) => {
        try {
            const vpn = getVpn()
            const url = (explicitUrl && /^https?:\/\//.test(explicitUrl)) ? explicitUrl : getSubUrl()
            if (!url) return { success: false, error: 'No subscription saved' }

            const items = await vpn.fetchSubscription(url)
            if (!items || items.length === 0) {
                return { success: false, error: 'Configurations not found in subscription' }
            }

            const newLinks = items.map(i => i.link)
            const oldLinks = getSubLinks()

            // Удаляем серверы, которые были в старой подписке, но исчезли в новой
            for (const oldLink of oldLinks) {
                if (!newLinks.includes(oldLink)) {
                    const cfg = vpn.getSavedConfigs().find(c => c.link === oldLink)
                    if (cfg) vpn.deleteConfig(cfg.id)
                }
            }

            // Добавляем/обновляем актуальные серверы
            for (const item of items) vpn.saveConfig(item.parsed.name, item.link)
            saveSubscription(url, newLinks)

            return { success: true, status: vpn.getStatus(), imported: items.length }
        } catch (e) {
            return errResult(e)
        }
    })

    // ── Per-app VPN modes ─────────────────────────────────────────
    ipcMain.handle('vpn-get-app-modes', () => {
        return { success: true, modes: getAppModes() }
    })

    ipcMain.handle('vpn-set-app-vpn', async (event, messengerId, enabled) => {
        try {
            setAppMode(messengerId, !!enabled)
            const vpn = getVpn()
            const st  = vpn.getStatus()
            if (st.active) {
                const proxy = enabled ? vpnProxyOn(vpn.PROXY_PORT) : vpnProxyOff()
                const ses = session.fromPartition(`persist:${messengerId}`)
                await applyProxyToSession(ses, proxy)
            }
            return { success: true }
        } catch (e) {
            return errResult(e)
        }
    })
}

module.exports = registerVpnIpc
