// Answering a message straight from its notification pop-up. The pop-up only asks; the page of the messenger does the
// work: first the chat is opened by the site's own notification click (renderer/notif-open-chat.js), then the text is
// typed into the site's message box the way a keyboard would (real input events), and Enter is pressed.
//
// A reply is reported as sent ONLY when it is proven: the text was really in the message box before sending and the box
// was emptied afterwards. Anything else is reported as a failure, so the pop-up never says "sent" for a message that did
// not go out.
const OPEN_SETTLE_MS = 700
const SETTLE_AFTER_TYPING_MS = 250
const SETTLE_AFTER_SEND_MS = 900
const COMPOSER_WAIT_MS = 4000

// Per site: where the message box and the send button are. Selectors are tried in order; the first match wins.
const TELEGRAM = {
    chatKey: 'hash', // the address hash is the open chat; it can be put back without a reload
    composer: ['.chat-input .input-message-input[contenteditable="true"]', '.input-message-input[contenteditable="true"]', '#editable-message-text', 'div[contenteditable="true"].input-message-input'],
    send: ['.btn-send-container button.btn-send', 'button.btn-send', 'button.main-button.send', '.Button.send', 'button[aria-label="Send Message"]'],
    outgoing: ['.bubble.is-out .message', '.Message.own .text-content', '.message.own .text-content']
}
const WHATSAPP = {
    chatKey: 'title',
    composer: ['footer div[contenteditable="true"][role="textbox"]', 'footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="10"]'],
    send: ['footer button[aria-label="Send"]', 'footer button[aria-label="Отправить"]', 'footer span[data-icon="send"]'],
    outgoing: ['div.message-out .copyable-text span.selectable-text']
}
// MAX (checked on a live account, 2026-10-09): the message box is <div role="textbox" contenteditable=""> - note the
// EMPTY attribute value, so [contenteditable="true"] does not match it - and the send button only exists once there is
// text. Enter pressed through input events did not send there, so the button goes first.
const MAX = {
    chatKey: 'path',
    composer: ['[data-testid="composer"] [role="textbox"][contenteditable]:not([contenteditable="false"])', '[role="textbox"][contenteditable]:not([contenteditable="false"])'],
    send: ['button[aria-label="Отправить сообщение"]', 'button[aria-label*="Отправить" i]'],
    outgoing: ['.message--isOut'],
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
        const composer = () => { for (const sel of cfg.composer) { const el = document.querySelector(sel); if (el) return el } return null }
        const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
        const read = (el) => isField(el) ? el.value : (el.innerText != null ? el.innerText : el.textContent)
        const el = composer()
        const kind = cfg.chatKey || 'href'
        if (action === 'key') {
            if (kind === 'hash') return location.hash
            if (kind === 'path') return location.pathname + location.hash
            if (kind === 'title') { const h = document.querySelector('#main header [title], #main header span[dir="auto"]'); return h ? (h.getAttribute('title') || h.textContent || '') : '' }
            return location.href
        }
        if (action === 'count') {
            let total = 0
            for (const sel of cfg.outgoing) total += document.querySelectorAll(sel).length
            return total
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
                const node = document.querySelector(sel)
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

const CHAT_CHANGE_WAIT_MS = 1500
async function waitForChatChange(run, before) {
    const until = Date.now() + CHAT_CHANGE_WAIT_MS
    while (Date.now() < until) {
        if ((await run('key')) !== before) return true
        await sleep(150)
    }
    return false // the chat was already open
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
// 'no-input' (the chat has no message box, e.g. a channel), or 'failed'.
async function sendReply(messenger, nid, text) {
    const adapter = messenger && adapterFor(messenger.url)
    const webview = messenger && document.getElementById(`webview-${messenger.id}`)
    if (!adapter || !webview || typeof webview.executeJavaScript !== 'function') return 'failed'
    const wanted = normalize(text)
    if (!wanted) return 'failed'
    const run = (action, arg) => webview.executeJavaScript(pageScript(adapter.selectors, action, arg))
    try {
        const chatBefore = await run('key')
        const opened = await webview.executeJavaScript(
            `window.__centrioOpenNotif ? window.__centrioOpenNotif(${JSON.stringify(String(nid))}) : false`
        )
        if (!opened) return 'failed'
        // The site switches chats asynchronously (slowly on accounts with many chats): wait until the open chat
        // really changed, otherwise the text would be typed into the chat that was open before.
        await waitForChatChange(run, chatBefore)
        await sleep(OPEN_SETTLE_MS)
        if (!(await waitForComposer(run))) return 'no-input'
        const chatTarget = await run('key')

        // A draft the user already has in this chat is kept aside and put back afterwards.
        const draft = await run('read')
        const hadDraft = normalize(draft) !== ''
        if (hadDraft && !(await run('clear'))) return 'failed'
        await run('focus')
        try { webview.focus() } catch { /* the tab may not be shown; the page-side focus above is enough */ }

        // 1) type like a keyboard; 2) if nothing landed, use the page's editing command.
        let typed = ''
        if (typeof webview.insertText === 'function') {
            await webview.insertText(String(text))
            await sleep(SETTLE_AFTER_TYPING_MS)
            typed = normalize(await run('read'))
        }
        if (typed !== wanted) typed = normalize(await run('set', text))
        if (typed !== wanted) {
            await run('clear')
            return 'failed'
        }
        // The chat must still be the one the reply is meant for; never send into another conversation.
        if ((await run('key')) !== chatTarget) {
            await run('clear')
            return 'failed'
        }
        const sentBefore = Number(await run('count')) || 0

        // Send: the site's button or the Enter key, whichever this site answers to first; then the other one.
        const pressEnter = () => {
            webview.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
            webview.sendInputEvent({ type: 'char', keyCode: 'Enter' })
            webview.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
        }
        const pressButton = () => run('send')
        const attempts = adapter.selectors.sendWith === 'button' ? [pressButton, pressEnter] : [pressEnter, pressButton]
        let left = typed
        let proven = false
        for (const attempt of attempts) {
            await attempt()
            await sleep(SETTLE_AFTER_SEND_MS)
            left = normalize(await run('read'))
            // a new outgoing message counts as proof too: never press the second way when the first one worked
            proven = left === '' || (Number(await run('count')) || 0) > sentBefore
            if (proven) break
        }
        const sent = proven
        if (!sent) await run('clear')
        // Put the user back where they were: a reply from the pop-up must not leave them in another chat.
        if (sent && chatBefore && chatBefore !== chatTarget) await run('restore', chatBefore)
        if (hadDraft) await run('set', draft)
        return sent ? 'ok' : 'failed'
    } catch {
        return 'failed'
    }
}

module.exports = { adapterFor, sendReply }
