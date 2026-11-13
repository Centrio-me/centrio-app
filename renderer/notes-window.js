'use strict'
// Notes in the middle of the screen, like the tasks (2026-11-11, from the team's wishes): a window with the person's
// folders on the left and the notes beside them. The notes panel itself (renderer/notes-bind.js) is moved into the
// window the first time it opens: the list and the editor stand side by side. Folders live on the server with the notes.

const ICON_FOLDER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
const ICON_ALL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
const ICON_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'

function el(tag, cls, html) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (html) node.innerHTML = html
    return node
}

/**
 * @param {{ tGet: Function, authorizedInvoke: Function, getNotesApi: () => any }} deps
 */
function createNotesWindow({ tGet, authorizedInvoke, getNotesApi }) {
    const say = (key, fallback) => tGet(`notes.${key}`) || fallback
    const overlay = el('div', 'notes-window')
    overlay.hidden = true
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    const dialog = el('div', 'notes-window-dialog')
    const side = el('aside', 'notes-folders')
    const sideTitle = el('div', 'notes-folders-title')
    sideTitle.textContent = say('folders', 'Папки')
    const list = el('div', 'notes-folders-list')
    const addForm = el('form', 'notes-folder-add')
    const addInput = el('input')
    addInput.type = 'text'
    addInput.maxLength = 60
    addInput.placeholder = say('newFolder', 'Новая папка')
    const addBtn = el('button', 'notes-folder-add-btn', ICON_PLUS)
    addBtn.type = 'submit'
    addBtn.title = say('addFolder', 'Создать папку')
    addForm.append(addInput, addBtn)
    side.append(sideTitle, list, addForm)
    const main = el('div', 'notes-window-main')
    const close = el('button', 'notes-window-close', ICON_CLOSE)
    close.type = 'button'
    close.title = say('close', 'Закрыть')
    dialog.append(side, main, close)
    overlay.append(dialog)
    document.body.append(overlay)

    let folders = []
    let current = 'all'
    let notes = []

    const counts = () => {
        const c = { all: notes.length }
        for (const n of notes) if (n.folderId) c[n.folderId] = (c[n.folderId] || 0) + 1
        return c
    }

    function render() {
        const c = counts()
        list.replaceChildren()
        const row = (id, name, icon, count) => {
            const item = el('div', `notes-folder${current === id ? ' is-on' : ''}`)
            item.dataset.id = id
            item.tabIndex = 0
            item.setAttribute('role', 'button')
            const ic = el('span', 'notes-folder-icon', icon)
            const label = el('span', 'notes-folder-name')
            label.textContent = name
            const n = el('span', 'notes-folder-count')
            n.textContent = count ? String(count) : ''
            item.append(ic, label, n)
            if (id !== 'all') {
                const del = el('button', 'notes-folder-del', ICON_TRASH)
                del.type = 'button'
                del.title = say('deleteFolder', 'Удалить папку (заметки останутся)')
                del.addEventListener('click', (e) => { e.stopPropagation(); askDelete(item, id, name) })
                item.append(del)
                // a double click renames the folder in place
                label.addEventListener('dblclick', (e) => { e.stopPropagation(); rename(label, id, name) })
            }
            item.addEventListener('click', () => choose(id))
            item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(id) } })
            // a note dragged from the list is put into this folder
            item.addEventListener('dragover', (e) => {
                if (![...(e.dataTransfer?.types || [])].includes('text/x-centrio-note')) return
                e.preventDefault()
                item.classList.add('is-drop')
            })
            item.addEventListener('dragleave', () => item.classList.remove('is-drop'))
            item.addEventListener('drop', (e) => {
                item.classList.remove('is-drop')
                const noteId = e.dataTransfer?.getData('text/x-centrio-note')
                if (!noteId) return
                e.preventDefault()
                getNotesApi()?.moveToFolder(noteId, id === 'all' ? null : id)
            })
            list.append(item)
        }
        row('all', say('allNotes', 'Все заметки'), ICON_ALL, c.all)
        for (const f of folders) row(f.id, f.name, ICON_FOLDER, c[f.id] || 0)
    }

    function choose(id) {
        current = id
        getNotesApi()?.setFolderFilter(id)
        render()
    }

    function rename(label, id, name) {
        const input = el('input', 'notes-folder-rename')
        input.value = name
        input.maxLength = 60
        label.replaceWith(input)
        input.focus()
        input.select()
        let done = false
        const finish = async (save) => {
            if (done) return
            done = true
            const next = input.value.trim()
            if (save && next && next !== name) {
                const r = await authorizedInvoke('api-notes-folder-update', id, { name: next }).catch(() => null)
                if (r?.success && r.data?.folder) folders = folders.map(f => f.id === id ? r.data.folder : f)
                getNotesApi()?.setFolders(folders)
            }
            render()
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true) }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
        })
        input.addEventListener('blur', () => finish(true))
    }

    // deleting asks once, right in the row: the notes of the folder stay, without a folder
    function askDelete(item, id, name) {
        const sure = el('div', 'notes-folder-confirm')
        const text = el('span')
        text.textContent = `${say('deleteFolderQ', 'Удалить папку')} «${name}»?`
        const yes = el('button', 'notes-folder-yes')
        yes.type = 'button'
        yes.textContent = say('delete', 'Удалить')
        const no = el('button', 'notes-folder-no')
        no.type = 'button'
        no.textContent = say('cancel', 'Отмена')
        sure.append(text, yes, no)
        item.replaceWith(sure)
        no.addEventListener('click', render)
        yes.addEventListener('click', async () => {
            const r = await authorizedInvoke('api-notes-folder-delete', id).catch(() => null)
            if (r?.success) {
                folders = folders.filter(f => f.id !== id)
                if (current === id) current = 'all'
                getNotesApi()?.setFolders(folders)
                getNotesApi()?.setFolderFilter(current)
                await getNotesApi()?.reload()
            }
            render()
        })
    }

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const name = addInput.value.trim()
        if (!name) return
        addBtn.disabled = true
        const r = await authorizedInvoke('api-notes-folder-create', name).catch(() => null)
        addBtn.disabled = false
        if (r?.success && r.data?.folder) {
            folders = [...folders, r.data.folder]
            addInput.value = ''
            getNotesApi()?.setFolders(folders)
            choose(r.data.folder.id)
        }
    })

    async function loadFolders() {
        const r = await authorizedInvoke('api-notes-folders').catch(() => null)
        if (r?.success && Array.isArray(r.data?.folders)) folders = r.data.folders
        getNotesApi()?.setFolders(folders)
        render()
    }

    // docked: a column at the right of the content area, beside the «Все мессенджеры» chat, which narrows to make room
    let dockWatch = null
    function placeDock() {
        const area = document.getElementById('contentArea')
        if (!area) return
        const r = area.getBoundingClientRect()
        const w = Math.round(Math.max(420, Math.min(760, r.width * 0.46)))
        overlay.style.setProperty('--dock-top', `${r.top}px`)
        overlay.style.setProperty('--dock-left', `${r.right - w}px`)
        overlay.style.setProperty('--dock-h', `${r.height}px`)
        overlay.style.setProperty('--dock-w', `${w}px`)
        document.body.style.setProperty('--notes-dock-w', `${w + 8}px`)
    }
    function undock() {
        overlay.classList.remove('is-docked')
        document.body.classList.remove('notes-docked')
        dockWatch?.disconnect(); dockWatch = null
    }
    function open({ docked = false } = {}) {
        const panel = document.getElementById('notesPanel')
        if (panel && panel.parentElement !== main) main.append(panel)
        panel?.classList.add('active')
        overlay.hidden = false
        document.body.classList.add('notes-window-open')
        if (docked) {
            overlay.classList.add('is-docked')
            document.body.classList.add('notes-docked')
            placeDock()
            dockWatch?.disconnect()
            dockWatch = new ResizeObserver(placeDock)
            const area = document.getElementById('contentArea')
            if (area) dockWatch.observe(area)
            // the chat closed: the notes beside it close with it
            const bodyWatch = new MutationObserver(() => { if (!document.body.classList.contains('all-inbox-chat-open')) { bodyWatch.disconnect(); hide() } })
            bodyWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] })
        } else undock()
        loadFolders()
    }

    function hide() {
        undock()
        overlay.hidden = true
        document.body.classList.remove('notes-window-open')
        document.getElementById('notesPanel')?.classList.remove('active')
    }

    close.addEventListener('click', hide)
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !overlay.classList.contains('is-docked')) hide() })
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || overlay.hidden) return
        if (document.querySelector('.notes-image-viewer:not([hidden])')) return
        hide()
    })

    return {
        open,
        close: hide,
        isOpen: () => !overlay.hidden,
        // the list of notes changed: the counts next to the folders follow
        notesChanged(list) { notes = Array.isArray(list) ? list : []; if (!overlay.hidden) render() }
    }
}

module.exports = { createNotesWindow }
