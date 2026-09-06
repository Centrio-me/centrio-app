// Прокси-сервис главного процесса
// applyAllSessionsProxy — применяет прокси к defaultSession + всем partition мессенджеров

const { session } = require('electron')
const store = require('./store')

function buildProxyRules (proxySettings) {
    const { type, host, port } = proxySettings || {}

    switch (type) {
        case 'none':   return { mode: 'direct' }
        case 'system': return { mode: 'system' }
        case 'auto':   return { mode: 'auto_detect' }
        case 'http':   return { proxyRules: `http=${host}:${port}` }
        case 'https':  return { proxyRules: `https=${host}:${port}` }
        // URI-формат: socks5://host:port — маршрутизирует ВЕСЬ трафик (HTTP+HTTPS+WS) через SOCKS5.
        // Старый формат socks5=host:port был неверным — он не захватывал HTTP/HTTPS трафик в Chromium.
        case 'socks4': return { proxyRules: `socks4://${host}:${port}` }
        case 'socks5': return { proxyRules: `socks5://${host}:${port}` }
        default:       return { mode: 'system' }
    }
}

// WebRTC-утечка реального IP мимо прокси/VPN: Chromium по умолчанию
// (policy 'default') собирает ICE-кандидаты со всех сетевых интерфейсов,
// включая прямой выход в интернет — session.setProxy() на это НЕ влияет,
// потому что WebRTC UDP-трафик исторически не завязан на HTTP(S)/SOCKS5
// прокси-настройки сессии. Итог: пользователь думает, что мессенджер идёт
// через VPN (иконка "включено", HTTP-трафик реально проксируется), но
// голосовой/видеозвонок в том же webview (Telegram/Discord/WhatsApp) может
// раскрыть настоящий IP через STUN. 'disable_non_proxied_udp' — штатная
// политика Electron/Chromium именно для этого случая: запрещает прямой
// (непроксированный) UDP для WebRTC, оставляя только TURN-релеи/относящиеся
// к прокси пути. Возвращаем 'default' при выключении VPN, чтобы не портить
// WebRTC для пользователей, которые VPN вообще не используют.
function applyWebRtcLeakProtection (targetSession, enabled) {
    try {
        targetSession.setWebRTCIPHandlingPolicy(enabled ? 'disable_non_proxied_udp' : 'default')
    } catch (e) {
        console.warn('[proxy] setWebRTCIPHandlingPolicy failed:', e.message)
    }
}

async function applyProxyToSession (targetSession, proxySettings) {
    if (!proxySettings || !proxySettings.enabled) {
        await targetSession.setProxy({ mode: 'system' })
        applyWebRtcLeakProtection(targetSession, false)
        // closeAllConnections() убрано — крашит Chromium нативно при наличии extension service workers
        return
    }

    const rules = buildProxyRules(proxySettings)
    await targetSession.setProxy(rules)
    applyWebRtcLeakProtection(targetSession, true)
    // closeAllConnections() убрано — крашит Chromium нативно при наличии extension service workers
    // Соединения переустановятся через новый прокси при следующем запросе

    targetSession.removeAllListeners('login')

    if (proxySettings.login && proxySettings.password) {
        targetSession.on('login', (event, request, authInfo, callback) => {
            if (authInfo.isProxy) {
                event.preventDefault()
                callback(proxySettings.login, proxySettings.password)
            }
        })
    }
}

// Применяет прокси к defaultSession и ко всем persist: сессиям мессенджеров.
// Это критично для VPN — webview-ы используют отдельные partition и не наследуют defaultSession.
async function applyGlobalProxy (proxySettings) {
    await applyProxyToSession(session.defaultSession, proxySettings)
}

async function applyAllSessionsProxy (proxySettings) {
    // 1. defaultSession
    await applyProxyToSession(session.defaultSession, proxySettings)

    // 2. Все partition мессенджеров из store
    try {
        const messengers = store.get('messengers', [])
        const tasks = (messengers || [])
            .filter(m => m && m.id)
            .map(m => {
                try {
                    const ses = session.fromPartition(`persist:${m.id}`)
                    return applyProxyToSession(ses, proxySettings)
                } catch (e) {
                    return Promise.resolve()
                }
            })
        await Promise.all(tasks)
    } catch (e) {
        console.error('[proxy] applyAllSessionsProxy messenger loop error:', e.message)
    }
}

async function applyMessengerProxy (messengerId, proxySettings) {
    const ses = session.fromPartition(`persist:${messengerId}`)
    await applyProxyToSession(ses, proxySettings)
}

async function testProxy (proxySettings) {
    const testPartition = `proxy-test-${Date.now()}-${Math.random()}`
    const ses = session.fromPartition(testPartition)

    try {
        const rules = buildProxyRules(proxySettings)
        await ses.setProxy(rules)
        const result = await ses.resolveProxy('https://www.google.com')
        return { success: true, result }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

module.exports = {
    buildProxyRules,
    applyGlobalProxy,
    applyAllSessionsProxy,
    applyProxyToSession,
    applyMessengerProxy,
    testProxy,
}
