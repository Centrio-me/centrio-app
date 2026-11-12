'use strict'
// «Все мессенджеры»: the message field of our conversation window — text, emoji and files. Files come from the
// paper clip, from Explorer (dragged onto the window or copied) and from a pasted picture; they wait here as
// previews until «Отправить», then go to the messenger tab with the text as their caption.
const { addFiles, removeFile, formatSize } = require('./attachments')
const { createEmojiPicker } = require('./emoji-picker')

const MAX_INPUT_PX = 160

const ICON_CLIP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>'
const ICON_SMILE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/></svg>'
// the paper plane of Telegram's send button
const ICON_SEND = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.38 1.18L4.2 11 13 12l-8.8 1-2.18 6.22a.99.99 0 0 0 1.38 1.18z"/></svg>'
const ICON_FILE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'

function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

/** Paths of files from Explorer (drag-and-drop or a copied file); the preload gives them through webUtils. */
function pathsOf(fileList) {
    const api = window.electronAPI
    const out = []
    for (const f of fileList || []) {
        let p = ''
        try { p = api && typeof api.getPathForFile === 'function' ? api.getPathForFile(f) : '' } catch {}
        if (p) out.push(p)
    }
    return out
}

/**
 * @param {{ root: HTMLElement, onSend: (text: string, files: object[]) => Promise<boolean>,
 *   onPickFiles: () => Promise<object[]>, onDescribeFiles: (paths: string[]) => Promise<object[]>,
 *   onPasteImage: () => Promise<object|null> }} deps
 */
function createComposer({ root, onSend, onEdit = null, onPickFiles, onDescribeFiles, onPasteImage, onDraft = () => {}, chatKey = () => '', onDraftFor = () => {} }) {
    const form = el('form', 'aic-compose')
    form.autocomplete = 'off'
    form.innerHTML = `
        <div class="aic-tray" hidden></div>
        <div class="aic-replying" hidden>
            <svg class="aic-replying-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
            <div class="aic-replying-body"><div class="aic-replying-title"></div><div class="aic-replying-text"></div></div>
            <button type="button" class="aic-replying-x" aria-label="Не отвечать" title="Не отвечать (Esc)">×</button>
        </div>
        <div class="aic-line">
        <div class="aic-bar">
            <button type="button" class="aic-tool aic-attach" title="Прикрепить файлы" aria-label="Прикрепить файлы">${ICON_CLIP}</button>
            <textarea class="aic-input" rows="1" placeholder="Сообщение"></textarea>
            <button type="button" class="aic-tool aic-emoji" title="Смайлики" aria-label="Смайлики">${ICON_SMILE}</button>
        </div>
            <button type="submit" class="aic-send" aria-label="Отправить" title="Отправить (Enter)">${ICON_SEND}</button>
        </div>`
    const q = (s) => form.querySelector(s)
    const input = q('.aic-input')
    const tray = q('.aic-tray')
    const emojiBtn = q('.aic-emoji')
    const drop = el('div', 'aic-drop', 'Отпустите, чтобы прикрепить')
    drop.hidden = true
    root.append(drop)

    let files = []
    let sending = false
    // the chat the running send belongs to: a send still going in one chat does not lock the field of another
    let sendingFor = null
    let blocked = false
    // the message being answered: shown above the field, sent as a reply
    let reply = null
    const replying = q('.aic-replying')
    function showReply(m) {
        reply = m
        replying.hidden = !m
        if (!m) return
        replying.style.setProperty('--quote', m.authorColor || '')
        q('.aic-replying-title').textContent = m.out ? 'Ответ себе' : `Ответ ${m.author || ''}`.trim()
        q('.aic-replying-text').textContent = m.text || ({ photo: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', file: m.name || 'Файл', sticker: 'Стикер' }[m.kind] || '')
    }
    // editing an own message (3.8.3): the bar says «Редактирование», the field holds its text, Enter saves, Esc cancels;
    // what was typed before waits and comes back after
    let editing = null
    let beforeEdit = ''
    function showEdit(m) {
        if (!editing) beforeEdit = input.value
        reply = null
        editing = m
        replying.hidden = false
        replying.classList.add('is-edit')
        replying.style.removeProperty('--quote')
        q('.aic-replying-title').textContent = 'Редактирование'
        q('.aic-replying-text').textContent = m.text
        input.value = m.text
        autosize(); refreshSend()
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
    }
    function endEdit() {
        if (!editing) return
        editing = null
        replying.classList.remove('is-edit')
        replying.hidden = true
        input.value = beforeEdit
        beforeEdit = ''
        autosize(); refreshSend()
    }
    q('.aic-replying-x').addEventListener('click', () => { if (editing) endEdit(); else showReply(null); input.focus() })

    const picker = createEmojiPicker({ onPick: insertAtCursor })
    form.append(picker.el)

    // The height is measured on an invisible copy of the field: shrinking the field itself to measure it made the
    // conversation above jump by the field's lines on every key (Oleg, 2026-11-12). The field changes only when it must.
    let mirror = null
    function measuredHeight() {
        if (!mirror) {
            mirror = input.cloneNode(false)
            mirror.removeAttribute('id')
            mirror.removeAttribute('name')
            mirror.setAttribute('aria-hidden', 'true')
            mirror.tabIndex = -1
            mirror.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;height:0;min-height:0;overflow:hidden'
            input.parentNode.appendChild(mirror)
        }
        mirror.style.width = `${input.getBoundingClientRect().width}px`
        mirror.value = input.value || ' '
        return mirror.scrollHeight
    }

    function autosize() {
        if (!input.getBoundingClientRect().width) return // the window is hidden: nothing to measure against
        const next = `${Math.min(MAX_INPUT_PX, measuredHeight())}px`
        if (input.style.height !== next) input.style.height = next
    }

    function insertAtCursor(text) {
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? input.value.length
        input.setRangeText(text, start, end, 'end')
        input.focus()
        autosize()
        refreshSend()
    }

    function refreshSend() {
        form.classList.toggle('has-content', !!(input.value.trim() || files.length))
    }

    // «Фото» (compressed, the messengers' quick send) or «Файл» (as it is) for pictures (3.8.3); the choice is remembered
    const AS_FILE_KEY = 'centrio-all-inbox-as-file'
    let asFile = false
    try { asFile = localStorage.getItem(AS_FILE_KEY) === '1' } catch {}
    const isPicture = (f) => !!f.thumb || /.(jpe?g|png|gif|webp|heic|bmp)$/i.test(String(f.name || ''))
    function modeSwitch() {
        const box = el('div', 'aic-mode')
        box.setAttribute('role', 'radiogroup')
        box.setAttribute('aria-label', 'Как отправить картинки')
        for (const [value, label, hint] of [[false, 'Фото', 'Сжатой картинкой — быстро, как в мессенджере'], [true, 'Файл', 'Файлом — без сжатия, в исходном качестве']]) {
            const b = el('button', `aic-mode-btn${asFile === value ? ' is-on' : ''}`, label)
            b.type = 'button'
            b.title = hint
            b.setAttribute('role', 'radio')
            b.setAttribute('aria-checked', String(asFile === value))
            b.addEventListener('click', () => {
                asFile = value
                try { localStorage.setItem(AS_FILE_KEY, value ? '1' : '0') } catch {}
                renderTray()
                input.focus()
            })
            box.append(b)
        }
        return box
    }

    function renderTray() {
        tray.replaceChildren()
        tray.hidden = !files.length
        if (files.some(isPicture)) tray.append(modeSwitch())
        for (const f of files) {
            const chip = el('div', `aic-chip${f.thumb ? ' has-thumb' : ''}`)
            chip.title = f.name
            const pic = el('div', 'aic-chip-pic')
            if (f.thumb) { const img = el('img'); img.src = f.thumb; img.alt = ''; pic.append(img) } else pic.innerHTML = ICON_FILE
            const info = el('div', 'aic-chip-info')
            info.append(el('div', 'aic-chip-name', f.name), el('div', 'aic-chip-size', formatSize(f.size)))
            const x = el('button', 'aic-chip-x', '×')
            x.type = 'button'
            x.title = 'Убрать'
            x.setAttribute('aria-label', `Убрать ${f.name}`)
            x.addEventListener('click', () => { files = removeFile(files, f.path); renderTray(); refreshSend() })
            chip.append(pic, info, x)
            tray.append(chip)
        }
    }

    function stage(incoming) {
        files = addFiles(files, incoming)
        renderTray()
        refreshSend()
        input.focus()
    }

    async function saveEdit() {
        const m = editing
        const text = input.value.trim()
        if (!text || text === String(m.text || '').trim()) { endEdit(); return }
        sending = true
        form.classList.add('is-sending')
        const ok = await onEdit(m, text).catch(() => false)
        sending = false
        form.classList.remove('is-sending')
        if (ok && editing === m) endEdit()
        else if (!ok) { form.classList.add('is-failed'); setTimeout(() => form.classList.remove('is-failed'), 1600) }
        input.focus()
    }

    async function submit() {
        if (editing && onEdit) { if (!sending) await saveEdit(); return }
        const text = input.value.trim()
        if ((!text && !files.length) || (sending && sendingFor === chatKey()) || blocked) return
        sending = true
        sendingFor = chatKey()
        form.classList.add('is-sending')
        picker.toggle(false)
        // the field empties at once (the message already shows in the conversation with its clock);
        // if the messenger could not take it, everything comes back to the field
        const sent = { text: input.value, files, reply }
        // the send belongs to the chat it started in: the person may open another chat while it runs
        const owner = chatKey()
        input.value = ''; files = []; renderTray(); autosize(); refreshSend(); showReply(null)
        const ok = await onSend(text, sent.files, sent.reply, asFile && sent.files.some(isPicture)).catch(() => false)
        const here = chatKey() === owner
        if (sendingFor === owner) { sending = false; sendingFor = null }
        if (here) form.classList.remove('is-sending')
        if (ok) onDraftFor(owner, here ? input.value : '')
        else if (!here) onDraftFor(owner, sent.text)
        else {
            // what was typed meanwhile is kept: the text that did not go comes back in front of it
            input.value = input.value.trim() ? `${sent.text}\n${input.value}` : sent.text
            files = [...sent.files, ...files]
            if (sent.reply && !reply) showReply(sent.reply)
            renderTray(); autosize(); refreshSend(); onDraft(input.value)
            form.classList.add('is-failed')
        }
        setTimeout(() => form.classList.remove('is-failed'), 1600)
        // the field takes the keyboard back only if nothing else (the photo viewer, the search) took it meanwhile; the
        // messenger's own tab does not count — the text was typed there, so it holds the focus after every send
        // (Oleg, 2026-11-12: after Enter the cursor left the field and had to be clicked back)
        const active = document.activeElement
        if (here && (!active || active === document.body || active.tagName === 'WEBVIEW' || form.contains(active))) input.focus()
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit() })
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
        if (e.key === 'Escape' && picker.isOpen()) { e.preventDefault(); picker.toggle(false) } else if (e.key === 'Escape' && editing) { e.preventDefault(); endEdit() } else if (e.key === 'Escape' && reply) { e.preventDefault(); showReply(null) }
    })
    // the field's own menu on a right click (3.8.3): cut, copy, paste, select all — Electron gives a page none
    const fieldMenu = el('div', 'aic-menu aic-field-menu')
    fieldMenu.hidden = true
    fieldMenu.setAttribute('role', 'menu')
    root.append(fieldMenu)
    const closeFieldMenu = () => { fieldMenu.hidden = true }
    function fieldItem(label, enabled, run) {
        const b = el('button', 'aic-menu-item', label)
        b.type = 'button'
        b.disabled = !enabled
        b.setAttribute('role', 'menuitem')
        b.addEventListener('mousedown', (e) => e.preventDefault())
        b.addEventListener('click', () => { closeFieldMenu(); input.focus(); run() })
        fieldMenu.append(b)
    }
    input.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const chosen = input.selectionStart !== input.selectionEnd
        fieldMenu.replaceChildren()
        fieldItem('Вырезать', chosen, () => document.execCommand('cut'))
        fieldItem('Копировать', chosen, () => document.execCommand('copy'))
        fieldItem('Вставить', true, () => document.execCommand('paste'))
        fieldItem('Выделить всё', !!input.value, () => input.select())
        fieldMenu.hidden = false
        const box = root.getBoundingClientRect()
        fieldMenu.style.left = `${Math.max(8, Math.min(e.clientX - box.left, box.width - fieldMenu.offsetWidth - 8))}px`
        fieldMenu.style.top = `${Math.max(8, Math.min(e.clientY - box.top - fieldMenu.offsetHeight, box.height - fieldMenu.offsetHeight - 8))}px`
    })
    document.addEventListener('mousedown', (e) => { if (!fieldMenu.hidden && !fieldMenu.contains(e.target)) closeFieldMenu() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFieldMenu() })
    // Esc first closes what is open over the field; the window itself only after (chat-view.js asks this)
    const hasPopup = () => !fieldMenu.hidden || picker.isOpen()

    // the text of a message being edited is not a draft of the chat
    input.addEventListener('input', () => { autosize(); refreshSend(); if (!editing) onDraft(input.value) })
    q('.aic-attach').addEventListener('click', async () => stage(await onPickFiles()))
    emojiBtn.addEventListener('click', () => { emojiBtn.classList.toggle('is-on', picker.toggle()); input.focus() })
    document.addEventListener('mousedown', (e) => {
        if (picker.isOpen() && !picker.el.contains(e.target) && !emojiBtn.contains(e.target)) { picker.toggle(false); emojiBtn.classList.remove('is-on') }
    })

    // a copied file from Explorer, or a picture (a screenshot, a copied image)
    input.addEventListener('paste', async (e) => {
        const dt = e.clipboardData
        const paths = pathsOf(dt && dt.files)
        if (paths.length) { e.preventDefault(); stage(await onDescribeFiles(paths)); return }
        const hasImage = dt && [...dt.items].some((it) => it.kind === 'file' && it.type.startsWith('image/'))
        if (hasImage) {
            e.preventDefault()
            const one = await onPasteImage()
            if (one) stage([one])
        }
    })

    // files dragged from Explorer onto the conversation
    let depth = 0
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    root.addEventListener('dragenter', (e) => { if (!hasFiles(e) || blocked) return; e.preventDefault(); depth++; drop.hidden = false })
    root.addEventListener('dragover', (e) => { if (!hasFiles(e) || blocked) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
    root.addEventListener('dragleave', () => { if (depth > 0 && --depth === 0) drop.hidden = true })
    root.addEventListener('drop', async (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth = 0
        drop.hidden = true
        if (blocked) return
        stage(await onDescribeFiles(pathsOf(e.dataTransfer.files)))
    })

    return {
        el: form,
        // a chat opened again comes back with what was typed and not sent there
        reset(draft = '') {
            editing = null
            beforeEdit = ''
            replying.classList.remove('is-edit')
            input.value = draft
            showReply(null)
            files = []
            renderTray()
            autosize()
            refreshSend()
            picker.toggle(false)
            emojiBtn.classList.remove('is-on')
            // another chat: its field is not «sending» because of the previous one
            form.classList.remove('is-sending')
        },
        hasPopup: () => hasPopup(),
        closePopups() { closeFieldMenu(); picker.toggle(false); emojiBtn.classList.remove('is-on') },
        focus() { input.focus(); input.setSelectionRange(input.value.length, input.value.length) },
        replyTo(m) { if (editing) endEdit(); showReply(m); input.focus() },
        edit(m) { if (onEdit && m && m.text) showEdit(m) },
        // the tab shows another chat: nothing can be sent until the right one is open
        setBlocked(on) {
            blocked = on
            form.classList.toggle('is-blocked', on)
            input.disabled = on
        },
        // channels and closed chats have no message field at all
        setVisible(on) { form.hidden = !on; if (!on) picker.toggle(false) }
    }
}

module.exports = { createComposer }
