'use strict'
// «Все мессенджеры» (3.8): keeps our conversation window in step with the chat open in the tab behind it, and sends
// what is typed through that tab with real input (the messenger itself sends it, nothing goes around it).
const { chatAdapterFor } = require('./chat-adapters')
const { buildTimeline, signature } = require('./timeline')
const { createChatView } = require('./chat-view')
const { sameChat } = require('./same-chat')

const CHAT_POLL_MS = 1500
const READ_TIMEOUT_MS = 2500
const OLDER_THROTTLE_MS = 1500
const FOCUS_SETTLE_MS = 120
const TYPE_SETTLE_MS = 80
const AFTER_SEND_MS = 600

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms) => Promise.race([p, wait(ms).then(() => null)])

/** A real click inside a tab; a tab with its own zoom takes the point in screen pixels. */
function clickAt(view, point) {
    let zoom = 1
    try { zoom = Number(view.getZoomFactor()) || 1 } catch {}
    const x = Math.round(point.x * zoom)
    const y = Math.round(point.y * zoom)
    for (const type of ['mouseDown', 'mouseUp']) view.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 })
}

/**
 * @param {{ state: object, webviewOf: (id: string) => any, host: HTMLElement }} deps
 */
function createChatController({ state, webviewOf, host }) {
    let current = null // { chat, adapter }
    let timer = null
    let lastOlder = 0
    let reading = false

    const view = createChatView({
        host,
        onSend: send,
        onOpenInTab: () => close(),
        onClose: () => close(),
        onOlder: older
    })

    function tab() {
        return current ? webviewOf(current.chat.messengerId) : null
    }

    async function poll() {
        if (!current || reading) return
        // the person switched to a messenger themselves: our window steps aside
        if (state.activeTabId !== current.chat.messengerId) { close(); return }
        const w = tab()
        if (!w) return
        reading = true
        try {
            const data = await withTimeout(w.executeJavaScript(current.adapter.CHAT).catch(() => null), READ_TIMEOUT_MS)
            if (!current || !data || !Array.isArray(data.messages)) return
            // only the chat the person chose is shown and written to
            current.match = sameChat(current.chat.title, data.title)
            view.setMismatch(!current.match, data.title)
            if (!current.match) return
            if (!current.confirmed) { current.confirmed = true; if (typeof current.onConfirmed === 'function') current.onConfirmed() }
            const rows = buildTimeline(data.messages, Date.now())
            view.update(rows, signature(rows))
            const sub = [data.subtitle, current.chat.messengerName].filter(Boolean).join(' · ')
            view.setSubtitle(sub)
        } finally {
            reading = false
        }
    }

    async function send(text) {
        const w = tab()
        if (!w || !current) return false
        // check again right before typing: the tab may have moved to another chat since the last read
        const data = await withTimeout(w.executeJavaScript(current.adapter.CHAT).catch(() => null), READ_TIMEOUT_MS)
        if (!data || !sameChat(current.chat.title, data.title)) { view.setMismatch(true, data && data.title); return false }
        const point = await withTimeout(w.executeJavaScript(current.adapter.COMPOSER).catch(() => null), READ_TIMEOUT_MS)
        if (!point || typeof point.x !== 'number') return false
        clickAt(w, point)
        await wait(FOCUS_SETTLE_MS)
        try { w.insertText(text) } catch { return false }
        await wait(TYPE_SETTLE_MS)
        w.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        w.sendInputEvent({ type: 'char', keyCode: '\r' })
        w.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        await wait(AFTER_SEND_MS)
        poll()
        return true
    }

    function older() {
        const w = tab()
        if (!w || !current || Date.now() - lastOlder < OLDER_THROTTLE_MS) return
        lastOlder = Date.now()
        w.executeJavaScript(current.adapter.OLDER).catch(() => {})
    }

    /** @returns {boolean} whether our window took over (the messenger has a chat adapter) */
    function open(chat, adapterId, onConfirmed) {
        const adapter = chatAdapterFor(adapterId)
        if (!adapter) { close(); return false }
        current = { chat, adapter, match: false, onConfirmed, confirmed: false }
        view.show(chat)
        view.setMismatch(true, '')
        clearInterval(timer)
        timer = setInterval(poll, CHAT_POLL_MS)
        setTimeout(poll, 300)
        return true
    }

    function close() {
        current = null
        clearInterval(timer)
        timer = null
        view.hide()
    }

    return { open, close, isOpen: () => !!current }
}

module.exports = { createChatController, clickAt }
