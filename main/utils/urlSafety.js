'use strict'

// Общая защита от SSRF для мест, где адрес сервера целиком вводит
// пользователь сам — сейчас это Ollama URL (main/ipc/assistant.js
// 'assistant:ollama-test' и main/services/aiProviders/index.js режим
// 'local'). "Это же адрес собственного компьютера пользователя" не
// снимает риск сам по себе: значение живёт в store-ключе assistant.ollamaUrl,
// а main.js ALLOWED_STORE_ROOTS проверяет только верхний сегмент ключа
// ('assistant'), не конкретные под-ключи — то есть записать туда
// произвольный URL теоретически может любой код с доступом к
// store:set/store:secure-set IPC, не только сама вкладка настроек.
// getChatStream() затем реально дёргает этот URL из main-процесса.
//
// Блокируем известные cloud-metadata адреса и весь link-local диапазон
// (169.254.0.0/16 / fe80::/10 и т.п.) — у обычного локального/LAN Ollama
// адреса там не бывает (он либо на loopback, либо на обычном
// приватном/публичном хосте), а у облачных metadata-сервисов
// (AWS/GCP/Azure/DigitalOcean/OpenStack/Alibaba) — почти всегда именно
// такие адреса. Обычные приватные диапазоны (10.0.0.0/8, 192.168.0.0/16 и
// т.д.) сознательно НЕ блокируем — иначе сломается легитимный кейс
// "Ollama крутится на другой машине в домашней сети/через Tailscale".
const dns = require('dns')
const net = require('net')

const BLOCKED_EXACT_IPS = new Set([
    '169.254.169.254', // AWS / GCP / Azure / DigitalOcean / OpenStack metadata
    '169.254.170.2',   // AWS ECS task metadata
    '100.100.100.200', // Alibaba Cloud metadata
    'fd00:ec2::254'     // AWS IMDSv6
])

function isLinkLocal(ip) {
    if (net.isIPv4(ip)) return ip.startsWith('169.254.')
    if (net.isIPv6(ip)) return /^fe[89ab][0-9a-f]:/i.test(ip)
    return false
}

function isBlockedIp(ip) {
    return BLOCKED_EXACT_IPS.has(ip.toLowerCase()) || isLinkLocal(ip)
}

// Резолвит hostname и проверяет ВСЕ полученные адреса — тот факт, что
// первый адрес безопасен, ничего не гарантирует (DNS может отдать
// несколько A/AAAA записей). Бросает Error с понятным message при любой
// проблеме — вызывающий код решает, как это показать пользователю.
async function assertSafeUrl(urlString) {
    let parsed
    try {
        parsed = new URL(urlString)
    } catch {
        throw new Error('invalid_url')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid_url')
    }

    const hostname = parsed.hostname
    if (net.isIP(hostname)) {
        if (isBlockedIp(hostname)) throw new Error('blocked_host')
        return parsed
    }

    let addresses
    try {
        addresses = await dns.promises.lookup(hostname, { all: true })
    } catch {
        throw new Error('dns_lookup_failed')
    }
    if (addresses.length === 0 || addresses.some(a => isBlockedIp(a.address))) {
        throw new Error('blocked_host')
    }
    return parsed
}

module.exports = { assertSafeUrl, isBlockedIp }
