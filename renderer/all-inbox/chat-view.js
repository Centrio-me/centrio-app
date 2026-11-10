'use strict'
// «Все мессенджеры» (3.8): our own conversation window over the messenger's tab. It only draws what timeline.js gives
// and hands typed text back; the tab behind it does the real work.

const { renderMessage } = require('./message-view')
const { createComposer } = require('./composer')
const { readBackground, saveBackground, createBackgroundMenu } = require('./chat-backgrounds')

const NEAR_BOTTOM_PX = 120
const TOP_LOAD_PX = 40
const USER_SCROLL_MS = 1200

function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

function initials(title) {
    const words = String(title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
    return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase()
}

/**
 * @param {{ host: HTMLElement, onSend: (text: string, files: object[]) => Promise<boolean>, onOpenInTab: () => void,
 *   onClose: () => void, onOlder: () => void, onLink: (url: string) => void, onPicture: (key: string) => Promise<string>,
 *   onPickFiles: () => Promise<object[]>, onDescribeFiles: (paths: string[]) => Promise<object[]>,
 *   onPasteImage: () => Promise<object|null> }} deps
 */
// a group chat: the messenger draws avatars of the people, or at least two different people write in it
function isGroupChat(rows) {
    const incoming = rows.filter((r) => r.type === 'msg' && !r.out)
    if (incoming.some((r) => r.avatar)) return true
    return new Set(incoming.map((r) => r.author).filter(Boolean)).size >= 2
}

function createChatView({ host, onSend, onOpenInTab, onClose, onOlder, onLink, onPicture, onPickFiles, onDescribeFiles, onPasteImage }) {
    const root = el('section', 'aic')
    root.hidden = true
    root.dataset.bg = readBackground()
    root.innerHTML = `
        <header class="aic-head">
            <div class="aic-ava"></div>
            <div class="aic-who"><div class="aic-title"></div><div class="aic-sub"></div></div>
            <button type="button" class="aic-btn aic-icon aic-bg" title="Фон чата" aria-label="Фон чата">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
            <button type="button" class="aic-btn aic-icon aic-open" title="Открыть в мессенджере" aria-label="Открыть в мессенджере">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>
            </button>
            <button type="button" class="aic-btn aic-icon aic-x" aria-label="Закрыть" title="Закрыть">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </header>
        <div class="aic-warn" hidden></div>
        <div class="aic-scroll"><div class="aic-list"></div></div>
        <button type="button" class="aic-down" hidden aria-label="К новым сообщениям" title="К новым сообщениям">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            <span class="aic-down-n" hidden></span>
        </button>
        <div class="aic-lightbox" tabindex="-1" hidden title="Закрыть"><img alt=""></div>`
    host.appendChild(root)
    const lightbox = root.querySelector('.aic-lightbox')

    const q = (s) => root.querySelector(s)
    const scroll = q('.aic-scroll')
    const list = q('.aic-list')
    let lastSig = ''

    const composer = createComposer({ root, onSend, onPickFiles, onDescribeFiles, onPasteImage })
    composer.setVisible(false)
    root.insertBefore(composer.el, lightbox)

    const bgButton = q('.aic-bg')
    const bgMenu = createBackgroundMenu({
        current: root.dataset.bg,
        onChoose: (id) => { root.dataset.bg = id; saveBackground(id) }
    })
    q('.aic-head').append(bgMenu.el)
    bgButton.addEventListener('click', () => bgButton.classList.toggle('is-on', bgMenu.toggle()))
    document.addEventListener('mousedown', (e) => {
        if (bgMenu.isOpen() && !bgMenu.el.contains(e.target) && !bgButton.contains(e.target)) { bgMenu.toggle(false); bgButton.classList.remove('is-on') }
    })

    q('.aic-open').addEventListener('click', onOpenInTab)
    q('.aic-x').addEventListener('click', onClose)
    // the conversation sticks to its newest message until the person scrolls up; pictures that load late keep it there
    let stick = true
    const atBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < NEAR_BOTTOM_PX
    // only the person's own scrolling unsticks it: pictures growing above move the view too, and must not
    let touchedAt = 0
    const touched = () => { touchedAt = Date.now() }
    for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) scroll.addEventListener(type, touched, { passive: true })
    // the round «down» button of Telegram: shows while reading above, counts what arrived meanwhile
    const down = q('.aic-down')
    const downN = q('.aic-down-n')
    let unseen = 0
    function refreshDown() {
        const away = !stick && !atBottom()
        down.hidden = !away
        if (!away) unseen = 0
        downN.hidden = !unseen
        downN.textContent = unseen > 99 ? '99+' : String(unseen)
    }
    down.addEventListener('click', () => { stick = true; unseen = 0; scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' }); refreshDown() })
    scroll.addEventListener('scroll', () => {
        if (Date.now() - touchedAt < USER_SCROLL_MS) stick = atBottom()
        else if (stick) scroll.scrollTop = scroll.scrollHeight
        if (scroll.scrollTop < TOP_LOAD_PX) onOlder()
        refreshDown()
    }, { passive: true })
    let seenIds = new Set()
    const keepBottom = new ResizeObserver(() => { if (stick) scroll.scrollTop = scroll.scrollHeight })
    keepBottom.observe(list)
    keepBottom.observe(scroll)

    // a photo opens over the conversation: the small copy at once, the full one as soon as the page gives it
    async function zoom(m, src, pictureKey) {
        const img = lightbox.querySelector('img')
        img.src = src
        lightbox.hidden = false
        lightbox.focus()
        const shown = src
        const full = pictureKey ? await onPicture(pictureKey).catch(() => '') : ''
        if (full && !lightbox.hidden && img.src === shown) img.src = full
    }
    function closeZoom() { lightbox.hidden = true; lightbox.querySelector('img').removeAttribute('src') }
    lightbox.addEventListener('click', closeZoom)
    lightbox.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeZoom() })

    return {
        show(chat) {
            root.hidden = false
            lastSig = ''
            stick = true
            seenIds = new Set()
            unseen = 0
            list.replaceChildren(el('div', 'aic-loading', 'Загружаю переписку…'))
            q('.aic-title').textContent = chat.title
            q('.aic-sub').textContent = chat.messengerName
            const ava = q('.aic-ava')
            ava.replaceChildren()
            ava.className = `aic-ava${chat.icon ? ` is-icon is-${chat.icon}` : ''}`
            if (chat.icon === 'saved') ava.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>'
            else if (chat.avatar) { const img = el('img'); img.src = chat.avatar; img.alt = ''; ava.append(img) } else ava.textContent = initials(chat.title)
            if (chat.messengerIcon) { const mark = el('img', 'ai-service'); mark.src = chat.messengerIcon; mark.alt = ''; ava.append(mark) }
            composer.reset()
            composer.setVisible(false)
            setTimeout(() => composer.focus(), 50)
        },
        setSubtitle(text) { if (text) q('.aic-sub').textContent = text },
        update(rows, sig) {
            if (sig === lastSig) return
            const nearBottom = stick || atBottom() || !lastSig
            const fromBottom = scroll.scrollHeight - scroll.scrollTop
            lastSig = sig
            const frag = document.createDocumentFragment()
            if (!rows.length) frag.append(el('div', 'aic-loading', 'Сообщений пока нет'))
            // a group chat (names of authors) gets avatars next to the groups, like Telegram; private chats do not
            const isGroup = isGroupChat(rows)
            const ctx = { isGroup, onLink, onZoom: zoom, onOpenInTab }
            const firstDraw = !seenIds.size
            let arrived = 0
            const ids = new Set()
            for (const r of rows) {
                if (r.type === 'day') { const day = el('div', 'aic-day'); day.append(el('span', '', r.label)); frag.append(day); continue }
                const node = renderMessage(r, ctx)
                ids.add(r.id)
                // what came in since the last look slides in softly, like in Telegram
                if (!firstDraw && !seenIds.has(r.id)) { node.classList.add('is-new'); arrived++ }
                frag.append(node)
            }
            seenIds = ids
            list.classList.toggle('is-group', isGroup)
            list.replaceChildren(frag)
            if (!nearBottom && arrived) unseen += arrived
            // stay at the bottom for new messages; keep the place when earlier ones load above
            scroll.scrollTop = nearBottom ? scroll.scrollHeight : scroll.scrollHeight - fromBottom
            refreshDown()
        },
        // the tab shows another chat: nothing of it is drawn and nothing can be sent until the right one is open
        setMismatch(on, openTitle) {
            const warn = q('.aic-warn')
            warn.hidden = !on
            warn.textContent = on ? (openTitle ? `Во вкладке сейчас открыт другой чат: «${openTitle}». Отправка выключена.` : 'Чат ещё открывается…') : ''
            composer.setBlocked(on)
            if (on) { lastSig = ''; list.replaceChildren() }
        },
        setCanWrite(on) { composer.setVisible(on) },
        hide() { closeZoom(); bgMenu.toggle(false); root.hidden = true },
        isShown: () => !root.hidden
    }
}

module.exports = { createChatView }
