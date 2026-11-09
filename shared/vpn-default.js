'use strict'
// Whether a NEW tab goes through the VPN by default (3.7.3). Russian services answer a foreign VPN address with
// captchas and "requests from your device look automatic" pages (Yandex Wiki, user report), and they do not need
// the VPN anyway — the same rule the team site recommends («российские сервисы без VPN»). Tabs already added keep
// the choice they have; the person can always switch it in the add dialog or the tab's menu.

// Russian companies whose services live on foreign zones too (yandex.com, vk.com, ok.ru is already .ru)
const RUSSIAN_DOMAINS = ['yandex.com', 'yandex.net', 'ya.ru', 'vk.com', 'vk.me', 'vkvideo.ru', 'mail.ru', 'max.ru', 'ok.ru', 'dzen.ru', 'kinopoisk.ru', 'avito.ru', 'ozon.ru', 'wildberries.ru', 'gosuslugi.ru', 'sber.ru', 'tbank.ru']
const RUSSIAN_ZONES = ['ru', 'xn--p1ai', 'su'] // .ru, .рф, .su

function hostOf(url) {
    try {
        const u = new URL(String(url))
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
        return u.hostname.toLowerCase().replace(/\.$/, '')
    } catch { return '' }
}

function isRussianService(url) {
    const host = hostOf(url)
    if (!host) return false
    const zone = host.split('.').pop()
    if (RUSSIAN_ZONES.includes(zone)) return true
    return RUSSIAN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** true = the new tab goes through the VPN when it is connected */
function defaultVpnFor(url) {
    return !isRussianService(url)
}

module.exports = { isRussianService, defaultVpnFor }
