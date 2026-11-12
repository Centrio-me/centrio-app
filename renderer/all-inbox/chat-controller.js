'use strict'
// «Все мессенджеры» (3.8): keeps our conversation window in step with the chat open in the tab behind it, and sends
// what is typed through that tab with real input (the messenger itself sends it, nothing goes around it).
const { chatAdapterFor, fullPicture, withImageMemo, resolveImages } = require('./chat-adapters')
const { buildTimeline, signature } = require('./timeline')
const { createChatView } = require('./chat-view')
const { sameChat } = require('./same-chat')
const { createPending, withPending } = require('./pending')

const CHAT_POLL_MS = 1500
const READ_TIMEOUT_MS = 2500
const OLDER_THROTTLE_MS = 1500
const FOCUS_SETTLE_MS = 120
const TYPE_SETTLE_MS = 80
const AFTER_SEND_MS = 600
const PICTURE_TIMEOUT_MS = 6000
const HOVER_SETTLE_MS = 250
const POPUP_WAIT_MS = 5000
// the zones of a drag show up within a few frames
const ZONE_TRIES = 6
const ZONE_POLL_MS = 120
const POPUP_POLL_MS = 150
const AFTER_DROP_MS = 900
// a voice message is ready in a moment; a video of tens of megabytes may take a while to come from the messenger
const MEDIA_TIMEOUT_MS = 45000
// how often the messenger is told that the open chat is read, while it is in front of the person
const MARK_READ_EVERY_MS = 2000
const VOTE_TIMEOUT_MS = 8000
const AFTER_VOTE_MS = 400
const MEDIA_DATA = /^data:(audio|video)\/[\w.+-]+(;[\w=.+-]+)*;base64,/


const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms) => Promise.race([p, wait(ms).then(() => null)])

/** A real click inside a tab; a tab with its own zoom takes the point in screen pixels. */
// a right click inside the tab: MAX opens its message menu (edit, reactions) this way
const MENU_SETTLE_MS = 600
function contextAt(view, point) {
    let zoom = 1
    try { zoom = Number(view.getZoomFactor()) || 1 } catch {}
    const x = Math.round(point.x * zoom)
    const y = Math.round(point.y * zoom)
    view.sendInputEvent({ type: 'mouseMove', x, y })
    for (const type of ['mouseDown', 'mouseUp']) view.sendInputEvent({ type, x, y, button: 'right', clickCount: 1 })
}

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
function createChatController({ state, webviewOf, host, ipcRenderer, onSubtitle = () => {} }) {
    let current = null // { chat, adapter }
    let timer = null
    let lastOlder = 0
    let reading = false
    // what was just sent shows at once with a clock (pending.js); the rows of the last read are kept to redraw with it
    const pending = createPending()
    let lastRows = []
    function redraw() {
        const rows = withPending(lastRows, pending, Date.now())
        view.update(rows, signature(rows))
    }

    const view = createChatView({
        host,
        onSend: send,
        onOpenInTab: () => close(),
        onClose: () => close(),
        onDismissPending: (id) => { pending.drop(id); redraw() },
        onOlder: older,
        canReply: () => !!(current && typeof current.adapter.REPLY === 'function'),
        // edit an own message and react (3.8.3)
        onEdit: (m, text) => edit(m, text),
        canEdit: () => !!(current && (typeof current.adapter.EDIT === 'function' || current.adapter.contextEdit)),
        onReact: (m, emoji) => react(m, emoji),
        reactionsFor: () => (current ? reactions : []),
        // links open in the browser through the main process's usual scheme check
        onLink: (url) => ipcRenderer.send('open-url', url),
        onPickFiles: () => ipcRenderer.invoke('all-inbox:pick-files').catch(() => []),
        onDescribeFiles: (paths) => ipcRenderer.invoke('all-inbox:describe-files', paths).catch(() => []),
        onPasteImage: () => ipcRenderer.invoke('all-inbox:paste-image').catch(() => null),
        canPlay: () => !!(current && typeof current.adapter.MEDIA === 'function'),
        canVote: () => !!(current && typeof current.adapter.VOTE === 'function'),
        // a vote in a poll goes through the messenger's own vote; the poll is read again right after
        onVote: async (m, indexes) => {
            const w = tab()
            if (!w || !current || typeof current.adapter.VOTE !== 'function') return false
            const ok = (await run(w, current.adapter.VOTE(String(m.id).split('+')[0], indexes), VOTE_TIMEOUT_MS)) === true
            setTimeout(poll, AFTER_VOTE_MS)
            setTimeout(poll, AFTER_VOTE_MS * 4)
            return ok
        },
        // the sound or video of a message, taken from the tab by the messenger's own downloader
        onMedia: async (id) => {
            const w = tab()
            if (!w || !current || typeof current.adapter.MEDIA !== 'function') return null
            const got = await withTimeout(w.executeJavaScript(current.adapter.MEDIA(String(id).split('+')[0])).catch(() => null), MEDIA_TIMEOUT_MS)
            // only a sound or a video, in the type the data itself declares
            return got && typeof got.data === 'string' && MEDIA_DATA.test(got.data) ? { data: got.data, mime: got.data.slice(5, got.data.indexOf(';')) } : null
        },
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
            const data = await withTimeout(w.executeJavaScript(current.script).catch(() => null), READ_TIMEOUT_MS)
            if (!current || !data || !Array.isArray(data.messages)) return
            // only the chat the person chose is shown and written to
            current.match = sameChat(current.chat.title, data.title)
            view.setMismatch(!current.match, data.title)
            if (!current.match) return
            if (!current.confirmed) { current.confirmed = true; if (typeof current.onConfirmed === 'function') current.onConfirmed() }
            lastRows = buildTimeline(resolveImages(data.messages, current.images), Date.now())
            redraw()
            view.setCanWrite(data.canWrite !== false)
            markRead(w)
            const sub = [data.subtitle, current.chat.messengerName].filter(Boolean).join(' · ')
            view.setSubtitle(sub)
            onSubtitle(current.chat, data.subtitle)
        } finally {
            reading = false
        }
    }

    // The messenger behind our window does not see the person (the keyboard is in Centrio, the page counts as «away»),
    // so it would leave what was read unread: while the newest messages are really in front of the person, the
    // messenger is told itself (Telegram's and VK's own «read» — the same the page sends when it is looked at)
    let lastMarked = 0
    function markRead(w) {
        if (!current || typeof current.adapter.READ !== 'string' || !view.isReading()) return
        if (Date.now() - lastMarked < MARK_READ_EVERY_MS) return
        lastMarked = Date.now()
        w.executeJavaScript(current.adapter.READ).catch(() => {})
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
    // «Фото» or «Файл» (3.8.3): the messenger draws its zones while files are dragged over it; the drag starts over the
    // chat, the wanted zone is looked up, and the files are let go over it. A messenger without zones takes a plain drop.
    async function dropInto(w, point, paths, asFile) {
        let guestId = 0
        try { guestId = w.getWebContentsId() } catch { return false }
        if (typeof current.adapter.ZONE !== 'function') {
            return ipcRenderer.invoke('all-inbox:drop-files', { guestId, point, paths }).catch(() => false)
        }
        if (!(await ipcRenderer.invoke('all-inbox:drag-start', { guestId, point, paths }).catch(() => false))) return false
        let zone = null
        for (let i = 0; i < ZONE_TRIES && !zone; i++) {
            zone = await run(w, current.adapter.ZONE(asFile))
            if (!zone) await wait(ZONE_POLL_MS)
        }
        const at = zone && typeof zone.x === 'number' ? zone : point
        return ipcRenderer.invoke('all-inbox:drag-finish', { guestId, point: at }).catch(() => false)
    }

    async function sendFiles(w, files, text, asFile = false) {
        const point = await run(w, current.adapter.DROP)
        if (!point || typeof point.x !== 'number') return false
        const paths = files.map((f) => f.path)
        const dropped = await dropInto(w, point, paths, asFile)
        if (!dropped) return false
        if (current.adapter.sendsOnDrop) {
            // MAX has sent the files already; the text follows as its own message
            await wait(AFTER_DROP_MS)
            return text ? sendText(w, text) : true
        }
        // Telegram: its «send» window, the text as the caption, its own send button; MAX: its message field holding the file
        const popup = await waitSettled(w, current.adapter.MEDIA_POPUP, POPUP_WAIT_MS)
        if (!popup && current.adapter.dropMaySendAtOnce) return text ? sendText(w, text) : true
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

    // ── edit and react (3.8.3) ────────────────────────────────────────────────
    let reactions = []
    function loadReactions(adapter) {
        reactions = Array.isArray(adapter.REACTIONS) ? adapter.REACTIONS : []
        if (!adapter.REACTIONS_LIST) return
        const w = tab()
        if (w) run(w, adapter.REACTIONS_LIST).then((list) => { if (current && current.adapter === adapter && Array.isArray(list)) reactions = list.filter((e) => typeof e === 'string').slice(0, 8) })
    }

    // the chat in the tab is still the one in our window
    async function stillHere(w) {
        const data = await run(w, current.adapter.CHAT)
        if (!data || !sameChat(current.chat.title, data.title)) { view.setMismatch(true, data && data.title); return false }
        return true
    }

    // MAX: the message menu on a right click over the message
    async function openMessageMenu(w, id) {
        const point = await run(w, current.adapter.REPLY_POINT(id))
        if (!point || typeof point.x !== 'number') return false
        contextAt(w, point)
        await wait(MENU_SETTLE_MS)
        return true
    }
    function pressEscape(w) {
        w.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        w.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    }

    async function edit(m, text) {
        const w = tab()
        if (!w || !current || !m || !text) return false
        if (!(await stillHere(w))) return false
        const id = String(m.id).split('+')[0]
        let ok = false
        if (typeof current.adapter.EDIT === 'function') {
            ok = await run(w, current.adapter.EDIT(id, text)) === true
        } else if (current.adapter.contextEdit) {
            if (await openMessageMenu(w, id) && await run(w, current.adapter.MENU_ITEM('Редактировать'))) {
                await wait(FOCUS_SETTLE_MS * 3)
                const point = await run(w, current.adapter.COMPOSER)
                ok = !!point && typeof point.x === 'number' && await typeAt(w, point, text)
                if (ok) pressEnter(w)
            } else pressEscape(w)
        }
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function react(m, emoji) {
        const w = tab()
        if (!w || !current || !m || !emoji) return false
        if (!(await stillHere(w))) return false
        const id = String(m.id).split('+')[0]
        let ok = false
        if (typeof current.adapter.REACT === 'function') {
            ok = await run(w, current.adapter.REACT(id, emoji)) === true
        } else if (current.adapter.REACT_PICK) {
            const index = reactions.indexOf(emoji)
            if (index >= 0 && await openMessageMenu(w, id)) {
                ok = await run(w, current.adapter.REACT_PICK(index)) === true
                if (!ok) pressEscape(w)
            }
        }
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function send(text, files = [], reply = null, asFile = false) {
        const w = tab()
        if (!w || !current) return false
        // check again right before typing: the tab may have moved to another chat since the last read
        const data = await run(w, current.adapter.CHAT)
        if (!data || !sameChat(current.chat.title, data.title)) { view.setMismatch(true, data && data.title); return false }
        const knownIds = lastRows.filter((r) => r.type === 'msg' && r.out).map((r) => r.id)
        const pid = pending.add({ text, files, knownIds })
        redraw()
        const ok = await deliver(w, text, files, reply, asFile)
        if (!ok) pending.drop(pid)
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function deliver(w, text, files, reply, asFile = false) {
        // an answer to a message: the messenger itself is told which one, before anything is typed
        if (reply && typeof current.adapter.REPLY === 'function') {
            const id = String(reply.id).split('+')[0]
            // MAX: its reply button comes only under the mouse — the mouse is moved over the message first
            if (typeof current.adapter.REPLY_POINT === 'function') {
                const point = await run(w, current.adapter.REPLY_POINT(id))
                if (!point || typeof point.x !== 'number') return false
                let zoom = 1
                try { zoom = Number(w.getZoomFactor()) || 1 } catch {}
                w.sendInputEvent({ type: 'mouseMove', x: Math.round(point.x * zoom), y: Math.round(point.y * zoom) })
                await wait(HOVER_SETTLE_MS)
            }
            if (!(await run(w, current.adapter.REPLY(id)))) return false
            await wait(FOCUS_SETTLE_MS)
        }
        return files.length ? sendFiles(w, files, text, asFile) : sendText(w, text)
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
        // pictures cross from the tab once per opened chat (chat-adapters.js withImageMemo)
        const session = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        current = { chat, adapter, match: false, onConfirmed, confirmed: false, script: withImageMemo(adapter.CHAT, session), images: new Map() }
        loadReactions(adapter)
        pending.clear()
        lastRows = []
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
