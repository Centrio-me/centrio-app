'use strict'
// «Все мессенджеры» (3.8): our own conversation window over the messenger's tab. It only draws what timeline.js gives
// and hands typed text back; the tab behind it does the real work.

const { renderMessage, paintVoice, patchReactions } = require('./message-view')
const { createMediaPlayer } = require('./media-player')
const { sharedDrafts } = require('./drafts')
const { firstUnreadId } = require('./first-unread')
const { createComposer } = require('./composer')
const { readBackground, saveBackground, createBackgroundMenu } = require('./chat-backgrounds')
const { createLightbox, galleryOf } = require('./lightbox')
const { createFloatingDay } = require('./floating-day')
const { createChatSearch } = require('./chat-search')

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
// what the page gave (a data: address) becomes a blob: one, which the window may play
function dataToBlobUrl(data, mime) {
    const comma = data.indexOf(',')
    const bin = atob(data.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime || data.slice(5, data.indexOf(';')) }))
}

// a group chat: the messenger draws avatars of the people, or at least two different people write in it
function isGroupChat(rows) {
    const incoming = rows.filter((r) => r.type === 'msg' && !r.out)
    if (incoming.some((r) => r.avatar)) return true
    return new Set(incoming.map((r) => r.author).filter(Boolean)).size >= 2
}

// while the chat opens in the tab and is read: Centrio's mark turns about its own axis in the middle of the window
function openingMark() {
    const box = el('div', 'aic-opening')
    box.setAttribute('role', 'status')
    const mark = el('div', 'aic-opening-mark')
    mark.append(Object.assign(el('img'), { src: 'assets/logo.png', alt: '' }))
    box.append(mark, el('div', 'aic-opening-text', 'Открываю чат…'))
    return box
}

function createChatView({ onDismissPending = () => {}, host, onSend, onOpenInTab, onClose, onOlder, onLink, onPicture, onPickFiles, onDescribeFiles, onPasteImage, canReply = () => false, onEdit = null, canEdit = () => false, onReact = null, reactionsFor = () => [], onDelete = null, canDelete = () => false, onMedia = () => Promise.resolve(null), canPlay = () => false, onVote = null, canVote = () => false }) {
    const root = el('section', 'aic')
    root.hidden = true
    root.dataset.bg = readBackground()
    root.innerHTML = `
        <header class="aic-head">
            <div class="aic-ava"></div>
            <div class="aic-who"><div class="aic-title"></div><div class="aic-sub"></div></div>
            <button type="button" class="aic-btn aic-icon aic-search-btn" title="Поиск в переписке (Ctrl+F)" aria-label="Поиск в переписке">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            </button>
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
        </button>`
    host.appendChild(root)

    const q = (s) => root.querySelector(s)
    const scroll = q('.aic-scroll')
    const list = q('.aic-list')
    let lastSig = null // null: nothing drawn yet — an empty chat ('' signature) is still drawn once

    const drafts = sharedDrafts
    let chatId = ''
    let shownOnce = false // the field has shown for this chat (it takes the cursor then)
    let chatIsSaved = false // «Избранное»: nobody else to delete a message for
    // a failure says what happened and what to do; a red edge for a moment said nothing (3.8.3 check)
    const said = (p, text) => Promise.resolve(p).then((ok) => { if (ok === false) flash(text); return ok }, () => { flash(text); return false })
    const sendSaying = (...a) => said(onSend(...a), 'Не отправилось. Текст остался в поле — попробуйте ещё раз или откройте чат в мессенджере')
    const editSaying = onEdit ? (...a) => said(onEdit(...a), 'Не удалось изменить сообщение') : onEdit
    const composer = createComposer({ root, onSend: sendSaying, onEdit: editSaying, onPickFiles, onDescribeFiles, onPasteImage, onDraft: (text) => drafts.keep(chatId, text), chatKey: () => chatId, onDraftFor: (id, text) => drafts.keep(id, text) })
    composer.setVisible(false)
    // the «down» button and the toast stand above the field, however tall it grows (styles-all-inbox.css)
    new ResizeObserver(() => root.style.setProperty('--aic-compose-h', `${composer.el.offsetHeight}px`)).observe(composer.el)
    root.append(composer.el)
    const lightbox = createLightbox({ root, onPicture })
    // voice messages play here; every drawn bubble of a message shows the player's state again
    const player = createMediaPlayer({
        load: onMedia,
        toUrl: dataToBlobUrl,
        revoke: (url) => URL.revokeObjectURL(url),
        onChange: (state) => { for (const box of list.querySelectorAll('.aic-voice[data-play]')) paintVoice(box, state) }
    })
    function onVoice(m) {
        const s = player.state()
        // the messenger could not give this one: it is listened to in the messenger itself
        if (s.id === m.id && s.failed) { onOpenInTab(); return }
        player.toggle(m.id)
    }
    // a vote: one at a time per poll; if the messenger did not take it, the poll can be voted in again
    const voting = new Set()
    async function vote(m, indexes) {
        if (voting.has(m.id)) return
        voting.add(m.id)
        const ok = await Promise.resolve(onVote(m, indexes)).catch(() => false)
        voting.delete(m.id)
        if (!ok) for (const box of list.querySelectorAll(`.aic-row[data-id="${CSS.escape(m.id)}"] .aic-poll`)) box.classList.remove('is-sending')
    }
    // a video: taken from the page and played on the whole window; one too big or not given opens in the messenger
    let videoToken = 0
    async function onVideo(m, holder) {
        const mine = ++videoToken
        holder.classList.add('is-loading')
        const got = await Promise.resolve(onMedia(m.id)).catch(() => null)
        holder.classList.remove('is-loading')
        if (mine !== videoToken || root.hidden) return
        if (!got) { onOpenInTab(); return }
        player.reset()
        lightbox.openVideo(dataToBlobUrl(got.data, got.mime), [m.out ? 'Вы' : (m.author || q('.aic-title').textContent), m.time].filter(Boolean).join(' · '), !!m.round)
    }
    const floatingDay = createFloatingDay({ root, scroll, list })
    const search = createChatSearch({ root, list, anchor: q('.aic-head') })
    q('.aic-search-btn').addEventListener('click', () => (search.isOpen() ? search.hide() : search.open()))
    root.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); e.stopPropagation(); search.open() }
    })
    let lastRows = []

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
    // Esc closes the conversation, as in Telegram — after the emoji panel, the answer strip, the menu and the photo
    root.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || lightbox.isOpen() || !menu.hidden || bgMenu.isOpen() || !askBox.hidden) return
        e.preventDefault()
        // the field's menu or the emoji panel goes first
        if (composer.hasPopup()) { composer.closePopups(); return }
        onClose()
    })
    // a click on the history (or a photo or the search just closed) leaves the focus on the page, outside the window:
    // Esc and Ctrl+F still belong to the open conversation, unless the person is typing somewhere else
    document.addEventListener('keydown', (e) => {
        if (root.hidden || e.defaultPrevented || root.contains(e.target)) return
        const t = e.target
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
        // a window of Centrio over everything (settings, a modal) keeps its own keys
        if (document.querySelector('.modal.active, .modal-overlay.active') || [...document.querySelectorAll('[role="dialog"]')].some((d) => !root.contains(d) && d.offsetParent)) return
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); search.open(); return }
        if (e.key === 'Escape' && !lightbox.isOpen() && menu.hidden && !bgMenu.isOpen() && askBox.hidden) { e.preventDefault(); onClose() }
    })
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
    let byId = new Map()
    // a chat with unread messages opens where they begin, under a «Непрочитанные сообщения» bar (3.8.3, like Telegram);
    // the bar stays until the chat is opened again
    // the day mark above each message («Сегодня», «3 сентября»): MAX gives no date of its own (edit-window.js)
    let dayOf = new Map()
    let unreadAtOpen = 0
    let startId = ''

    // the menu of a message on a right click: answer, copy the text, open it in the messenger
    const menu = el('div', 'aic-menu')
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    root.append(menu)
    function closeMenu() { menu.hidden = true }
    function item(label, icon, run, danger = false) {
        const b = el('button', `aic-menu-item${danger ? ' is-danger' : ''}`)
        b.type = 'button'
        b.setAttribute('role', 'menuitem')
        b.innerHTML = icon
        b.append(el('span', '', label))
        b.addEventListener('click', () => { closeMenu(); run() })
        menu.append(b)
    }
    const ICON_REPLY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'
    const ICON_COPY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>'
    const ICON_EDIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
    const ICON_IMAGE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>'
    const ICON_SAVE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
    const ICON_TASK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>'
    const ICON_NOTE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>'
    const ICON_DELETE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>'
    const ICON_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>'
    // a message that did not go: a click on its red mark takes it away
    list.addEventListener('click', (e) => {
        const mark = e.target.closest('[data-dismiss]')
        if (mark) { e.stopPropagation(); onDismissPending(mark.dataset.dismiss) }
    })
    list.addEventListener('contextmenu', (e) => {
        const rowEl = e.target.closest('.aic-row')
        const m = rowEl && byId.get(rowEl.dataset.id)
        if (!m) return
        e.preventDefault()
        menu.replaceChildren()
        // reactions of the messenger in a row on top, like Telegram and MAX (3.8.3); a second press takes one off
        const emojis = onReact && m.kind !== 'note' ? reactionsFor() : []
        if (emojis.length) {
            const row = el('div', 'aic-menu-reacts')
            for (const emoji of emojis) {
                const b = el('button', 'aic-menu-react', emoji)
                b.type = 'button'
                b.title = emoji
                b.addEventListener('click', () => { closeMenu(); said(onReact(m, emoji), 'Реакция не поставилась') })
                row.append(b)
            }
            menu.append(row)
        }
        if (canReply()) item('Ответить', ICON_REPLY, () => composer.replyTo(m))
        if (onEdit && m.out && m.text && canEdit(m, dayOf.get(m.id))) item('Изменить', ICON_EDIT, () => composer.edit(m))
        const selected = String(window.getSelection() || '').trim()
        if (selected || m.text) item(selected ? 'Копировать выделенное' : 'Копировать текст', ICON_COPY, () => navigator.clipboard.writeText(selected || m.text).catch(() => {}))
        // a picture (3.8.3): copied or saved in full size
        if (m.media && (m.kind === 'photo' || m.kind === 'sticker' || m.picture)) {
            item('Копировать картинку', ICON_IMAGE, () => fullPictureOf(m).then(copyPicture).catch(() => {}))
            item('Сохранить картинку', ICON_SAVE, () => fullPictureOf(m).then((src) => savePicture(src, m)).catch(() => {}))
        }
        // a task or a note made of the message (3.8.3): the main window makes them (renderer.js, «all-inbox-make»)
        const what = selected || m.text || m.name || ''
        if (what) {
            item('Создать задачу', ICON_TASK, () => document.dispatchEvent(new CustomEvent('all-inbox-make', { detail: { kind: 'task', text: what, from: q('.aic-title').textContent, done: flash } })))
            item('Создать заметку', ICON_NOTE, () => document.dispatchEvent(new CustomEvent('all-inbox-make', { detail: { kind: 'note', text: what, from: q('.aic-title').textContent, done: flash } })))
        }
        item('Открыть в мессенджере', ICON_OPEN, onOpenInTab)
        if (onDelete && canDelete(m)) item('Удалить', ICON_DELETE, () => askDelete(m), true)
        menu.hidden = false
        const box = root.getBoundingClientRect()
        const x = Math.min(e.clientX - box.left, box.width - menu.offsetWidth - 8)
        const y = Math.min(e.clientY - box.top, box.height - menu.offsetHeight - 8)
        menu.style.left = `${Math.max(8, x)}px`
        menu.style.top = `${Math.max(8, y)}px`
    })
    // ── pictures: the full size from the tab, copied as PNG or saved through the main process (3.8.3) ──────────
    async function fullPictureOf(m) {
        const full = m.picture ? await onPicture(m.picture).catch(() => '') : ''
        return full || m.media
    }
    function toPngBlob(src) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                const c = document.createElement('canvas')
                c.width = img.naturalWidth
                c.height = img.naturalHeight
                c.getContext('2d').drawImage(img, 0, 0)
                c.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png')
            }
            img.onerror = () => reject(new Error('no picture'))
            img.src = src
        })
    }
    async function copyPicture(src) {
        const blob = await toPngBlob(src)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        flash('Картинка скопирована')
    }
    // a short word at the bottom of the window: what just happened (3.8.3)
    const toast = el('div', 'aic-toast')
    toast.hidden = true
    toast.setAttribute('role', 'status')
    root.append(toast)
    let toastTimer = null
    function flash(text) {
        if (!text) return
        toast.textContent = text
        toast.hidden = false
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => { toast.hidden = true }, Math.max(2200, text.length * 55)) // a longer word stays longer
    }
    function savePicture(src, m) {
        const name = String(m.name || '').trim() || `Изображение_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`
        document.dispatchEvent(new CustomEvent('all-inbox-save-picture', { detail: { src, name, done: flash } }))
    }

    // ── deleting (3.8.3): asked first; the message leaves our window only when it is gone in the messenger ──────
    const askBox = el('div', 'aic-ask')
    askBox.hidden = true
    root.append(askBox)
    function askDelete(m) {
        askBox.replaceChildren()
        const card = el('div', 'aic-ask-card')
        card.setAttribute('role', 'dialog')
        card.append(el('div', 'aic-ask-title', 'Удалить сообщение?'))
        let forAll = null
        if (m.out && !chatIsSaved) {
            const lab = el('label', 'aic-ask-check')
            forAll = el('input')
            forAll.type = 'checkbox'
            forAll.checked = true
            lab.append(forAll, el('span', '', 'Удалить у всех'))
            card.append(lab)
        } else card.append(el('div', 'aic-ask-text', 'Сообщение удалится у вас.'))
        const row = el('div', 'aic-ask-actions')
        const cancel = el('button', 'aic-ask-btn', 'Отмена')
        const ok = el('button', 'aic-ask-btn is-danger', 'Удалить')
        cancel.type = 'button'
        ok.type = 'button'
        cancel.addEventListener('click', () => { askBox.hidden = true })
        ok.addEventListener('click', () => { askBox.hidden = true; said(onDelete(m, !!(forAll && forAll.checked)), 'Не удалось удалить сообщение') })
        row.append(cancel, ok)
        card.append(row)
        askBox.append(card)
        askBox.hidden = false
        // the safe answer under Enter; deleting is a deliberate click
        cancel.focus()
    }
    askBox.addEventListener('mousedown', (e) => { if (e.target === askBox) askBox.hidden = true })
    askBox.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return
        // only the question goes; the conversation stays open (Esc reached the window and closed it too)
        e.preventDefault()
        e.stopPropagation()
        askBox.hidden = true
        composer.focus()
    })

    document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu() })
    scroll.addEventListener('scroll', closeMenu, { passive: true })
    const keepBottom = new ResizeObserver(() => { if (stick) scroll.scrollTop = scroll.scrollHeight })
    keepBottom.observe(list)
    keepBottom.observe(scroll)

    // a photo opens on the whole window, with every photo of the chat to go through
    function zoom(m, src) { lightbox.open(galleryOf(lastRows), src, q('.aic-title').textContent) }
    function closeZoom() { lightbox.hide() }

    return {
        show(chat) {
            root.hidden = false
            // the split's own layer (zone placeholders, handles) lies over the page above everything; while our
            // window is open it steps aside, or in three columns the window can't be clicked (3.8.3)
            document.body.classList.add('all-inbox-chat-open')
            document.dispatchEvent(new CustomEvent('close-all-popups'))
            lastSig = null
            stick = true
            player.reset()
            videoToken++
            floatingDay.reset()
            search.reset()
            lastRows = []
            seenIds = new Set()
            unseen = 0
            unreadAtOpen = Math.max(0, Number(chat.unread) || 0)
            startId = ''
            list.replaceChildren(openingMark())
            // the window comes in softly each time a chat is opened
            root.classList.remove('is-opening')
            void root.offsetWidth
            root.classList.add('is-opening')
            q('.aic-title').textContent = chat.title
            q('.aic-sub').textContent = chat.messengerName
            const ava = q('.aic-ava')
            ava.replaceChildren()
            ava.className = `aic-ava${chat.icon ? ` is-icon is-${chat.icon}` : ''}`
            if (chat.icon === 'saved') ava.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>'
            else if (chat.avatar) { const img = el('img'); img.src = chat.avatar; img.alt = ''; ava.append(img) } else ava.textContent = initials(chat.title)
            if (chat.messengerIcon) { const mark = el('img', 'ai-service'); mark.src = chat.messengerIcon; mark.alt = ''; ava.append(mark) }
            chatId = chat.id
            chatIsSaved = chat.icon === 'saved'
            // the photos of the previous chat do not stay over this one
            closeZoom()
            // a question about a message of the previous chat must not stay to act on this one
            askBox.hidden = true
            composer.reset(drafts.take(chat.id))
            composer.setVisible(false)
            shownOnce = false
        },
        // «печатает…» in the header in the accent colour, with its dots, like in Telegram
        setSubtitle(text) {
            if (!text) return
            const sub = q('.aic-sub')
            sub.textContent = text
            sub.classList.toggle('is-typing', /печата|набира|записыва|typing|recording/i.test(text))
            // «в сети» in the accent, like Telegram
            sub.classList.toggle('is-online', /^(в сети|online)/i.test(text))
        },
        update(rows, sig) {
            if (sig === lastSig) return
            const nearBottom = stick || atBottom() || !lastSig
            const fromBottom = scroll.scrollHeight - scroll.scrollTop
            lastSig = sig
            lastRows = rows
            const frag = document.createDocumentFragment()
            if (!rows.length) frag.append(el('div', 'aic-loading', 'Сообщений пока нет'))
            // a group chat (names of authors) gets avatars next to the groups, like Telegram; private chats do not
            const isGroup = isGroupChat(rows)
            const playable = canPlay()
            const ctx = { isGroup, onLink, onZoom: zoom, onOpenInTab, onReply: canReply() ? (m) => composer.replyTo(m) : null,
                onVoice: playable ? onVoice : null, onSeek: (m, part) => player.seek(m.id, part), onVideo: playable ? onVideo : null, playerState: player.state,
                onVote: onVote && canVote() ? vote : null, isVoting: (id) => voting.has(id) }
            byId = new Map()
            dayOf = new Map()
            let dayLabel = ''
            const firstDraw = !seenIds.size
            const openAtUnread = firstDraw && rows.length > 0 && unreadAtOpen > 0
            if (openAtUnread) startId = firstUnreadId(rows, unreadAtOpen)
            let startBar = null
            let arrived = 0
            const ids = new Set()
            // new means below the newest message already seen: earlier ones loaded above are history, not news (they
            // counted in the «down» button and slid in as new, 3.8.3 check)
            let lastSeenAt = -1
            rows.forEach((r, i) => { if (r.id && seenIds.has(r.id)) lastSeenAt = i })
            rows.forEach((r, i) => {
                if (r.type === 'day') { dayLabel = r.label; const day = el('div', 'aic-day'); day.append(el('span', '', r.label)); frag.append(day); return }
                // an event in the chat: a small note in the middle, like Telegram's service messages
                if (r.type === 'note') { const note = el('div', 'aic-note'); note.append(el('span', '', r.text)); frag.append(note); return }
                const node = renderMessage(r, ctx)
                if (startId && r.id === startId) {
                    startBar = el('div', 'aic-unread-bar')
                    startBar.append(el('span', '', 'Непрочитанные сообщения'))
                    frag.append(startBar)
                }
                ids.add(r.id)
                byId.set(r.id, r)
                dayOf.set(r.id, dayLabel)
                // what came in since the last look slides in softly, like in Telegram
                if (!firstDraw && !seenIds.has(r.id) && lastSeenAt >= 0 && i > lastSeenAt) { node.classList.add('is-new'); arrived++ }
                frag.append(node)
            })
            seenIds = ids
            list.classList.toggle('is-group', isGroup)
            list.replaceChildren(frag)
            search.refresh()
            if (!nearBottom && arrived) unseen += arrived
            if (openAtUnread && startBar) {
                // the first unread message near the top of the window; the «down» button counts what is below
                stick = false
                unseen = unreadAtOpen
                scroll.scrollTop = Math.max(0, startBar.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 12)
                refreshDown()
                return
            }
            // stay at the bottom for new messages; keep the place when earlier ones load above
            scroll.scrollTop = nearBottom ? scroll.scrollHeight : scroll.scrollHeight - fromBottom
            refreshDown()
        },
        // the tab shows another chat: nothing of it is drawn and nothing can be sent until the right one is open
        setMismatch(on, openTitle) {
            const warn = q('.aic-warn')
            // another chat in the tab: said plainly; the chat still opening: the turning mark, no words
            warn.hidden = !(on && openTitle)
            warn.textContent = on && openTitle ? `Во вкладке сейчас открыт другой чат: «${openTitle}». Отправка выключена.` : ''
            composer.setBlocked(on)
            if (on) {
                lastSig = null
                if (openTitle) list.replaceChildren()
                else if (!list.querySelector('.aic-opening')) list.replaceChildren(openingMark())
            }
        },
        // the chat has not shown up for a while: said plainly, with the way out, instead of turning forever
        setStuck() {
            const box = list.querySelector('.aic-opening')
            if (!box || box.classList.contains('is-stuck')) return
            const stuck = el('div', 'aic-opening is-stuck')
            stuck.setAttribute('role', 'status')
            const go = el('button', 'aic-stuck-btn', 'Открыть в мессенджере')
            go.type = 'button'
            go.addEventListener('click', () => onOpenInTab())
            stuck.append(el('div', 'aic-opening-text', 'Чат пока не открылся'),
                el('div', 'aic-stuck-text', 'Мессенджер ещё загружается или в нём не выполнен вход.'), go)
            list.replaceChildren(stuck)
        },
        setCanWrite(on) {
            const firstShow = on && !shownOnce
            composer.setVisible(on)
            if (on) shownOnce = true
            // as in Telegram: the chat opens ready to type (the field was focused while still hidden, which did nothing)
            if (firstShow && !root.hidden) {
                const a = document.activeElement
                if (!a || a === document.body || a.closest?.('.ai-row, .aic')) composer.focus()
            }
        },
        // a pressed reaction: only that message's reactions change, at once
        showReactions(id, items) { return patchReactions(list, id, items) },
        hide() { player.reset(); videoToken++; closeZoom(); closeMenu(); askBox.hidden = true; bgMenu.toggle(false); root.hidden = true; document.body.classList.remove('all-inbox-chat-open') },
        isShown: () => !root.hidden,
        // the person really sees the newest messages: our window on screen, Centrio in focus, the conversation at its end
        isReading: () => !root.hidden && !lightbox.isOpen() && document.visibilityState === 'visible' && document.hasFocus() && atBottom()
    }
}

module.exports = { createChatView }
