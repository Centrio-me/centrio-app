'use strict'
// «Все мессенджеры» (3.8): our own conversation window over the messenger's tab. It only draws what timeline.js gives
// and hands typed text back; the tab behind it does the real work.

const { linkParts } = require('./linkify')

const NEAR_BOTTOM_PX = 120
const TOP_LOAD_PX = 40

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
 * @param {{ host: HTMLElement, onSend: (text: string) => Promise<boolean>, onOpenInTab: () => void, onClose: () => void,
 *   onOlder: () => void, onLink: (url: string) => void, onPicture: (key: string) => Promise<string> }} deps
 */
function createChatView({ host, onSend, onOpenInTab, onClose, onOlder, onLink, onPicture }) {
    const root = el('section', 'aic')
    root.hidden = true
    root.innerHTML = `
        <header class="aic-head">
            <div class="aic-ava"></div>
            <div class="aic-who"><div class="aic-title"></div><div class="aic-sub"></div></div>
            <button type="button" class="aic-btn aic-open" title="Открыть в мессенджере">Открыть в мессенджере</button>
            <button type="button" class="aic-btn aic-x" aria-label="Закрыть" title="Закрыть">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </header>
        <div class="aic-warn" hidden></div>
        <div class="aic-scroll"><div class="aic-list"></div></div>
        <form class="aic-compose" autocomplete="off">
            <textarea class="aic-input" rows="1" placeholder="Сообщение"></textarea>
            <button type="submit" class="aic-send" aria-label="Отправить" title="Отправить (Enter)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
        </form>
        <div class="aic-lightbox" tabindex="-1" hidden title="Закрыть"><img alt=""></div>`
    host.appendChild(root)
    const lightbox = root.querySelector('.aic-lightbox')

    const q = (s) => root.querySelector(s)
    const scroll = q('.aic-scroll')
    const list = q('.aic-list')
    const input = q('.aic-input')
    const form = q('.aic-compose')
    let lastSig = ''
    let sending = false

    function autosize() {
        input.style.height = 'auto'
        input.style.height = Math.min(160, input.scrollHeight) + 'px'
    }

    async function submit() {
        const text = input.value.trim()
        if (!text || sending) return
        sending = true
        form.classList.add('is-sending')
        const ok = await onSend(text).catch(() => false)
        sending = false
        form.classList.remove('is-sending')
        if (ok) { input.value = ''; autosize() }
        input.focus()
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit() })
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
    })
    input.addEventListener('input', autosize)
    q('.aic-open').addEventListener('click', onOpenInTab)
    q('.aic-x').addEventListener('click', onClose)
    scroll.addEventListener('scroll', () => { if (scroll.scrollTop < TOP_LOAD_PX) onOlder() }, { passive: true })

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
            list.replaceChildren(el('div', 'aic-loading', 'Загружаю переписку…'))
            q('.aic-title').textContent = chat.title
            q('.aic-sub').textContent = chat.messengerName
            const ava = q('.aic-ava')
            ava.replaceChildren()
            if (chat.avatar) { const img = el('img'); img.src = chat.avatar; img.alt = ''; ava.append(img) } else ava.textContent = initials(chat.title)
            if (chat.messengerIcon) { const mark = el('img', 'ai-service'); mark.src = chat.messengerIcon; mark.alt = ''; ava.append(mark) }
            input.value = ''
            autosize()
            setTimeout(() => input.focus(), 50)
        },
        setSubtitle(text) { if (text) q('.aic-sub').textContent = text },
        update(rows, sig) {
            if (sig === lastSig) return
            const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < NEAR_BOTTOM_PX || !lastSig
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
            form.classList.toggle('is-blocked', on)
            input.disabled = on
            if (on) { lastSig = ''; list.replaceChildren() }
        },
        hide() { closeZoom(); root.hidden = true },
        isShown: () => !root.hidden
    }
}

module.exports = { createChatView }
