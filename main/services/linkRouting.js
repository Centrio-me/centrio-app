// A popup that one service opens for another service the person already keeps as a tab (Yandex Mail opening Alice,
// 3.7.3, user report) is shown in that tab instead of a separate window. Kept narrow on purpose:
//  - only an exact match of scheme, host (www ignored) and port: disk.yandex.ru is not alice.yandex.ru, and an
//    http:// link never goes into an https:// tab;
//  - never a link to the opener's own site (two accounts of the same mail must not swap links);
//  - exactly one tab of the target site, nothing is guessed between two accounts.
'use strict'

const keyOf = (raw) => {
    try {
        const url = new URL(String(raw))
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
        return `${url.protocol}//${url.hostname.replace(/^www\./, '').toLowerCase()}:${url.port}`
    } catch { return '' }
}

const hostOf = (raw) => {
    try { return new URL(String(raw)).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

/**
 * @param {Array<{id: string, url: string}>} messengers the person's tabs
 * @param {string} url the address the popup wants
 * @param {string} openerId the tab that opened the popup
 * @param {string} [openerUrl] that tab's own address
 * @returns {{id: string, url: string}|null}
 */
function findTabForUrl(messengers, url, openerId, openerUrl) {
    const key = keyOf(url)
    if (!key || !Array.isArray(messengers)) return null
    if (openerUrl && hostOf(openerUrl) === hostOf(url)) return null
    const matches = messengers.filter((m) => m && m.id !== openerId && keyOf(m.url) === key)
    return matches.length === 1 ? matches[0] : null
}

module.exports = { findTabForUrl, hostOf }
