// A popup that one service opens for another service the person already keeps as a tab (Yandex Mail opening Alice,
// 3.7.3, user report) is shown in that tab instead of a separate window. Only an exact host match counts (www
// ignored): disk.yandex.ru is not "the same service" as alice.yandex.ru.
'use strict'

const hostOf = (raw) => {
    try {
        const url = new URL(String(raw))
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
        return url.hostname.replace(/^www\./, '').toLowerCase()
    } catch { return '' }
}

/**
 * @param {Array<{id: string, url: string}>} messengers the person's tabs
 * @param {string} url the address the popup wants
 * @param {string} openerId the tab that opened the popup (never chosen)
 * @returns {{id: string, url: string}|null}
 */
function findTabForUrl(messengers, url, openerId) {
    const host = hostOf(url)
    if (!host || !Array.isArray(messengers)) return null
    return messengers.find((m) => m && m.id !== openerId && hostOf(m.url) === host) || null
}

module.exports = { findTabForUrl, hostOf }
