'use strict'
// «Все мессенджеры»: the message field of our conversation window — text, emoji and files. Files come from the
// paper clip, from Explorer (dragged onto the window or copied) and from a pasted picture; they wait here as
// previews until «Отправить», then go to the messenger tab with the text as their caption.
const { addFiles, removeFile, formatSize } = require('./attachments')
const { createEmojiPicker } = require('./emoji-picker')

const MAX_INPUT_PX = 160

const ICON_CLIP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>'
const ICON_SMILE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/></svg>'
const ICON_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
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
function createComposer({ root, onSend, onPickFiles, onDescribeFiles, onPasteImage }) {
    const form = el('form', 'aic-compose')
    form.autocomplete = 'off'
    form.innerHTML = `
        <div class="aic-tray" hidden></div>
        <div class="aic-bar">
            <button type="button" class="aic-tool aic-attach" title="Прикрепить файлы" aria-label="Прикрепить файлы">${ICON_CLIP}</button>
            <textarea class="aic-input" rows="1" placeholder="Сообщение"></textarea>
            <button type="button" class="aic-tool aic-emoji" title="Смайлики" aria-label="Смайлики">${ICON_SMILE}</button>
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
    let blocked = false

    const picker = createEmojiPicker({ onPick: insertAtCursor })
    form.append(picker.el)

    function autosize() {
        input.style.height = 'auto'
        input.style.height = Math.min(MAX_INPUT_PX, input.scrollHeight) + 'px'
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

    function renderTray() {
        tray.replaceChildren()
        tray.hidden = !files.length
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

    async function submit() {
        const text = input.value.trim()
        if ((!text && !files.length) || sending || blocked) return
        sending = true
        form.classList.add('is-sending')
        picker.toggle(false)
        const ok = await onSend(text, files).catch(() => false)
        sending = false
        form.classList.remove('is-sending')
        if (ok) { input.value = ''; files = []; renderTray(); autosize(); refreshSend() } else form.classList.add('is-failed')
        setTimeout(() => form.classList.remove('is-failed'), 1600)
        input.focus()
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit() })
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
        if (e.key === 'Escape' && picker.isOpen()) { e.preventDefault(); picker.toggle(false) }
    })
    input.addEventListener('input', () => { autosize(); refreshSend() })
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
        reset() {
            input.value = ''
            files = []
            renderTray()
            autosize()
            refreshSend()
            picker.toggle(false)
            emojiBtn.classList.remove('is-on')
        },
        focus() { input.focus() },
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
