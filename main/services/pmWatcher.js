// Password manager — page side (2026-10-06). Runs for every messenger/site tab (<webview> contents).
//
// The page cannot talk to Electron (the <webview preload> does not run on this Electron version), so a small script
// injected from here reports two things through console.debug, which the main process hears synchronously:
//  - 'form': the page now shows (or no longer shows) a sign-in form -> the app offers saved passwords;
//  - 'cap':  the user just submitted a login+password -> the app asks "save this password?".
// The site and its address are always taken from the contents themselves, never from the message.
const pm = require('./passwordManager')

const TAG = '__CENTRIO_PM__'

// Runs INSIDE the page. Plain ES5-ish, idempotent per document.
function pageScript(tag) {
    if (window.__centrioPm) { try { window.__centrioPm.report(true) } catch (e) {} return 'again' }
    var log = console.debug.bind(console)
    function send(payload) { try { log(tag + JSON.stringify(payload)) } catch (e) {} }
    function visible(el) {
        try {
            var s = window.getComputedStyle(el)
            if (s.display === 'none' || s.visibility === 'hidden') return false
            return !!(el.getClientRects && el.getClientRects().length) && !el.disabled
        } catch (e) { return false }
    }
    function all(selector) { return Array.prototype.filter.call(document.querySelectorAll(selector), visible) }
    var USER_SELECTOR = 'input[autocomplete~="username"], input[type="email"], input[type="tel"], input[type="text"], input:not([type])'
    function passwordFields() { return all('input[type="password"]') }
    function looksLikeLogin(el) {
        var hint = ((el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase()
        return el.type === 'email' || el.type === 'tel' || /login|e-?mail|user|phone|логин|почт|телефон/.test(hint)
    }
    var lastForm = null
    var lastUser = ''
    // A lone e-mail/phone field is a sign-in step only when its form talks about signing in (not "Subscribe").
    function looksLikeSignInStep(el) {
        if (/username/.test((el.getAttribute('autocomplete') || '').toLowerCase())) return true
        var box = el.form || el.closest('form') || el.parentElement
        for (var i = 0; i < 3 && box && box.parentElement && !box.querySelector('button, input[type="submit"]'); i++) box = box.parentElement
        var text = ''
        if (box) Array.prototype.forEach.call(box.querySelectorAll('button, input[type="submit"], [role="button"]'), function (b) { text += ' ' + (b.textContent || b.value || '') })
        text = text.toLowerCase()
        return /log ?in|sign ?in|войти|вход|продолж|далее|continue|next/.test(text) && !/subscribe|подпис|newsletter|sign ?up|register|регистр/.test(text)
    }
    function formKind() {
        if (passwordFields().length) return 2
        var fields = all(USER_SELECTOR)
        for (var i = 0; i < fields.length; i++) if (looksLikeLogin(fields[i]) && looksLikeSignInStep(fields[i])) return 1
        return 0
    }
    function report(force) {
        var kind = formKind()
        if (!force && kind === lastForm) return
        lastForm = kind
        send({ t: 'form', f: kind > 0, pw: kind === 2 })
    }
    function usernameFor(passwordField) {
        var scope = passwordField.form || document
        var fields = Array.prototype.filter.call(scope.querySelectorAll(USER_SELECTOR), visible)
        var best = ''
        for (var i = 0; i < fields.length; i++) {
            if (fields[i] === passwordField) continue
            if (fields[i].compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING && fields[i].value) best = fields[i].value
        }
        return best || lastUser
    }
    var lastSentKey = ''
    var lastSentAt = 0
    function capture() {
        var fields = passwordFields().filter(function (f) { return f.value })
        if (!fields.length) return
        var field = fields[0]
        var user = usernameFor(field)
        var key = user + '\u0000' + field.value
        if (key === lastSentKey && Date.now() - lastSentAt < 4000) return
        lastSentKey = key
        lastSentAt = Date.now()
        send({ t: 'cap', u: user, p: field.value })
    }
    document.addEventListener('input', function (e) {
        var el = e.target
        if (el && el.tagName === 'INPUT' && el.type !== 'password' && looksLikeLogin(el) && el.value) lastUser = el.value
    }, true)
    document.addEventListener('submit', capture, true)
    document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('button, input[type="submit"], [role="button"], a') : null
        if (el && e.isTrusted) setTimeout(capture, 0)
    }, true)
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.isTrusted && e.target && e.target.tagName === 'INPUT') capture()
    }, true)
    var timer = null
    new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(function () { report(false) }, 400) })
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
    window.__centrioPm = { report: report }
    report(true)
    return 'installed'
}

const SCRIPT = `(${pageScript.toString()})(${JSON.stringify(TAG)})`

function messageText(args) {
    // Electron 35+ passes one details object; older builds pass (event, level, message, ...).
    const first = args[0]
    if (first && typeof first === 'object' && typeof first.message === 'string') return first.message
    return typeof args[2] === 'string' ? args[2] : ''
}

/** Hooks one messenger tab. Safe to call on every dom-ready: the listener is added once, the script re-injected. */
function attach(contents, messengerId, getMainWindow) {
    if (!contents || contents.isDestroyed()) return
    const send = (payload) => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) win.webContents.send('pm:event', { messengerId, ...payload })
    }
    if (!contents.__centrioPmAttached) {
        contents.__centrioPmAttached = true
        contents.on('console-message', (...args) => {
            const text = messageText(args)
            if (!text.startsWith(TAG)) return
            let data = null
            try { data = JSON.parse(text.slice(TAG.length)) } catch { return }
            if (!data || typeof data !== 'object') return
            const url = contents.getURL()
            if (data.t === 'form') {
                send({ type: 'form', hasForm: data.f === true, hasPassword: data.pw === true, url })
            } else if (data.t === 'cap' && typeof data.p === 'string') {
                const offer = pm.registerCapture({ messengerId, url, title: contents.getTitle(), login: typeof data.u === 'string' ? data.u : '', password: data.p })
                if (offer) send({ type: 'capture', url, ...offer })
            }
        })
        contents.on('did-navigate-in-page', () => { contents.executeJavaScript(SCRIPT).catch(() => {}) })
    }
    contents.executeJavaScript(SCRIPT).catch(() => {})
}

module.exports = { attach }
