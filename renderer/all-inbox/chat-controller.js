'use strict'
// «Все мессенджеры» (3.8): keeps our conversation window in step with the chat open in the tab behind it, and sends
// what is typed through that tab with real input (the messenger itself sends it, nothing goes around it).
const { chatAdapterFor, fullPicture, withImageMemo, resolveImages, missingImages } = require('./chat-adapters')
const { canEditNow } = require('./edit-window')
const { toggleReaction, overlayReactions } = require('./quick-reactions')
const { setEmojiSet } = require('./emoji-images')
const { buildTimeline, signature } = require('./timeline')
const { createChatView } = require('./chat-view')
const { sameChat } = require('./same-chat')
const { createPending, withPending } = require('./pending')
const { isAway, isHidden, onAttentionChange } = require('../window-attention')
const { toMessenger, runsOf } = require('./text-format')

const CHAT_POLL_MS = 1500
// a chat not shown by then is said to have not opened, with the way to the messenger itself
const STUCK_AFTER_MS = 10000
// a tab found on another chat is brought back to the right one this many times, this far apart
const REOPEN_TRIES = 3
const REOPEN_AFTER_MS = 2500
// the open chat is read this seldom while another window is in front; not at all while Centrio is hidden
const AWAY_POLL_MS = 6000
const READ_TIMEOUT_MS = 2500
const OLDER_THROTTLE_MS = 1500
const FOCUS_SETTLE_MS = 120
const TYPE_SETTLE_MS = 80
const AFTER_SEND_MS = 600
const PICTURE_TIMEOUT_MS = 6000
// a WhatsApp photo may first be asked from the phone
const STORE_PICTURE_TIMEOUT_MS = 25000
const HOVER_SETTLE_MS = 250
const POPUP_WAIT_MS = 5000
// the zones of a drag show up within a few frames
const ZONE_TRIES = 6
const ZONE_POLL_MS = 120
const POPUP_POLL_MS = 150
const AFTER_DROP_MS = 900
// a voice message is ready in a moment; a video of tens of megabytes may take a while to come from the messenger
const MEDIA_TIMEOUT_MS = 120000
// how often the messenger is told that the open chat is read, while it is in front of the person
const MARK_READ_EVERY_MS = 2000
const VOTE_TIMEOUT_MS = 8000
// WhatsApp uploads documents itself before it answers
const DOCUMENTS_TIMEOUT_MS = 120000
// the messengers whose message field takes bold, italic, underline and strikethrough from keys (checked live)
const KEYED_FORMATTING = new Set(['telegram', 'max'])
const FORMAT_KEYS = { bold: ['B', ['control']], italic: ['I', ['control']], underline: ['U', ['control']], strike: ['X', ['control', 'shift']] }
const FORMAT_SETTLE_MS = 60
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
function createChatController({ state, webviewOf, host, ipcRenderer, onSubtitle = () => {}, onClosed = () => {}, onHidden = () => {},
    onReopen = () => Promise.resolve(false), onOpenTab = () => {} }) {
    let current = null // { chat, adapter }
    let timer = null
    let lastOlder = 0
    let reading = false
    // what was just sent shows at once with a clock (pending.js); the rows of the last read are kept to redraw with it
    const pending = createPending()
    let lastRows = []
    // reactions shown the moment they are pressed, until the messenger's data says the same (quick-reactions.js)
    const pressed = new Map()
    function redraw() {
        const rows = overlayReactions(withPending(lastRows, pending, Date.now()), pressed)
        view.update(rows, signature(rows))
    }

    const view = createChatView({
        host,
        onSend: send,
        // closed by the person: a chat still on its way to open must not come back (all-inbox.js openChat)
        onOpenInTab: () => { const chat = current && current.chat; close(); onClosed(); if (chat) onOpenTab(chat) },
        onClose: () => { close(); onClosed() },
        onDismissPending: (id) => { pending.drop(id); redraw() },
        onOlder: older,
        canReply: () => !!(current && typeof current.adapter.REPLY === 'function'),
        // edit an own message and react (3.8.3)
        onEdit: (m, text) => edit(m, text),
        canEdit: (m, dayLabel) => !!(current && (typeof current.adapter.EDIT === 'function' || current.adapter.contextEdit)
            && canEditNow(m, dayLabel, current.adapter.EDIT_WINDOW_MS || 0)),
        onReact: (m, emoji) => react(m, emoji),
        reactionsFor: () => (current ? reactions : []),
        // delete an own message (3.8.3); it leaves our window when the messenger has removed it
        onDelete: (m, forAll) => removeMessage(m, forAll),
        canDelete: (m) => !!(m && m.out && current && (typeof current.adapter.DELETE === 'function' || current.adapter.DELETE_CONFIRM)),
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
            // WhatsApp: the photo from its own store (asked from the phone if the server no longer has it)
            const fromStore = typeof current.adapter.FULL_PICTURE === 'function' && String(key).startsWith('wa:')
            const code = fromStore ? current.adapter.FULL_PICTURE(String(key).slice(3)) : fullPicture(key)
            const data = await withTimeout(w.executeJavaScript(code).catch(() => ''), fromStore ? STORE_PICTURE_TIMEOUT_MS : PICTURE_TIMEOUT_MS)
            return typeof data === 'string' && data.startsWith('data:image/') ? data : ''
        }
    })

    // back to the window: the chat is read at once
    onAttentionChange(() => { if (current && !isAway()) poll() })

    const newSession = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

    // a messenger chosen by the person (sidebar, split pane) while our window is open: the window steps aside; our own
    // switch to the chat's messenger is not that (renderer.js switchTab sends centrio-switch-request first)
    document.addEventListener('centrio-switch-request', (e) => {
        const id = e && e.detail && e.detail.id
        if (current && id && id !== current.chat.messengerId) close()
    })

    function tab() {
        return current ? webviewOf(current.chat.messengerId) : null
    }

    let lastPollAt = 0
    // the messenger being typed into: Telegram and MAX take formatting from their own keys
    let typingFor = ''
    async function poll() {
        if (!current || reading) return
        if (current.confirmed && (isHidden() || (isAway() && Date.now() - lastPollAt < AWAY_POLL_MS))) return
        lastPollAt = Date.now()
        // the person switched to a messenger themselves: our window steps aside. In a split the messenger is kept under
        // our window without being the active tab (all-inbox.js hostTab) — there a click on a messenger says it instead
        if (!state.splitMode && state.activeTabId !== current.chat.messengerId) { close(); return }
        const w = tab()
        if (!w) return
        reading = true
        const cur = current
        try {
            const data = await withTimeout(w.executeJavaScript(cur.script).catch(() => null), READ_TIMEOUT_MS)
            // the person opened another chat while this was read: its answer belongs to the old one
            if (current !== cur) return
            if (!cur.confirmed && Date.now() - cur.openedAt > STUCK_AFTER_MS) view.setStuck()
            if (!data || !Array.isArray(data.messages)) return
            // only the chat the person chose is shown and written to
            current.match = sameChat(current.chat.title, data.title)
            cur.misses = current.match ? 0 : (cur.misses || 0) + 1
            // a chat already shown is not wiped by one read with an empty or flickering title (the conversation turned into
            // the opening mark and the place in the history was lost, 3.8.3 check): two misses in a row say it really moved
            if (!current.match && cur.confirmed && cur.misses < 2) return
            // the tab is on another chat: the right one is opened again (up to three times), instead of telling the person
            // «another chat is open» (owner 2026-11-13: «ты всегда должен открывать правильный чат в скрытом окне»)
            if (!current.match && (cur.confirmed || Date.now() - cur.openedAt > REOPEN_AFTER_MS) && (cur.reopens || 0) < REOPEN_TRIES) {
                if (Date.now() - (cur.reopenedAt || 0) > REOPEN_AFTER_MS) {
                    cur.reopens = (cur.reopens || 0) + 1
                    cur.reopenedAt = Date.now()
                    cur.misses = 0
                    Promise.resolve(onReopen(cur.chat, cur.reopens)).catch(() => {})
                }
                // meanwhile the conversation already shown stays (sending is checked against the tab anyway)
                return
            }
            // until the chat is first seen, the tab is still on its way to it: the opening mark, not «another chat is open»
            view.setMismatch(!current.match, cur.confirmed ? data.title : '')
            if (!current.match) return
            if (!current.confirmed) { current.confirmed = true; if (typeof current.onConfirmed === 'function') current.onConfirmed() }
            cur.reopens = 0
            // a picture whose answer was lost: a new session, so the next read brings every picture again
            if (missingImages(data.messages, cur.images)) cur.script = withImageMemo(cur.adapter.CHAT, newSession())
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
        const runs = KEYED_FORMATTING.has(typingFor) && text ? runsOf(text) : null
        if (runs && runs.some((r) => r.marks.length)) return typeRuns(w, runs)
        try {
            if (text) w.insertText(text)
            else { w.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); w.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }) }
        } catch { return false }
        await wait(TYPE_SETTLE_MS)
        return true
    }

    // Telegram and MAX: bold, italic, underline and strikethrough typed with the messenger's own keys, run by run — the
    // mark is turned on before its words and off after them (both fields keep it for what is typed next)
    async function typeRuns(w, runs) {
        try {
            w.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); w.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
            await wait(TYPE_SETTLE_MS)
            const on = new Set()
            const press = (name) => { const [code, mods] = FORMAT_KEYS[name]; w.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: mods }); w.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: mods }) }
            // Telegram's field has no key for strikethrough: it turns «~~words~~» typed by hand into it (checked live)
            const strikeByHand = typingFor === 'telegram'
            const typeChars = async (chars) => { for (const ch of chars) { w.sendInputEvent({ type: 'char', keyCode: ch }); await wait(25) } }
            for (const run of runs) {
                for (const name of Object.keys(FORMAT_KEYS)) {
                    if (strikeByHand && name === 'strike') continue
                    if (on.has(name) !== run.marks.includes(name)) { press(name); if (on.has(name)) on.delete(name); else on.add(name) }
                }
                await wait(FORMAT_SETTLE_MS)
                const struck = strikeByHand && run.marks.includes('strike')
                if (struck) await typeChars('~~')
                w.insertText(run.text)
                if (struck) await typeChars('~~')
                await wait(FORMAT_SETTLE_MS)
            }
            for (const name of [...on]) press(name)
        } catch { return false }
        await wait(TYPE_SETTLE_MS)
        return true
    }

    async function sendText(w, text, cur = current) {
        // checked right before typing: files may have taken seconds, and the person may have opened another chat since
        if (!(await stillHere(w, cur))) return false
        const point = await run(w, cur.adapter.COMPOSER)
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
    async function dropInto(w, point, paths, asFile, cur = current) {
        let guestId = 0
        try { guestId = w.getWebContentsId() } catch { return false }
        if (typeof cur.adapter.ZONE !== 'function') {
            return ipcRenderer.invoke('all-inbox:drop-files', { guestId, point, paths }).catch(() => false)
        }
        if (!(await ipcRenderer.invoke('all-inbox:drag-start', { guestId, point, paths }).catch(() => false))) return false
        let zone = null
        for (let i = 0; i < ZONE_TRIES && !zone; i++) {
            zone = await run(w, cur.adapter.ZONE(asFile))
            if (!zone) await wait(ZONE_POLL_MS)
        }
        const at = zone && typeof zone.x === 'number' ? zone : point
        return ipcRenderer.invoke('all-inbox:drag-finish', { guestId, point: at }).catch(() => false)
    }

    async function sendFiles(w, files, text, asFile = false, cur = current) {
        // WhatsApp «Файл»: sent as documents by WhatsApp itself (it has no drop zone for them); the upload takes a
        // while, and a short wait gave up while WhatsApp went on sending — pressed again, the file went twice
        if (asFile && typeof cur.adapter.SEND_DOCUMENTS === 'function') {
            const data = await ipcRenderer.invoke('all-inbox:read-files', files.map((f) => f.path)).catch(() => [])
            if (!data.length || !(await stillHere(w, cur))) return false
            return await run(w, cur.adapter.SEND_DOCUMENTS(data, text), DOCUMENTS_TIMEOUT_MS) === true
        }
        const point = await run(w, cur.adapter.DROP)
        if (!point || typeof point.x !== 'number') return false
        const paths = files.map((f) => f.path)
        const dropped = await dropInto(w, point, paths, asFile, cur)
        if (!dropped) return false
        if (cur.adapter.sendsOnDrop) {
            // MAX has sent the files already; the text follows as its own message
            await wait(AFTER_DROP_MS)
            return text ? sendText(w, text, cur) : true
        }
        // Telegram: its «send» window, the text as the caption, its own send button; MAX: its message field holding the file
        const popup = await waitSettled(w, cur.adapter.MEDIA_POPUP, POPUP_WAIT_MS)
        if (!popup && cur.adapter.dropMaySendAtOnce) return text ? sendText(w, text, cur) : true
        if (!popup || !popup.send || current !== cur) return false
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
    async function stillHere(w, cur = current) {
        // another chat opened in our window meanwhile: nothing of the old action may land in it
        if (!cur || current !== cur) return false
        const data = await run(w, cur.adapter.CHAT)
        if (current !== cur) return false
        if (!data || !sameChat(cur.chat.title, data.title)) { view.setMismatch(true, data && data.title); return false }
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
        const cur = current
        if (!w || !cur || !m || !text) return false
        typingFor = cur.service
        if (!KEYED_FORMATTING.has(cur.service) || typeof cur.adapter.EDIT === 'function') text = toMessenger(text, cur.service)
        if (!(await stillHere(w, cur))) return false
        const id = String(m.id).split('+')[0]
        let ok = false
        if (typeof cur.adapter.EDIT === 'function') {
            ok = await run(w, cur.adapter.EDIT(id, text)) === true
        } else if (cur.adapter.contextEdit) {
            if (await openMessageMenu(w, id) && await run(w, cur.adapter.MENU_ITEM('Редактировать'))) {
                await wait(FOCUS_SETTLE_MS * 3)
                const point = await run(w, cur.adapter.COMPOSER)
                ok = !!point && typeof point.x === 'number' && await typeAt(w, point, text)
                if (ok) pressEnter(w)
            } else pressEscape(w)
        }
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function removeMessage(m, forAll) {
        const w = tab()
        const cur = current
        if (!w || !cur || !m) return false
        if (!(await stillHere(w, cur))) return false
        const id = String(m.id).split('+')[0]
        let ok = false
        if (typeof cur.adapter.DELETE === 'function') {
            ok = await run(w, cur.adapter.DELETE(id, forAll)) === true
        } else if (cur.adapter.DELETE_CONFIRM) {
            if (await openMessageMenu(w, id) && await run(w, cur.adapter.MENU_ITEM('Удалить'))) {
                await wait(MENU_SETTLE_MS)
                ok = await run(w, cur.adapter.DELETE_CONFIRM(forAll)) === true
                if (!ok) pressEscape(w)
            } else pressEscape(w)
        }
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function react(m, emoji) {
        const w = tab()
        const cur = current
        if (!w || !cur || !m || !emoji) return false
        // shown at once; the messenger is told right after
        const shownNow = (pressed.get(m.id) || {}).list || m.reactions || []
        const list = toggleReaction(shownNow, emoji)
        pressed.set(m.id, { list, mine: (list.find((r) => r.mine) || {}).e || '', at: Date.now() })
        // on screen at once (the whole conversation takes a moment to draw); the full drawing follows without hurry
        if (!view.showReactions(m.id, list)) redraw()
        else setTimeout(redraw, 0)
        if (!(await stillHere(w, cur))) { pressed.delete(m.id); redraw(); return false }
        const id = String(m.id).split('+')[0]
        let ok = false
        if (typeof cur.adapter.REACT === 'function') {
            ok = await run(w, cur.adapter.REACT(id, emoji)) === true
        } else if (cur.adapter.REACT_PICK) {
            const index = reactions.indexOf(emoji)
            if (index >= 0 && await openMessageMenu(w, id)) {
                ok = await run(w, cur.adapter.REACT_PICK(index)) === true
                if (!ok) pressEscape(w)
            }
        }
        if (!ok) { pressed.delete(m.id); redraw() }
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function send(text, files = [], reply = null, asFile = false) {
        const w = tab()
        const cur = current
        if (!w || !cur) return false
        // check again right before typing: the tab may have moved to another chat since the last read, and our window
        // to another chat while this was checked (the text then went to the new one, 3.8.3 check)
        if (!(await stillHere(w, cur))) return false
        // the field's marks become the messenger's own (bold, italic…, text-format.js); the message waiting with its
        // clock shows as the messenger will show it
        typingFor = cur.service
        const out = KEYED_FORMATTING.has(cur.service) ? text : toMessenger(text, cur.service)
        const knownIds = lastRows.filter((r) => r.type === 'msg' && r.out).map((r) => r.id)
        const pid = pending.add({ text: cur.service === 'whatsapp' ? out : toMessenger(text, ''), files, knownIds })
        redraw()
        const ok = await deliver(w, out, files, reply, asFile, cur)
        if (!ok) pending.drop(pid)
        await wait(AFTER_SEND_MS)
        poll()
        return ok
    }

    async function deliver(w, text, files, reply, asFile = false, cur = current) {
        // an answer to a message: the messenger itself is told which one, before anything is typed
        if (reply && typeof current.adapter.REPLY === 'function') {
            const id = String(reply.id).split('+')[0]
            // MAX (3.8.3): «Ответить» from its own menu on a right click — the hover button was missed and the reply did
            // not go (owner, 2026-11-12); the hover button stays as the second try
            let set = false
            if (current.adapter.contextEdit && typeof current.adapter.MENU_ITEM === 'function') {
                set = await openMessageMenu(w, id) && await run(w, current.adapter.MENU_ITEM('Ответить')) === true
                if (set) await wait(FOCUS_SETTLE_MS * 2)
                else pressEscape(w)
            }
            if (set) return files.length ? sendFiles(w, files, text, asFile, cur) : sendText(w, text, cur)
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
        if (current !== cur) return false
        return files.length ? sendFiles(w, files, text, asFile, cur) : sendText(w, text, cur)
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
        const session = newSession()
        current = { chat, adapter, service: adapterId, match: false, onConfirmed, confirmed: false, openedAt: Date.now(), script: withImageMemo(adapter.CHAT, session), images: new Map() }
        loadReactions(adapter)
        pending.clear()
        pressed.clear()
        lastRows = []
        setEmojiSet(adapterId)
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
        // the row of the chat stops looking open in the list
        onHidden()
    }

    return { open, close, isOpen: () => !!current }
}

module.exports = { createChatController, clickAt }
