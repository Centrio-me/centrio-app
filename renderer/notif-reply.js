// Answering a message straight from its notification pop-up. The pop-up only asks; the page of the messenger does the
// work: the site's own notification is "clicked" (the very thing the site does when the user clicks it: it opens the
// right chat), the page is given time to settle, and the text is put into the message box of the chat that is then
// displayed and sent.
//
// The principle: act like the user's own click, and refuse only what is PROVABLY wrong. The site's own click handler
// decides which chat belongs to the notification; a missing or odd name, a chat that loads slowly, a header that cannot
// be read are never a reason to give up. What is refused: a chat whose id is known to differ from the id in the
// notification, and a page that did not react to the click while showing another chat.
//  1. One chat at a time. A site may keep several chats in the page (Telegram Web K stacks every chat opened from a
//     notification on top of the previous one, each with its own message box). Everything is looked up inside the
//     container of the DISPLAYED chat (`scope` of the adapter); without a known container the box that has the
//     focus, or else the newest one, is used - never "the first one in the page".
//  2. Settled first. After the click the page must have reacted (its address and its screen changed together) and
//     stopped changing before a character is typed, so a slow site can never get the text into the previous chat.
//  3. At most once. The text is typed with the page's own editing command into the one focused message box, the
//     other boxes of the page are checked to stay as they were, and only ONE send action is taken; the second way to
//     send is tried only while the very same text is still sitting in the box and nothing was sent. A reply that
//     cannot be proven is reported as a failure, never repeated.
const OPEN_SETTLE_MS = 700
const SETTLE_AFTER_TYPING_MS = 250
const RESULT_WAIT_MS = 3000
const RESULT_POLL_MS = 300
const COMPOSER_WAIT_MS = 4000
const CHAT_WAIT_MS = 12000 // the site may switch chats slowly on accounts with many chats
const CHAT_POLL_MS = 150
const SETTLE_MS = 500 // the page has to look the same this long before the text goes in
const NO_CHANGE_WAIT_MS = 1500 // nothing changed after the click: the chat was already open (slow sites announce themselves earlier)
const LAYOUT_SETTLE_MS = 300 // a page that just got its invisible layout needs a moment before the site is clicked
const BLIND_WAIT_MS = 4000 // ... the same, on a page that shows no name and no ids (nothing could contradict an early guess)
const PEERS_WAIT_MS = 4000 // the ids of the chat appear on its messages a moment after it opens; waited for, never forever
const DOM_ONLY_GRACE_MS = 2000 // the screen changed but the address of the site does not: it is not required any more after this

// Per site: where the message box and the send button are. Selectors are tried in order; the first match wins.
const TELEGRAM = {
    chatKey: 'hash', // the address hash is the open chat; it can be put back without a reload
    // Web K keeps a stack of chats in the page (the newest is the last one); the others keep their message boxes too.
    scope: ['.chats-container > .chat:last-child', '#column-center .chat.active', '#MiddleColumn'],
    // Seen on the real page: the chat holds TWO boxes of the same class, stacked on each other. The FIRST one is the editor
    // (typing there enables the send button); the second one only mirrors it, and text typed into it is never sent.
    composerPick: 'first',
    // every message of a chat carries the id of the chat it belongs to
    peers: ['.bubble[data-peer-id]'],
    composer: ['.chat-input .input-message-input[contenteditable="true"]', '.input-message-input[contenteditable="true"]', '#editable-message-text', 'div[contenteditable="true"].input-message-input'],
    send: ['.btn-send-container button.btn-send', 'button.btn-send', 'button.main-button.send', '.Button.send', 'button[aria-label="Send Message"]'],
    outgoing: ['.bubble.is-out .message', '.Message.own .text-content', '.message.own .text-content'],
    // the top bar of the open chat (Web K, Web A): the name of the chat is somewhere inside it
    title: ['.chat.active .chat-info .peer-title', '.chat-info .peer-title', '.MiddleHeader .ChatInfo .fullName', '.chat-info-container .title h3'],
    region: ['.chat.active .chat-info', '.chat-info', '.MiddleHeader', '.chat-info-container'],
    incoming: ['.bubble:not(.is-out) .message', '.Message:not(.own) .text-content', '.message:not(.own) .text-content']
}
const WHATSAPP = {
    chatKey: 'title',
    scope: ['#main'],
    composer: ['footer div[contenteditable="true"][role="textbox"]', 'footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="10"]'],
    send: ['footer button[aria-label="Send"]', 'footer button[aria-label="Отправить"]', 'footer span[data-icon="send"]'],
    outgoing: ['div.message-out .copyable-text span.selectable-text'],
    title: ['#main header [data-testid="conversation-info-header-chat-title"]', '#main header span[title]', '#main header span[dir="auto"]'],
    region: ['#main header'],
    incoming: ['div.message-in .copyable-text span.selectable-text']
}
// MAX (checked on a live account, 2026-10-09): the message box is <div role="textbox" contenteditable=""> - note the
// EMPTY attribute value, so [contenteditable="true"] does not match it - and the send button only exists once there is
// text. Enter pressed through input events did not send there, so the button goes first.
const MAX = {
    chatKey: 'path',
    composer: ['[data-testid="composer"] [role="textbox"][contenteditable]:not([contenteditable="false"])', '[role="textbox"][contenteditable]:not([contenteditable="false"])'],
    send: ['button[aria-label="Отправить сообщение"]', 'button[aria-label*="Отправить" i]'],
    outgoing: ['.message--isOut'],
    incoming: ['.message:not(.message--isOut)'], // no top bar known: judged by navigation and by what is on screen
    sendWith: 'button'
}
// Any other site: the first message-box-looking element, and Enter.
const GENERIC = {
    composer: ['[role="textbox"][contenteditable]:not([contenteditable="false"])', 'div[contenteditable]:not([contenteditable="false"])', 'textarea'],
    send: ['button[aria-label*="Отправить" i]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
    outgoing: []
}

const ADAPTERS = [
    { id: 'telegram', host: /(^|\.)telegram\.org$|^t\.me$/i, selectors: TELEGRAM },
    { id: 'whatsapp', host: /(^|\.)whatsapp\.com$/i, selectors: WHATSAPP },
    { id: 'max', host: /(^|\.)max\.ru$/i, selectors: MAX },
    // Development fixture: a local test page with Telegram-like markup (never a real messenger).
    { id: 'local-fixture', host: /^(127\.0\.0\.1|localhost)$/i, selectors: TELEGRAM }
]

function adapterFor(url) {
    let host = ''
    try { host = new URL(url).hostname } catch { return null }
    return ADAPTERS.find((adapter) => adapter.host.test(host)) || null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Source of a small helper that runs inside the messenger page. `action` is one of find / read / clear / set / send /
// seen; the result is a plain value.
function pageScript(selectors, action, arg) {
    return `(() => {
        const cfg = ${JSON.stringify(selectors)}
        const action = ${JSON.stringify(action)}
        const arg = ${JSON.stringify(arg == null ? '' : String(arg))}
        const norm = (s) => String(s || '').replace(new RegExp('[' + String.fromCharCode(0x200b, 0x2060, 0xfeff) + ']', 'g'), '').replace(/\\s+/g, ' ').trim()
        // Only the container of the displayed chat is ever looked into: a site may keep the chats opened before in the page
        // (each with its own message box), and "the first match in the page" would be one of THEM. The last container of a
        // stack is the newest; without a known container the whole page is searched and a message box is accepted only
        // when it is the only one.
        const visible = (n) => n.getClientRects().length > 0
        let scope = document
        for (const sel of cfg.scope || []) { const found = document.querySelectorAll(sel); if (found.length) { scope = found[found.length - 1]; break } }
        const scoped = scope !== document
        const all = (sel) => Array.from(scope.querySelectorAll(sel))
        const first = (sel) => { const nodes = all(sel); return nodes.filter(visible).pop() || nodes[nodes.length - 1] || null }
        const head = (sel) => { const nodes = all(sel); return nodes.find(visible) || nodes[0] || null } // the title, not what is under it
        const everyComposer = () => { const out = []; for (const sel of cfg.composer) for (const n of document.querySelectorAll(sel)) if (!out.includes(n)) out.push(n); return out }
        // the boxes of OTHER chats: the ones inside the displayed chat belong to it (mirrors of the editor included)
        const otherBoxes = (mine) => everyComposer().filter((n) => n !== mine && !(scoped && scope.contains(n)))
        const composer = () => {
            for (const sel of cfg.composer) {
                const nodes = all(sel)
                if (!nodes.length) continue
                if (scoped || nodes.length === 1) return cfg.composerPick === 'first' ? head(sel) : first(sel)
                // an unknown screen with several boxes: the one the site has focused (it focuses the box of the chat it
                // opens), else the newest one (a stack grows at its end)
                return nodes.find((n) => n === document.activeElement || n.contains(document.activeElement)) || first(sel)
            }
            return null
        }
        const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
        const read = (el) => isField(el) ? el.value : (el.innerText != null ? el.innerText : el.textContent)
        const el = composer()
        const kind = cfg.chatKey || 'href'
        if (action === 'key') {
            if (kind === 'hash') return location.hash
            if (kind === 'path') return location.pathname + location.hash
            if (kind === 'title') { for (const sel of cfg.title || []) { const h = head(sel); if (h) { const v = norm(h.getAttribute('title') || h.textContent); if (v) return v } } return '' }
            return location.href
        }
        if (action === 'top') {
            // a number for the container of the displayed chat: another number = another chat screen
            if (!scoped) return 0
            const ids = (window.__centrioNodeIds = window.__centrioNodeIds || new WeakMap())
            if (!ids.has(scope)) ids.set(scope, (window.__centrioNodeSeq = (window.__centrioNodeSeq || 0) + 1))
            return ids.get(scope)
        }
        if (action === 'goto') { location.hash = arg; return true }
        if (action === 'count') {
            let total = 0
            for (const sel of cfg.outgoing) total += all(sel).length
            return total
        }
        if (action === 'countAll') {
            let total = 0
            for (const sel of cfg.outgoing) total += document.querySelectorAll(sel).length
            return total
        }
        if (action === 'peers') {
            const ids = []
            for (const sel of cfg.peers || []) for (const n of all(sel)) { const id = String(n.getAttribute('data-peer-id') || ''); if (id && !ids.includes(id)) ids.push(id) }
            return ids
        }
        if (action === 'boxes') return everyComposer().length
        if (action === 'mark') {
            // what every message box of the page holds right now (drafts of the user stay theirs)
            const mine = composer()
            window.__centrioMarks = otherBoxes(mine).map((n) => [n, norm(read(n))])
            return window.__centrioMarks.length
        }
        if (action === 'stray' || action === 'clearStray') {
            // the text must be in the one message box we chose and nowhere else: another box counts only when it CHANGED
            // since the mark and now holds the text; it is put back to what it held before
            const mine = composer()
            const wanted = norm(arg)
            let count = 0
            for (const [n, was] of window.__centrioMarks || []) {
                const now = norm(read(n))
                if (n === mine || !wanted || now === was || !now.includes(wanted)) continue
                count++
                if (action === 'clearStray') {
                    n.focus()
                    if (isField(n)) { n.value = was; n.dispatchEvent(new Event('input', { bubbles: true })) }
                    else { document.execCommand('selectAll', false); if (was) document.execCommand('insertText', false, was); else document.execCommand('delete', false) }
                }
            }
            if (action === 'clearStray' && mine) mine.focus()
            return count
        }
        if (action === 'title') {
            for (const sel of cfg.title || []) {
                const node = head(sel)
                if (!node) continue
                const value = norm(node.getAttribute('title') || node.textContent)
                if (value) return value
            }
            return ''
        }
        if (action === 'region') {
            for (const sel of cfg.region || []) {
                const node = first(sel)
                if (!node) continue
                const value = norm(node.textContent)
                if (value) return value
            }
            return ''
        }
        if (action === 'incoming') {
            const out = []
            for (const sel of cfg.incoming || []) {
                const found = all(sel)
                const nodes = found.some(visible) ? found.filter(visible) : found
                for (let i = Math.max(0, nodes.length - 8); i < nodes.length; i++) out.push(norm(nodes[i].textContent))
                if (out.length) break
            }
            return out
        }
        if (action === 'restore') { if (kind === 'hash' && arg) { location.hash = arg; return true } return false }
        if (action === 'find') return !!el
        if (!el) return null
        if (action === 'read') return read(el)
        if (action === 'clear') {
            el.focus()
            if (isField(el)) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })) }
            else { document.execCommand('selectAll', false); document.execCommand('delete', false) }
            return norm(read(el)) === ''
        }
        if (action === 'focus') { el.focus(); return document.activeElement === el || el.contains(document.activeElement) }
        if (action === 'insert') {
            // The page's own editing command, into the box that has the focus: no way to land anywhere else.
            if (!(document.activeElement === el || el.contains(document.activeElement))) return null
            if (isField(el)) {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
                Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arg)
                el.dispatchEvent(new Event('input', { bubbles: true }))
            } else if (!document.execCommand('insertText', false, arg)) {
                el.textContent = arg
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: arg }))
            }
            return norm(read(el))
        }
        if (action === 'set') {
            // Fallback when typing through real input events did not land: the page's own editing command.
            el.focus()
            if (isField(el)) {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
                Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arg)
                el.dispatchEvent(new Event('input', { bubbles: true }))
            } else {
                document.execCommand('selectAll', false)
                if (!document.execCommand('insertText', false, arg)) el.textContent = arg
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: arg }))
            }
            return norm(read(el))
        }
        if (action === 'send') {
            for (const sel of cfg.send) {
                const node = first(sel)
                const button = node && (node.closest('button') || node)
                if (button && !button.disabled) { button.click(); return true }
            }
            return false
        }
        if (action === 'seen') {
            const wanted = norm(arg)
            for (const sel of cfg.outgoing) {
                const nodes = document.querySelectorAll(sel)
                if (nodes.length && norm(nodes[nodes.length - 1].textContent).includes(wanted)) return true
            }
            return cfg.outgoing.length ? false : null
        }
        return null
    })()`
}

const ZERO_WIDTH = new RegExp('[' + String.fromCharCode(0x200b, 0x2060, 0xfeff) + ']', 'g')
const normalize = (text) => String(text || '').replace(ZERO_WIDTH, '').replace(/[ \t\r\n]+/g, ' ').trim()

// Same name, whatever the case, emoji or punctuation.
const letters = (text) => normalize(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// The chat names a notification title can stand for. Telegram writes "Sender @ Group" (the chat is the group, NOT
// the sender: the sender's name is in many other chats), "Topic (Group)" for forums, and appends " ➜ account" when
// several accounts are signed in. The top bar of a chat shows the chat itself.
function titleParts(title) {
    const clean = normalize(title).replace(/\s*➜.*$/, '')
    const at = clean.split(/\s@\s/)
    const parts = at.length > 1 ? [at[at.length - 1]] : [clean]
    for (const part of at.length > 1 ? [parts[0]] : [clean]) {
        const forum = part.match(/^(.*?)\s*\((.+)\)$/)
        if (forum) parts.push(forum[2], forum[1])
    }
    return Array.from(new Set(parts.map(letters).filter((p) => p.length >= 2)))
}
// Exactly the name of the chat? (the node of the top bar that carries it)
const nameIs = (name, parts) => { const x = letters(name); return x !== '' && parts.includes(x) }
// The same as whole words inside the text of the whole top bar (used only where the name node is unknown); "Team"
// must not match "Team B" or "Bobby" a "Bob": the words have to stand on their own.
function barHas(bar, parts, title) {
    const text = ' ' + normalize(bar).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '
    return normalize(title) !== '' && parts.length > 0 && text.length > 2 && parts.some((part) => {
        const words = normalize(part).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        return words.length >= 2 && text.includes(' ' + words + ' ')
    })
}
// Does the top bar share a whole word with the title? (a looser sign, used only together with a navigation)
const sharesWord = (bar, title) => {
    const text = ' ' + normalize(bar).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '
    return normalize(title).toLowerCase().split(/[^\p{L}\p{N}]+/u).some((word) => word.length >= 3 && text.includes(' ' + word + ' '))
}

// Does one of the latest incoming messages carry the notified text? Group notifications read "Name: text".
function incomingHas(messages, body) {
    const text = normalize(body).replace(/(\.{3}|…)$/, '').trim()
    if (!text || !Array.isArray(messages)) return false
    const tail = text.includes(': ') ? text.slice(text.indexOf(': ') + 2) : ''
    const needles = [text, tail].map((n) => n.slice(0, 60).toLowerCase()).filter((n) => n.length >= 3)
    return messages.some((m) => { const low = normalize(m).toLowerCase(); return needles.some((n) => low.includes(n)) })
}

// What the page shows right now: the address, the number of the chat screen, the ids and the name of the chat, the top
// bar and the latest messages.
async function snapshot(run) {
    const messages = await run('incoming')
    const peers = await run('peers')
    return {
        key: await run('key'),
        top: Number(await run('top')) || 0,
        peers: Array.isArray(peers) ? peers : [],
        name: normalize(await run('title')),
        bar: normalize(await run('region')),
        messages: Array.isArray(messages) ? messages : [],
        content: letters(Array.isArray(messages) ? messages.join(' ') : '')
    }
}

const changedKeyOf = (now, before) => now.key !== '' && now.key !== before.key // an empty address is a page in transition
const changedDomOf = (now, before) => now.top !== before.top || now.name !== before.name || now.content !== before.content || now.peers.join() !== before.peers.join()
const readableDom = (snap) => snap.top !== 0 || snap.name !== '' || snap.content !== '' || snap.peers.length > 0
// The one thing that is refused for certain: the page shows the id of the chat and it is another chat than the notified one.
const contradicts = (now, notice) => !!notice.peer && now.peers.length === 1 && now.peers[0] !== notice.peer

// No navigation was seen: is the chat that is open simply the notified one (it was open already)? Yes unless the page
// shows something that says otherwise: another id, another name, other messages. A page that shows nothing readable
// at all is taken as it is.
function alreadyOpen(now, notice) {
    if (notice.peer && now.peers.length === 1) return now.peers[0] === notice.peer
    const parts = titleParts(notice.title)
    // a name on screen decides: it is the notified chat or it is not (messages of ANOTHER chat can carry the same words)
    if (now.name !== '') return nameIs(now.name, parts)
    if (now.bar !== '' && barHas(now.bar, parts, notice.title)) return true
    // no name, no id: nothing on the page can contradict the click, which has already run; taken as it is
    return now.bar === '' || incomingHas(now.messages, notice.body) || now.peers.length === 0
}

// Waits until the page has settled on the chat of the notification. Returns the snapshot, or null when the page showed
// another chat for good (never typing anywhere in that case).
async function waitForSettledChat(run, before, notice, ctx) {
    const start = Date.now()
    let sig = ''
    let stableSince = Date.now()
    let firstChange = 0
    const seesDom = readableDom(before)
    const seesKey = before.key !== ''
    while (Date.now() - start < CHAT_WAIT_MS && !ctx.cancelled) {
        const now = await snapshot(run)
        const key = changedKeyOf(now, before)
        const dom = changedDomOf(now, before)
        const wrong = contradicts(now, notice)
        const exact = !!notice.peer && now.peers.length === 1 && !wrong
        Object.assign(ctx.diag, { id: exact, nav: key, dom, msgs: now.content !== '' })
        if (key || dom) { if (!firstChange) firstChange = Date.now() }
        const now_sig = JSON.stringify([now.key, now.top, now.name, now.peers, now.content])
        if (now_sig !== sig) { sig = now_sig; stableSince = Date.now() }
        const stable = Date.now() - stableSince >= SETTLE_MS
        let ready = false
        if (wrong) ready = false
        else if (key || dom) {
            // the page reacted to the click: both its address and its screen must have changed (when it has both),
            // so the screen cannot still be the picture of the previous chat
            const keyOk = key || !seesKey || (dom && Date.now() - firstChange >= DOM_ONLY_GRACE_MS && (exact || alreadyOpen(now, notice)))
            const domOk = dom || !seesDom
            // when the site shows chat ids, the id of the chat on screen is awaited (the messages of a chat that was just
            // opened appear a moment later): then it is the exact answer
            const peersOk = !notice.expectPeers || before.peers.length === 0 || now.peers.length === 1 || Date.now() - firstChange >= PEERS_WAIT_MS
            ready = stable && keyOk && domOk && peersOk
        } else {
            const blind = before.name === '' && before.peers.length === 0
            const idle = blind ? BLIND_WAIT_MS : NO_CHANGE_WAIT_MS
            ready = stable && Date.now() - start >= idle && alreadyOpen(now, notice)
        }
        if (ready) return now
        await sleep(CHAT_POLL_MS)
    }
    return null
}

async function waitForComposer(run) {
    const until = Date.now() + COMPOSER_WAIT_MS
    while (Date.now() < until) {
        if (await run('find')) return true
        await sleep(200)
    }
    return false
}

// Resolves 'ok' only when the message is proven to have gone out (see the top of this file). Otherwise a reason:
// 'not-opened' (the notified chat could not be proven, nothing was sent), 'no-input' (the chat has no message box,
// e.g. a channel), or 'failed'. `notice` is { title, body } of the notification the reply belongs to; `ctx.cancelled`
// is set when the caller gave up waiting, after which nothing may be typed or sent any more.
async function deliverReply(messenger, nid, text, notice, ctx) {
    const adapter = messenger && adapterFor(messenger.url)
    const webview = messenger && document.getElementById(`webview-${messenger.id}`)
    if (!adapter || !webview || typeof webview.executeJavaScript !== 'function') return 'failed'
    const wanted = normalize(text)
    if (!wanted) return 'failed'
    const target = { title: normalize(notice.title), body: normalize(notice.body), peer: /^-?\d{1,20}$/.test(String(notice.peer || '')) ? String(notice.peer) : '' }
    target.expectPeers = target.peer !== '' && Array.isArray(adapter.selectors.peers)
    let draft = ''
    let hadDraft = false
    let chatTarget = null
    holdLayout(webview)
    const run = (action, arg) => webview.executeJavaScript(pageScript(adapter.selectors, action, arg))
    // The page can move to another chat at any moment (the site is slow, or the user clicks): the message box and the
    // draft are touched only while the notified chat is still the open one.
    const stillThere = async () => {
        if (chatTarget === null) return false
        const top = Number(await run('top')) || 0
        return chatTarget.top !== 0 ? top === chatTarget.top : (await run('key')) === chatTarget.key
    }
    // Rich editors (Lexical in MAX, ProseMirror in Telegram) apply an edit a moment AFTER the command: the text is waited
    // for before anything is concluded - concluding "nothing landed" too early and typing again doubles the text.
    const settleText = async (want, ms) => {
        const until = Date.now() + ms
        let text = ''
        do {
            text = normalize(await run('read'))
            if (text === want) return text
            await sleep(100)
        } while (Date.now() < until)
        return text
    }
    // Empties the box so that nothing is left behind: the page's own command first, then the keyboard (select all, delete),
    // which is what rich editors really listen to.
    const clearBox = async () => {
        if (await run('clear')) return true
        try { webview.focus() } catch { /* the tab may not be shown */ }
        await run('focus')
        webview.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
        webview.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
        await sleep(150)
        webview.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
        webview.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
        return (await settleText('', 800)) === ''
    }
    try {
        if (!webview.classList.contains('active')) await sleep(LAYOUT_SETTLE_MS)
        const before = await snapshot(run)
        let opened = await webview.executeJavaScript(
            `window.__centrioOpenNotif ? window.__centrioOpenNotif(${JSON.stringify(String(nid))}) : false`
        )
        // The site's notification is gone (the page was reloaded): a site that puts the chat into its address (Telegram:
        // the id) can still be taken to the chat that way.
        if (!opened && target.peer && adapter.selectors.chatKey === 'hash') opened = await run('goto', '#' + target.peer)
        if (!opened) return 'not-opened'
        // The site switches chats asynchronously (slowly on accounts with many chats). The message box of the chat that
        // was open before is still there meanwhile, so its presence proves nothing: the page must have settled on the
        // notified chat before a single character is typed.
        const settled = await waitForSettledChat(run, before, target, ctx)
        if (!settled || ctx.cancelled) return 'not-opened'
        chatTarget = { key: settled.key, top: settled.top }
        if (!(await waitForComposer(run))) { ctx.diag.boxes = Number(await run('boxes')) || 0; chatTarget = null; return 'no-input' }
        if (ctx.cancelled || !(await stillThere())) { chatTarget = null; return 'not-opened' }

        // A draft the user already has in this chat is kept aside and put back afterwards.
        draft = await run('read')
        hadDraft = normalize(draft) !== ''
        if (hadDraft && !(await clearBox())) return 'failed'
        if (!(await run('focus'))) return 'failed' // the box must really have the focus before anything is typed
        try { webview.focus() } catch { /* the tab may not be shown; the page-side focus above is enough */ }

        // The page's own editing command into the focused box; if nothing landed at all, a keyboard-like input into the
        // very same focused box.
        await run('mark')
        let typed = normalize(await run('insert', text))
        if (typed !== wanted) typed = await settleText(wanted, 1500)
        if (typed === '' && typeof webview.insertText === 'function' && (await run('focus'))) {
            await webview.insertText(String(text))
            typed = await settleText(wanted, 1500)
        }
        if (typed !== wanted) {
            if (await stillThere()) await clearBox()
            return 'failed'
        }
        // No other message box of the page may hold the text (a box of a chat that is not the notified one).
        if ((await run('stray', text)) > 0) {
            await run('clearStray', text)
            if (await stillThere()) await clearBox()
            return 'failed'
        }
        // The chat must still be the one the reply is meant for; never send into another conversation.
        const recheck = await snapshot(run)
        if (ctx.cancelled || (chatTarget.top !== 0 ? recheck.top !== chatTarget.top : recheck.key !== chatTarget.key) || contradicts(recheck, target)) {
            if (await stillThere()) await clearBox()
            return 'not-opened'
        }
        const sentBefore = Number(await run('count')) || 0

        // Send: ONE action, the way this site answers to (Enter, or the button of the chat). The other way is taken only
        // while the very same text is still in the box and nothing was sent: then nothing has gone out, so no duplicate.
        const pressEnter = () => {
            webview.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
            webview.sendInputEvent({ type: 'char', keyCode: 'Enter' })
            webview.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
        }
        const pressButton = () => run('send')
        const attempts = adapter.selectors.sendWith === 'button' ? [pressButton, pressEnter] : [pressEnter, pressButton]
        const allBefore = Number(await run('countAll')) || 0
        let proven = false
        for (const [index, attempt] of attempts.entries()) {
            if (ctx.cancelled || !(await stillThere())) break
            if (index > 0 && (normalize(await run('read')) !== wanted || (Number(await run('count')) || 0) > sentBefore)) break
            await attempt()
            // A slow page clears the box and shows the message late: wait for the result before even thinking of the
            // second way (it is only ever used while the same text still sits in the box).
            const until = Date.now() + RESULT_WAIT_MS
            do {
                await sleep(RESULT_POLL_MS)
                const raw = await run('read')
                // a new outgoing message counts as proof too; a box that is gone (null) proves nothing
                proven = (raw !== null && normalize(raw) === '') || (Number(await run('count')) || 0) > sentBefore
            } while (!proven && Date.now() < until)
            if (proven) break
        }
        // exactly one message may have appeared in the whole page; the text must not be left in any other box
        const allAfter = Number(await run('countAll')) || 0
        if (proven && allBefore > 0 && allAfter - allBefore > 1) ctx.diag.dup = true
        if ((await run('stray', text)) > 0) await run('clearStray', text)
        if (!proven && (await stillThere())) await clearBox()
        // the draft belongs to the notified chat: it goes back BEFORE the user is returned to the chat they were in
        if (hadDraft && (await stillThere())) await run('set', draft)
        hadDraft = false
        if (proven && before.key && before.key !== chatTarget.key) await run('restore', before.key)
        return proven ? 'ok' : 'failed'
    } catch {
        return 'failed'
    } finally {
        // the user's own draft comes back whatever happened, but only into the chat it was taken from
        if (hadDraft) { try { if (await stillThere()) await run('set', draft) } catch { /* the tab went away */ } }
        releaseLayout(webview)
    }
}

// A messenger tab that is not selected has no layout (display: none) and some sites then draw nothing (Telegram Web: no chat,
// no message box). Every reply gives the page an invisible layout for as long as it works (see .reply-render in styles.css).
const renderHolds = new Map()
function holdLayout(webview) {
    renderHolds.set(webview, (renderHolds.get(webview) || 0) + 1)
    webview.classList.add('reply-render')
}
function releaseLayout(webview) {
    const left = (renderHolds.get(webview) || 1) - 1
    if (left > 0) { renderHolds.set(webview, left); return }
    renderHolds.delete(webview)
    webview.classList.remove('reply-render')
}

// Two replies to the same messenger must never overlap: each one switches the chat of the page, so they would
// trample each other. One at a time per messenger, in the order they were sent.
const REPLY_TIMEOUT_MS = 30000
const queues = new Map()
function sendReply(messenger, nid, text, notice = {}, onDone) {
    const id = messenger && messenger.id
    const turn = (queues.get(id) || Promise.resolve()).then(() => {
        const ctx = { cancelled: false, diag: {} }
        // A hung page must not block every later reply: give up after a while, and from then on touch nothing.
        let timer = null
        const giveUp = new Promise((resolve) => { timer = setTimeout(() => { ctx.cancelled = true; resolve('failed') }, REPLY_TIMEOUT_MS) })
        return Promise.race([deliverReply(messenger, nid, text, notice, ctx), giveUp]).then((result) => {
            clearTimeout(timer)
            if (typeof onDone === 'function') { try { onDone(result, ctx.diag) } catch { /* diagnostics must never break a reply */ } }
            return result
        })
    })
    const tail = turn.catch(() => {})
    queues.set(id, tail)
    tail.then(() => { if (queues.get(id) === tail) queues.delete(id) })
    return turn
}

module.exports = { adapterFor, sendReply }
