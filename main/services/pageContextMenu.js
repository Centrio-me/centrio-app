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
        noteMisspelling(contents.id, text(params.misspelledWord, 120))
        main.webContents.send('pagemenu:show', snapshot(contents, params, main.webContents.getZoomFactor() || 1))
    })
    contents.once('destroyed', () => forgetMisspelling(contents.id))
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

// The menu of Centrio is drawn in our window, so a click on it takes the keyboard focus from the tab. Copy, paste and the like
// must act on the TAB, the way Ctrl+C / Ctrl+V do (the menu's «Вставить» did nothing after Telegram's own «Копировать», while Ctrl+V
// pasted everything): the tab is focused first and the command follows once the focus has moved.
const FOCUS_SETTLE_MS = 40
const onTabFocus = (run) => (g) => {
    try { g.focus() } catch { /* a tab that cannot take focus: the command still goes */ }
    setTimeout(() => { try { if (!g.isDestroyed || !g.isDestroyed()) run(g) } catch { /* the tab went meanwhile */ } }, FOCUS_SETTLE_MS)
}

// The typo under the cursor at the moment the menu opened, per tab: Chromium leaves it SELECTED, so after a suggestion is chosen the
// selection still reading as that word means the replacement did not happen and the suggestion is typed over it instead.
const misspelledByTab = new Map()
const SPELL_CHECK_DELAY_MS = 80
const noteMisspelling = (id, word) => { if (word) misspelledByTab.set(id, word); else misspelledByTab.delete(id) }
const forgetMisspelling = (id) => { misspelledByTab.delete(id) }

function replaceWord(guest, word) {
    const wrong = misspelledByTab.get(guest.id) || ''
    onTabFocus((g) => {
        g.replaceMisspelling(word)
        if (!wrong) return
        setTimeout(() => {
            if (g.isDestroyed && g.isDestroyed()) return
            g.executeJavaScript('String(window.getSelection())')
                .then((selected) => { if (typeof selected === 'string' && selected.trim() === wrong) g.insertText(word) })
                .catch(() => { /* the page went meanwhile: nothing to fix */ })
        }, SPELL_CHECK_DELAY_MS)
    })(guest)
}

const PAGE_ACTIONS = {
    back: (g) => { if (g.navigationHistory ? g.navigationHistory.canGoBack() : g.canGoBack()) g.goBack() },
    forward: (g) => { if (g.navigationHistory ? g.navigationHistory.canGoForward() : g.canGoForward()) g.goForward() },
    reload: (g) => g.reload(),
    undo: onTabFocus((g) => g.undo()),
    redo: onTabFocus((g) => g.redo()),
    cut: onTabFocus((g) => g.cut()),
    copy: onTabFocus((g) => g.copy()),
    paste: onTabFocus((g) => g.paste()),
    pasteText: onTabFocus((g) => g.pasteAndMatchStyle()),
    selectAll: onTabFocus((g) => g.selectAll())
}

function perform(guest, action, payload, language) {
    if (PAGE_ACTIONS[action]) { PAGE_ACTIONS[action](guest); return true }
    switch (action) {
        case 'replaceMisspelling':
            if (typeof payload === 'string' && payload) replaceWord(guest, payload.slice(0, 120))
            return true
        case 'addToDictionary':
            if (typeof payload === 'string' && payload) {
                guest.session.addWordToSpellCheckerDictionary(payload.slice(0, 120))
                require('./spellcheck').addWord(payload)
            }
            return true
        case 'insertText':
            // the selection of the field is replaced by the text (a translation)
            if (typeof payload === 'string' && payload) onTabFocus((g) => g.insertText(payload.slice(0, MAX_FIELD_TEXT)))(guest)
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

const MAX_FIELD_TEXT = 20000
const READ_FIELD_SCRIPT = `(function () {
    var e = document.activeElement
    if (!e) return ''
    var tag = (e.tagName || '').toLowerCase()
    if (tag === 'textarea' || tag === 'input') return String(e.value || '')
    if (e.isContentEditable) return String(e.innerText || '')
    return ''
})()`

// What is written in the field that has the focus (a plain field or an editable block), for the translator and the spell fixer
async function readField(guest) {
    try {
        const text = await guest.executeJavaScript(READ_FIELD_SCRIPT)
        return typeof text === 'string' ? text.slice(0, MAX_FIELD_TEXT) : ''
    } catch { return '' }
}

// The whole text of the field is replaced by `text`: the field is focused, everything in it selected, the text typed over it
function replaceField(guest, text) {
    if (typeof text !== 'string') return false
    onTabFocus((g) => { g.selectAll(); setTimeout(() => { try { if (!g.isDestroyed()) g.insertText(text.slice(0, MAX_FIELD_TEXT)) } catch { /* the tab went meanwhile */ } }, FOCUS_SETTLE_MS) })(guest)
    return true
}

function handleAction({ getMainWindow, language }, sender, wcId, action, payload) {
    const guest = guestFor(getMainWindow, sender, wcId)
    if (!guest) return false
    try { return perform(guest, String(action), payload, language()) } catch { return false }
}

module.exports = { attach, handleAction, perform, safeExternal, searchUrl, guestFor, noteMisspelling, forgetMisspelling, readField, replaceField }
