'use strict'
// «Все мессенджеры» (3.8): keeps our conversation window in step with the chat open in the tab behind it, and sends
// what is typed through that tab with real input (the messenger itself sends it, nothing goes around it).
const { chatAdapterFor, fullPicture } = require('./chat-adapters')
const { buildTimeline, signature } = require('./timeline')
const { createChatView } = require('./chat-view')
const { sameChat } = require('./same-chat')

const CHAT_POLL_MS = 1500
const READ_TIMEOUT_MS = 2500
const OLDER_THROTTLE_MS = 1500
const FOCUS_SETTLE_MS = 120
const TYPE_SETTLE_MS = 80
const AFTER_SEND_MS = 600
const PICTURE_TIMEOUT_MS = 6000
const POPUP_WAIT_MS = 5000
const POPUP_POLL_MS = 150
const AFTER_DROP_MS = 900


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
 * @param {{ state: object, webviewOf: (id: string) => any, host: HTMLElement,
 *   ipcRenderer: { send: Function, invoke: Function } }} deps — the IPC shim of renderer.js (the page has no Node)
 */
function createChatController({ state, webviewOf, host, ipcRenderer }) {
    let current = null // { chat, adapter }
    let timer = null
    let lastOlder = 0
    let reading = false

    const view = createChatView({
        host,
        onSend: send,
        onOpenInTab: () => close(),
        onClose: () => close(),
        onOlder: older,
        // links open in the browser through the main process's usual scheme check
        onLink: (url) => ipcRenderer.send('open-url', url),
        onPickFiles: () => ipcRenderer.invoke('all-inbox:pick-files').catch(() => []),
        onDescribeFiles: (paths) => ipcRenderer.invoke('all-inbox:describe-files', paths).catch(() => []),
        onPasteImage: () => ipcRenderer.invoke('all-inbox:paste-image').catch(() => null),
        onPicture: async (key) => {
            const w = tab()
            if (!w) return ''
            const data = await withTimeout(w.executeJavaScript(fullPicture(key)).catch(() => ''), PICTURE_TIMEOUT_MS)
            return typeof data === 'string' && data.startsWith('data:image/') ? data : ''
        }
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
            view.setCanWrite(data.canWrite !== false)
            const sub = [data.subtitle, current.chat.messengerName].filter(Boolean).join(' · ')
            view.setSubtitle(sub)
        } finally {
            reading = false
        }
    }

    const run = (w, code, ms = READ_TIMEOUT_MS) => withTimeout(w.executeJavaScript(code).catch(() => null), ms)

    function pressEnter(w) {
        w.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        w.sendInputEvent({ type: 'char', keyCode: '\r' })
        w.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    }

    // what is typed in our window is exactly what goes: a draft left in the tab's field (Telegram also moves it into
    // the caption of files) is replaced, not glued to the front
    function selectAll(w) {
        w.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
        w.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
    }

    async function typeAt(w, point, text) {
        clickAt(w, point)
        await wait(FOCUS_SETTLE_MS)
        selectAll(w)
        await wait(TYPE_SETTLE_MS)
        try {
            if (text) w.insertText(text)
            else { w.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); w.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }) }
        } catch { return false }
        await wait(TYPE_SETTLE_MS)
        return true
    }

    async function sendText(w, text) {
        const point = await run(w, current.adapter.COMPOSER)
        if (!point || typeof point.x !== 'number') return false
        if (!(await typeAt(w, point, text))) return false
        pressEnter(w)
        return true
    }

    // the window has stopped moving: the same place twice in a row
    async function waitSettled(w, code, ms) {
        const until = Date.now() + ms
        let last = ''
        while (Date.now() < until) {
            const found = await run(w, code)
            const here = found ? JSON.stringify(found) : ''
            if (found && here === last) return found
            last = here
            await wait(POPUP_POLL_MS)
        }
        return null
    }

    // Files go to the page as a real drag-and-drop; the messenger uploads and sends them itself
    async function sendFiles(w, files, text) {
        const point = await run(w, current.adapter.DROP)
        if (!point || typeof point.x !== 'number') return false
        let guestId = 0
        try { guestId = w.getWebContentsId() } catch { return false }
        const paths = files.map((f) => f.path)
        const dropped = await ipcRenderer.invoke('all-inbox:drop-files', { guestId, point, paths }).catch(() => false)
        if (!dropped) return false
        if (current.adapter.sendsOnDrop) {
            // MAX has sent the files already; the text follows as its own message
            await wait(AFTER_DROP_MS)
            return text ? sendText(w, text) : true
        }
        // Telegram: its «send» window, the text as the caption, its own send button
        const popup = await waitSettled(w, current.adapter.MEDIA_POPUP, POPUP_WAIT_MS)
        if (!popup || !popup.send) return false
        // Enter in the caption sends; a click while the window still slides in would land on its backdrop and close it
        if (popup.caption) {
            if (!(await typeAt(w, popup.caption, text))) return false
            pressEnter(w)
        } else {
            clickAt(w, popup.send)
        }
        return true
    }

    async function send(text, files = []) {
        const w = tab()
        if (!w || !current) return false
        // check again right before typing: the tab may have moved to another chat since the last read
        const data = await run(w, current.adapter.CHAT)
        if (!data || !sameChat(current.chat.title, data.title)) { view.setMismatch(true, data && data.title); return false }
        const ok = files.length ? await sendFiles(w, files, text) : await sendText(w, text)
        await wait(AFTER_SEND_MS)
        poll()
        return ok
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
