// "Files in separate windows": an option of a messenger (a cloud drive, say) that makes every file it opens appear in a
// window of its own, so several files can be open side by side while the list stays where it was.
//
// A cloud page opens a file in one of two ways, and both end up here:
//   - window.open(): the page asks for a new window. Without the option the popup handler in registerAppEvents.js loads the
//     page into the messenger's own tab instead; with it, the address goes to a link window (detachedWindows.openLink).
//   - an in-page address change (history.pushState, e.g. Yandex Disk's `?dialog=slider` preview or Mail.ru Cloud's
//     /home/folder/photo.jpg): the page cannot be stopped, so the address is opened in a link window and the tab is sent
//     one step back, which closes the preview again.
// Nothing happens unless the user turned the option on for that messenger.
'use strict'

const store = require('./store')
const detachedWindows = require('./detachedWindows')

// A path that ends like a page is navigation, not a file.
const PAGE_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'php', 'asp', 'aspx', 'jsp', 'cgi'])
// A page may open the same file again right after the tab steps back (the second click of a double click), so the tab
// steps back each time; this only stops a page that keeps re-opening it.
const BACK_WINDOW_MS = 2500
const BACK_MAX = 4

function recordFor(messengerId) {
    const list = store.get('messengers', []) || []
    return list.find((m) => m && String(m.id) === String(messengerId)) || null
}

function isEnabled(messengerId) {
    if (!messengerId) return false
    const flags = store.get('filesInWindows', {}) || {}
    return flags[String(messengerId)] === true
}

// Only an http(s) address that looks like a file or a preview of one.
function looksLikeFileUrl(raw) {
    let url
    try { url = new URL(String(raw)) } catch { return false }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.searchParams.get('dialog') === 'slider') return true
    const match = url.pathname.match(/\.([a-z0-9]{2,5})$/i)
    return !!match && !PAGE_EXTENSIONS.has(match[1].toLowerCase())
}

function openInWindow(messengerId, url) {
    const record = recordFor(messengerId)
    if (!record) return false
    const result = detachedWindows.openLink(record, url)
    return !!(result && result.success)
}

function goBack(contents) {
    const history = contents.navigationHistory
    if (history ? history.canGoBack() : contents.canGoBack()) {
        if (history) history.goBack(); else contents.goBack()
    }
}

// In-page address changes of one messenger page.
function watch(contents, { findMessengerId }) {
    let backs = []
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
        if (isMainFrame === false) return
        const messengerId = findMessengerId(contents.session)
        if (!isEnabled(messengerId) || !looksLikeFileUrl(url)) return
        if (!openInWindow(messengerId, url)) return
        const now = Date.now()
        backs = backs.filter((t) => now - t < BACK_WINDOW_MS)
        if (backs.length >= BACK_MAX) return
        backs.push(now)
        try { goBack(contents) } catch { /* the page is gone */ }
    })
}

module.exports = { watch, isEnabled, openInWindow, looksLikeFileUrl }
