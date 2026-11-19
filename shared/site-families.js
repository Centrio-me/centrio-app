'use strict'
// Which addresses a messenger tab may go to without leaving the program (renderer/webview-tabs-bind.js 'will-navigate') and a
// team tab under the strict lock (main/services/orgNavigationPolicy.js). One list for both: the sign-in of a site goes through
// pages that are not its own — and a tab that sent them to the system browser had nothing to sign in with there.
//   • identity providers' sign-in pages (exact hosts): Mail.ru signs in through VK ID now (e.mail.ru → login.vk.com →
//     account.mail.ru → id.vk.ru); Lucil, 2026-11-19: «Почту пытаюсь загрузить и он в браузер перекидывает на вход»;
//   • a site's other own domain: Tilda's sign-in is on tilda.cc while its projects are on tilda.ru.

const SIGN_IN_HOSTS = new Set([
    'accounts.google.com',
    'id.vk.com', 'id.vk.ru', 'login.vk.com', 'login.vk.ru', 'oauth.vk.com', 'oauth.vk.ru',
    'passport.yandex.ru', 'passport.yandex.com', 'oauth.yandex.ru', 'oauth.yandex.com',
    'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com'
])

// base domains of one site (each of them may stand for the others)
const FAMILIES = [['tilda.ru', 'tilda.cc']]

/** Whether the host is the sign-in page of an identity provider. Exact: «id.vk.com.evil.example» is not one. */
function isSignInHost(hostname) {
    return typeof hostname === 'string' && SIGN_IN_HOSTS.has(hostname.toLowerCase())
}

/** Whether two base domains are one site (the same, or the two domains of one site). */
function sameSiteFamily(baseA, baseB) {
    return baseA === baseB || FAMILIES.some((f) => f.includes(baseA) && f.includes(baseB))
}

// the last two labels of a host, as the tab has always compared them
function baseDomain(hostname) {
    const parts = String(hostname || '').split('.').filter(Boolean)
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.')
}

/**
 * Whether going to navUrl takes a tab that shows tabUrl away from its site (the address then goes to the system browser).
 * Another subdomain of the same site, a sign-in page of an identity provider, the site's other own domain, a local file and
 * an address that cannot be read all stay.
 */
function leavesTheSite(navUrl, tabUrl) {
    try {
        if (String(navUrl).startsWith('file://')) return false
        const navHost = new URL(navUrl).hostname
        if (isSignInHost(navHost)) return false
        return !sameSiteFamily(baseDomain(navHost), baseDomain(new URL(tabUrl).hostname))
    } catch {
        return false
    }
}

/** A sign-in popup of VK ID that a site other than VK itself opens (Mail.ru signs in through it); VK's own tabs are not touched. */
function isVkIdPopupFor(popupUrl, openerUrl) {
    try {
        const host = new URL(popupUrl).hostname
        if (!/^(id|login|oauth).vk.(com|ru)$/i.test(host) || !isSignInHost(host)) return false
        const opener = baseDomain(new URL(openerUrl).hostname)
        return opener !== 'vk.com' && opener !== 'vk.ru'
    } catch {
        return false
    }
}

module.exports = { isVkIdPopupFor, isSignInHost, sameSiteFamily, leavesTheSite, baseDomain, FAMILIES, SIGN_IN_HOSTS }
