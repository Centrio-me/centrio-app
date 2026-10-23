// The right-click menu of a messenger page in the main window.
//
// A <webview> shows no menu of its own. Electron tells us about a right-click only when the PAGE did not handle it
// (Telegram, Yandex Disk and others draw their own menu and keep it); then this file sends what was under the cursor to
// the main window, which draws our menu (renderer/page-menu.js) and sends back the chosen action. Everything that
// touches the page (copy, paste, spelling, history) is done here, on the guest's own webContents.
'use strict'

const { webContents, clipboard, shell } = require('electron')

const MAX_TEXT = 2000
const MAX_URL = 2048
const MAX_SUGGESTIONS = 4
const OPEN_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:'])
// Pages that only show a menu for a plain right-click on real content. blob:/data: are never opened outside.
const SEARCH_URL = {
    ru: 'https://yandex.ru/search/?text=',
    other: 'https://www.google.com/search?q='
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')

// Only what the menu needs, with every string bounded: this goes to our own window, but it came from a web page.
function snapshot(contents, params, hostZoom) {
    const flags = params.editFlags || {}
    return {
        wcId: contents.id,
        // For a <webview> Electron reports the point in the WINDOW (not in the page); the window may be zoomed.
        x: (Number(params.x) || 0) / hostZoom,
        y: (Number(params.y) || 0) / hostZoom,
        inWindow: true,
        linkURL: text(params.linkURL, MAX_URL),
        srcURL: text(params.srcURL, MAX_URL),
        mediaType: text(params.mediaType, 16),
        hasImageContents: params.hasImageContents === true,
        selectionText: text(params.selectionText, MAX_TEXT),
        isEditable: params.isEditable === true,
        misspelledWord: text(params.misspelledWord, 120),
        suggestions: (Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [])
            .filter((s) => typeof s === 'string').slice(0, MAX_SUGGESTIONS).map((s) => s.slice(0, 120)),
        pageURL: text(contents.getURL(), MAX_URL),
        canGoBack: contents.navigationHistory ? contents.navigationHistory.canGoBack() : contents.canGoBack(),
        canGoForward: contents.navigationHistory ? contents.navigationHistory.canGoForward() : contents.canGoForward(),
        flags: {
            canUndo: flags.canUndo === true, canRedo: flags.canRedo === true, canCut: flags.canCut === true,
            canCopy: flags.canCopy === true, canPaste: flags.canPaste === true, canSelectAll: flags.canSelectAll === true
        }
    }
}

// Called for every <webview> guest. A guest that lives in a separate window has its own small menu (detachedWindows.js).
function attach(contents, { getMainWindow }) {
    contents.on('context-menu', (_event, params) => {
        const main = getMainWindow()
        if (!main || main.isDestroyed() || contents.isDestroyed()) return
        if (contents.hostWebContents !== main.webContents) return
        main.webContents.send('pagemenu:show', snapshot(contents, params, main.webContents.getZoomFactor() || 1))
    })
}

// A guest we may act on: a <webview> hosted by the main window, nothing else.
function guestFor(getMainWindow, sender, wcId) {
    const main = getMainWindow()
    if (!main || main.isDestroyed() || sender !== main.webContents) return null
    const guest = webContents.fromId(Number(wcId))
    if (!guest || guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== main.webContents) return null
    return guest
}

function safeExternal(raw) {
    try {
        const url = new URL(String(raw))
        return OPEN_SCHEMES.has(url.protocol) ? url.toString() : null
    } catch { return null }
}

function searchUrl(language, query) {
    return (language === 'ru' ? SEARCH_URL.ru : SEARCH_URL.other) + encodeURIComponent(query.slice(0, 300))
}

const PAGE_ACTIONS = {
    back: (g) => { if (g.navigationHistory ? g.navigationHistory.canGoBack() : g.canGoBack()) g.goBack() },
    forward: (g) => { if (g.navigationHistory ? g.navigationHistory.canGoForward() : g.canGoForward()) g.goForward() },
    reload: (g) => g.reload(),
    undo: (g) => g.undo(),
    redo: (g) => g.redo(),
    cut: (g) => g.cut(),
    copy: (g) => g.copy(),
    paste: (g) => g.paste(),
    pasteText: (g) => g.pasteAndMatchStyle(),
    selectAll: (g) => g.selectAll()
}

function perform(guest, action, payload, language) {
    if (PAGE_ACTIONS[action]) { PAGE_ACTIONS[action](guest); return true }
    switch (action) {
        case 'replaceMisspelling':
            if (typeof payload === 'string' && payload) guest.replaceMisspelling(payload.slice(0, 120))
            return true
        case 'addToDictionary':
            if (typeof payload === 'string' && payload) guest.session.addWordToSpellCheckerDictionary(payload.slice(0, 120))
            return true
        case 'copyText':
            if (typeof payload === 'string' && payload) clipboard.writeText(payload.slice(0, MAX_URL))
            return true
        case 'copyImage': {
            const x = Number(payload && payload.x), y = Number(payload && payload.y)
            if (Number.isFinite(x) && Number.isFinite(y)) guest.copyImageAt(Math.round(x), Math.round(y))
            return true
        }
        case 'openExternal': {
            const url = safeExternal(payload)
            if (url) shell.openExternal(url).catch(() => {})
            return !!url
        }
        case 'searchWeb':
            if (typeof payload === 'string' && payload.trim()) shell.openExternal(searchUrl(language, payload.trim())).catch(() => {})
            return true
        default:
            return false
    }
}

function handleAction({ getMainWindow, language }, sender, wcId, action, payload) {
    const guest = guestFor(getMainWindow, sender, wcId)
    if (!guest) return false
    try { return perform(guest, String(action), payload, language()) } catch { return false }
}

module.exports = { attach, handleAction, safeExternal, searchUrl }
