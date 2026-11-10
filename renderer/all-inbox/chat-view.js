'use strict'
// «Все мессенджеры» (3.8): our own conversation window over the messenger's tab. It only draws what timeline.js gives
// and hands typed text back; the tab behind it does the real work.

const { linkParts } = require('./linkify')
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

const KIND_LABEL = { voice: 'Голосовое сообщение', video: 'Видео', sticker: 'Стикер', file: 'Файл', photo: 'Фото' }

/**
 * @param {{ host: HTMLElement, onSend: (text: string, files: object[]) => Promise<boolean>, onOpenInTab: () => void,
 *   onClose: () => void, onOlder: () => void, onLink: (url: string) => void, onPicture: (key: string) => Promise<string>,
 *   onPickFiles: () => Promise<object[]>, onDescribeFiles: (paths: string[]) => Promise<object[]>,
 *   onPasteImage: () => Promise<object|null> }} deps
 */
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
            <button type="button" class="aic-btn aic-open" title="Открыть в мессенджере">Открыть в мессенджере</button>
            <button type="button" class="aic-btn aic-icon aic-x" aria-label="Закрыть" title="Закрыть">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </header>
        <div class="aic-warn" hidden></div>
        <div class="aic-scroll"><div class="aic-list"></div></div>
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
    scroll.addEventListener('scroll', () => {
        if (Date.now() - touchedAt < USER_SCROLL_MS) stick = atBottom()
        else if (stick) scroll.scrollTop = scroll.scrollHeight
        if (scroll.scrollTop < TOP_LOAD_PX) onOlder()
    }, { passive: true })
    const keepBottom = new ResizeObserver(() => { if (stick) scroll.scrollTop = scroll.scrollHeight })
    keepBottom.observe(list)
    keepBottom.observe(scroll)

    function textWithLinks(text) {
        const node = el('div', 'aic-text')
        for (const part of linkParts(text)) {
            if (!part.url) { node.append(document.createTextNode(part.text)); continue }
            const a = el('a', 'aic-link', part.text)
            a.href = part.url
            a.title = part.url
            a.addEventListener('click', (e) => { e.preventDefault(); onLink(part.url) })
            node.append(a)
        }
        return node
    }

    // a photo opens over the conversation: the small copy at once, the full one as soon as the page gives it
    async function zoom(m) {
        const img = lightbox.querySelector('img')
        img.src = m.media
        lightbox.hidden = false
        lightbox.focus()
        const shown = m.media
        const full = m.picture ? await onPicture(m.picture).catch(() => '') : ''
        if (full && !lightbox.hidden && img.src === shown) img.src = full
    }
    function closeZoom() { lightbox.hidden = true; lightbox.querySelector('img').removeAttribute('src') }
    lightbox.addEventListener('click', closeZoom)
    lightbox.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeZoom() })

    function bubble(m) {
        const row = el('div', `aic-row ${m.out ? 'is-out' : 'is-in'}`)
        const b = el('div', `aic-bubble kind-${m.kind}`)
        if (m.author && !m.out) b.append(el('div', 'aic-author', m.author))
        if (m.forwarded) b.append(el('div', 'aic-fwd', `Переслано от ${m.forwarded}`))
        if (m.reply) b.append(el('div', 'aic-reply', m.reply))
        if (m.media && (m.kind === 'photo' || m.kind === 'sticker' || m.kind === 'video')) {
            const img = el('img', 'aic-media')
            img.src = m.media
            img.alt = ''
            img.loading = 'lazy'
            if (m.kind === 'photo') {
                img.classList.add('is-zoomable')
                img.title = 'Открыть крупно'
                img.addEventListener('click', () => zoom(m))
            }
            b.append(img)
        } else if (m.kind !== 'text') {
            const card = el('button', 'aic-card')
            card.type = 'button'
            card.title = 'Открыть в мессенджере'
            card.append(el('span', 'aic-card-icon', m.kind === 'voice' ? '🎤' : m.kind === 'file' ? '📄' : m.kind === 'video' ? '🎬' : '🖼'))
            card.append(el('span', 'aic-card-text', m.name || KIND_LABEL[m.kind] || ''))
            if (m.duration) card.append(el('span', 'aic-card-meta', m.duration))
            card.addEventListener('click', onOpenInTab)
            b.append(card)
        }
        if (m.text) b.append(textWithLinks(m.text))
        const meta = el('div', 'aic-meta', m.time)
        if (m.out) meta.append(el('span', `aic-check${m.read ? ' is-read' : ''}`, m.read ? '✓✓' : '✓'))
        b.append(meta)
        row.append(b)
        return row
    }

    return {
        show(chat) {
            root.hidden = false
            lastSig = ''
            stick = true
            list.replaceChildren(el('div', 'aic-loading', 'Загружаю переписку…'))
            q('.aic-title').textContent = chat.title
            q('.aic-sub').textContent = chat.messengerName
            const ava = q('.aic-ava')
            ava.replaceChildren()
            if (chat.avatar) { const img = el('img'); img.src = chat.avatar; img.alt = ''; ava.append(img) } else ava.textContent = initials(chat.title)
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
            for (const r of rows) frag.append(r.type === 'day' ? el('div', 'aic-day', r.label) : bubble(r))
            list.replaceChildren(frag)
            // stay at the bottom for new messages; keep the place when earlier ones load above
            scroll.scrollTop = nearBottom ? scroll.scrollHeight : scroll.scrollHeight - fromBottom
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
