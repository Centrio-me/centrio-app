// Answering a message straight from its notification pop-up. The pop-up only asks; the page of the messenger does the
// work: first the chat is opened by the site's own notification click (renderer/notif-open-chat.js), then the text is
// put into the message box of THAT chat and sent.
//
// Three rules keep a reply from ever going where it does not belong:
//  1. One chat at a time. A site may keep several chats in the page at once (Telegram Web K stacks every chat opened
//     from a notification on top of the previous one, each with its own message box). Everything - the message box,
//     the send button, the name, the messages - is looked up inside the container of the DISPLAYED chat only
//     (`scope` of the adapter), never "the first one in the page".
//  2. The chat is proven before a character is typed: by the id of the chat from the notification when the page shows
//     it (Telegram: the peer id on the messages), otherwise by its name, otherwise by navigation and text (see
//     chatVerdict). Not proven: nothing is typed, the user is told to answer in the chat.
//  3. At most once. The text is typed with the page's own editing command into the one focused message box, the
//     other message boxes of the page are checked to stay empty, and only ONE send action is taken; the second way to
//     send is tried only while the very same text is still sitting in the box. A reply that cannot be proven is
//     reported as a failure, never repeated.
const OPEN_SETTLE_MS = 700
const SETTLE_AFTER_TYPING_MS = 250
const RESULT_WAIT_MS = 3000
const RESULT_POLL_MS = 300
const COMPOSER_WAIT_MS = 4000
const CHAT_WAIT_MS = 6000 // the site may switch chats slowly on accounts with many chats
const CHAT_POLL_MS = 150
const CHAT_STABLE_MS = 250

// Per site: where the message box and the send button are. Selectors are tried in order; the first match wins.
const TELEGRAM = {
    chatKey: 'hash', // the address hash is the open chat; it can be put back without a reload
    // Web K keeps a stack of chats in the page (the newest is the last one); the others keep their message boxes too.
    scope: ['.chats-container > .chat:last-child', '#column-center .chat.active', '#MiddleColumn'],
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
        const everyComposer = () => { const out = []; for (const sel of cfg.composer) for (const n of document.querySelectorAll(sel)) if (!out.includes(n)) out.push(n); return out }
        const composer = () => {
            for (const sel of cfg.composer) {
                const nodes = all(sel)
                if (!nodes.length) continue
                // an unknown screen with several boxes of the same kind: no guessing
                return scoped || nodes.length === 1 ? first(sel) : null
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
            if (kind === 'title') { const h = first('#main header [title], #main header span[dir="auto"]'); return h ? (h.getAttribute('title') || h.textContent || '') : '' }
            return location.href
        }
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
            window.__centrioMarks = everyComposer().filter((n) => n !== mine).map((n) => [n, norm(read(n))])
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
                const node = first(sel)
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

// What the page shows right now: the address of the chat, its name, its top bar and its latest messages.
async function snapshot(run) {
    const messages = await run('incoming')
    const peers = await run('peers')
    return {
        key: await run('key'),
        peers: Array.isArray(peers) ? peers : [],
        name: normalize(await run('title')),
        bar: normalize(await run('region')),
        content: letters(Array.isArray(messages) ? messages.join(' ') : '')
    }
}

// Is the chat open in the page the one the notification is about? { ok, key }
// `before` is the snapshot taken before our click. The proof, strongest first:
//  1. the name of the open chat is exactly the chat of the notification (the group, not the sender);
//  2. the page navigated after our click (new address: the site itself opened a chat) AND the screen really changed, so
//     this is not the stale picture of the previous chat: a new name/top bar that still shares a word with the title or
//     shows the notified text; names that cannot be read: new messages on screen (or nothing readable at all: the
//     navigation alone);
//  3. nothing navigated, but the notified text is right there (the chat was already open).
// Anything else is NOT proven: nothing may be typed.
async function chatVerdict(run, before, notice, diag = {}) {
    const now = await snapshot(run)
    const done = (ok) => ({ ok, key: now.key })
    // The id of the chat, when the page shows it, settles everything: the chat is the notified one or it is not.
    if (notice.peerRequired && now.peers.length !== 1) {
        Object.assign(diag, { id: false, bar: now.name !== '' || now.bar !== '', hit: false, nav: now.key !== before.key, msgs: now.content !== '' })
        return done(false) // the id is expected on the messages of the chat; none shown yet (the chat is still loading)
    }
    if (notice.peer && now.peers.length === 1) {
        const exact = now.peers[0] === notice.peer
        Object.assign(diag, { id: exact, bar: now.name !== '' || now.bar !== '', hit: exact, nav: now.key !== before.key, msgs: now.content !== '' })
        return done(exact)
    }
    const parts = titleParts(notice.title)
    const hit = now.name !== '' ? nameIs(now.name, parts) : barHas(now.bar, parts, notice.title)
    const changedKey = now.key !== '' && now.key !== before.key // an empty address is a page in transition
    // flags only (never a name or a text): what the last check saw, for the log of a reply that was not sent
    Object.assign(diag, { bar: now.name !== '' || now.bar !== '', hit, nav: changedKey, msgs: now.content !== '' })
    if (hit) return done(true)
    const bodyOk = normalize(notice.body).length >= 6
    if (changedKey) {
        // another name on screen: the page must have really moved on, and the chat must still look like the notified one
        const known = now.name !== '' || now.bar !== ''
        if (known) {
            const moved = now.name !== before.name || now.bar !== before.bar
            return done(moved && (sharesWord(now.name + ' ' + now.bar, notice.title) || (bodyOk && incomingHas(await run('incoming'), notice.body))))
        }
        const readable = now.content !== '' || before.content !== ''
        return done(!readable || now.content !== before.content)
    }
    return done(bodyOk && incomingHas(await run('incoming'), notice.body))
}

// Waits until the open chat is proven to be the notified one (and stays so), or gives up.
async function waitForNotifiedChat(run, before, notice, ctx) {
    const until = Date.now() + CHAT_WAIT_MS
    let stable = null // the address of the chat when it was first proven: it must stay the same
    while (Date.now() < until && !ctx.cancelled) {
        const verdict = await chatVerdict(run, before, notice, ctx.diag)
        if (verdict.ok) {
            if (stable && stable.key === verdict.key) return verdict
            stable = verdict
            await sleep(CHAT_STABLE_MS)
            continue
        }
        stable = null
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
    target.peerRequired = target.peer !== '' && Array.isArray(adapter.selectors.peers) // the site shows chat ids: then they decide
    let draft = ''
    let hadDraft = false
    let chatTarget = null
    const run = (action, arg) => webview.executeJavaScript(pageScript(adapter.selectors, action, arg))
    // The page can move to another chat at any moment (the site is slow, or the user clicks): the message box and the
    // draft are touched only while the notified chat is still the open one.
    const stillThere = async () => chatTarget !== null && (await run('key')) === chatTarget
    try {
        const before = await snapshot(run)
        const opened = await webview.executeJavaScript(
            `window.__centrioOpenNotif ? window.__centrioOpenNotif(${JSON.stringify(String(nid))}) : false`
        )
        if (!opened) return 'not-opened'
        // The site switches chats asynchronously (slowly on accounts with many chats). The message box of the chat
        // that was open before is still there meanwhile, so its presence proves nothing: the notified chat itself
        // must be proven open before a single character is typed.
        const verified = await waitForNotifiedChat(run, before, target, ctx)
        if (!verified || ctx.cancelled) return 'not-opened'
        chatTarget = verified.key
        await sleep(OPEN_SETTLE_MS)
        if (!(await waitForComposer(run))) { ctx.diag.boxes = Number(await run('boxes')) || 0; chatTarget = null; return 'no-input' }
        if (ctx.cancelled || !(await stillThere())) { chatTarget = null; return 'not-opened' }

        // A draft the user already has in this chat is kept aside and put back afterwards.
        draft = await run('read')
        hadDraft = normalize(draft) !== ''
        if (hadDraft && !(await run('clear'))) return 'failed'
        if (!(await run('focus'))) return 'failed' // the box must really have the focus before anything is typed
        try { webview.focus() } catch { /* the tab may not be shown; the page-side focus above is enough */ }

        // The page's own editing command into the focused box; if nothing landed at all, a keyboard-like input into the
        // very same focused box.
        await run('mark')
        let typed = normalize(await run('insert', text))
        if (typed === '' && typeof webview.insertText === 'function' && (await run('focus'))) {
            await webview.insertText(String(text))
            await sleep(SETTLE_AFTER_TYPING_MS)
            typed = normalize(await run('read'))
        }
        if (typed !== wanted) {
            if (await stillThere()) await run('clear')
            return 'failed'
        }
        // No other message box of the page may hold the text (a box of a chat that is not the notified one).
        if ((await run('stray', text)) > 0) {
            await run('clearStray', text)
            if (await stillThere()) await run('clear')
            return 'failed'
        }
        // The chat must still be the one the reply is meant for; never send into another conversation.
        const recheck = await chatVerdict(run, before, target, ctx.diag)
        if (ctx.cancelled || !recheck.ok || recheck.key !== chatTarget) {
            if (await stillThere()) await run('clear')
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
                const left = normalize(await run('read'))
                // a new outgoing message counts as proof too
                proven = left === '' || (Number(await run('count')) || 0) > sentBefore
            } while (!proven && Date.now() < until)
            if (proven) break
        }
        // exactly one message may have appeared in the whole page; the text must not be left in any other box
        const allAfter = Number(await run('countAll')) || 0
        if (proven && allBefore > 0 && allAfter - allBefore > 1) ctx.diag.dup = true
        if ((await run('stray', text)) > 0) await run('clearStray', text)
        if (!proven && (await stillThere())) await run('clear')
        // the draft belongs to the notified chat: it goes back BEFORE the user is returned to the chat they were in
        if (hadDraft && (await stillThere())) await run('set', draft)
        hadDraft = false
        if (proven && before.key && before.key !== chatTarget) await run('restore', before.key)
        return proven ? 'ok' : 'failed'
    } catch {
        return 'failed'
    } finally {
        // the user's own draft comes back whatever happened, but only into the chat it was taken from
        if (hadDraft) { try { if (await stillThere()) await run('set', draft) } catch { /* the tab went away */ } }
    }
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
