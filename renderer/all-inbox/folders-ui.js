// Own folders in the «Все мессенджеры» list (3.8.3): chips after the filters by kind, «+» makes a folder, a right click on
// a folder renames or deletes it, a right click on a chat puts it into a folder or takes it out. Kept in the app's
// settings (store root allInbox, key folders), so they survive a restart. The logic lives in folders.js.
const F = require('./folders')
const { dressButton, setCount } = require('./folder-rail')

// the folders live inside the store root «allInbox» (beside «enabled», access.js); the renderer's store reads whole roots
const STORE_ROOT = 'allInbox'
const FOLDER_PREFIX = 'folder:'

const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
const ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
const ICON_FOLDER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>'

/**
 * @param {{ panel: HTMLElement, store: { get: Function, set: Function }, isOn: (id: string) => boolean,
 *   onSelect: (filter: string) => void, onChange: () => void }} deps
 */
function createFolderBar({ panel, store, isOn, onSelect, onChange }) {
    const strip = panel.querySelector('.ai-filters')
    const root = () => { const saved = store.get(STORE_ROOT, null); return saved && typeof saved === 'object' ? saved : {} }
    let folders = F.cleanFolders(root().folders)
    const save = (next) => { folders = next; store.set(STORE_ROOT, { ...root(), folders }); render(); onChange() }

    const el = (tag, className, text) => {
        const n = document.createElement(tag)
        if (className) n.className = className
        if (text != null) n.textContent = text
        return n
    }

    // ── a small menu at the mouse ─────────────────────────────────────────────
    const menu = el('div', 'ai-fmenu')
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    const closeMenu = () => { menu.hidden = true }
    document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu() })
    function openMenu(x, y, items) {
        menu.replaceChildren()
        for (const it of items) {
            if (it === '-') { menu.append(el('div', 'ai-fmenu-sep')); continue }
            const b = el('button', `ai-fmenu-item${it.danger ? ' is-danger' : ''}`)
            b.type = 'button'
            b.setAttribute('role', 'menuitem')
            const mark = el('span', 'ai-fmenu-mark')
            mark.innerHTML = it.checked ? ICON_CHECK : (it.icon || '')
            b.append(mark, el('span', '', it.label))
            b.addEventListener('click', () => { closeMenu(); it.run() })
            menu.append(b)
        }
        menu.hidden = false
        menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 8)}px`
        menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 8)}px`
    }

    // ── a name typed right in the strip (Electron has no prompt()) ────────────
    function askName(anchor, initial, done) {
        const input = el('input', 'ai-folder-input')
        input.type = 'text'
        input.maxLength = F.MAX_NAME
        input.placeholder = 'Название папки'
        input.value = initial || ''
        anchor.replaceWith(input)
        input.focus()
        input.select()
        let finished = false
        const finish = (ok) => {
            if (finished) return
            finished = true
            const name = input.value.trim()
            if (ok && name) done(name)
            else render()
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true) }
            if (e.key === 'Escape') { e.preventDefault(); finish(false) }
        })
        input.addEventListener('blur', () => finish(true))
    }

    function render() {
        strip.querySelectorAll('.ai-folder, .ai-folder-add, .ai-folder-input').forEach((n) => n.remove())
        for (const f of folders) {
            const b = el('button', `ai-folder${isOn(FOLDER_PREFIX + f.id) ? ' is-on' : ''}`, f.name)
            b.type = 'button'
            b.dataset.aiFolder = f.id
            b.title = `${f.name}: чатов — ${f.chats.length}. Правая кнопка — переименовать или удалить`
            dressButton(b, 'folder')
            b.title = `${f.name}: чатов — ${f.chats.length}. Правая кнопка — переименовать или удалить`
            b.addEventListener('click', () => onSelect(FOLDER_PREFIX + f.id))
            b.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                    { label: 'Переименовать', run: () => askName(b, f.name, (name) => save(F.renameFolder(folders, f.id, name))) },
                    { label: 'Удалить папку', danger: true, run: () => {
                        save(F.deleteFolder(folders, f.id))
                        if (isOn(FOLDER_PREFIX + f.id)) onSelect('all')
                    } }
                ])
            })
            strip.append(b)
        }
        if (folders.length < F.MAX_FOLDERS) {
            const add = el('button', 'ai-folder-add')
            add.type = 'button'
            add.title = 'Новая папка'
            add.setAttribute('aria-label', 'Новая папка')
            add.textContent = 'Папка'
            dressButton(add, 'plus')
            add.title = 'Новая папка'
            add.addEventListener('click', () => askName(add, '', (name) => save(F.addFolder(folders, name))))
            strip.append(add)
        }
    }

    // a right click on a chat in the list: into a folder, out of it, or a new folder with it
    function chatMenu(e, chatId) {
        e.preventDefault()
        const items = folders.map((f) => {
            const inside = f.chats.includes(chatId)
            return { label: f.name, checked: inside, icon: ICON_FOLDER, run: () => save(inside ? F.removeChat(folders, f.id, chatId) : F.addChat(folders, f.id, chatId)) }
        })
        if (items.length) items.push('-')
        items.push({ label: 'Новая папка с этим чатом', icon: ICON_PLUS, run: () => {
            const add = strip.querySelector('.ai-folder-add')
            if (!add) return
            add.scrollIntoView({ inline: 'nearest', block: 'nearest' })
            askName(add, '', (name) => {
                const next = F.addFolder(folders, name)
                const made = next[next.length - 1]
                save(made && next.length > folders.length ? F.addChat(next, made.id, chatId) : next)
            })
        } })
        openMenu(e.clientX, e.clientY, items)
    }

    render()

    return {
        render,
        // unread chats of each folder, drawn on its button
        setCounts(countOf) {
            for (const f of folders) setCount(strip.querySelector(`.ai-folder[data-ai-folder="${f.id}"]`), countOf(new Set(f.chats)))
        },
        chatMenu,
        /** the chats of a folder filter, or null when the filter is not a folder (or the folder is gone) */
        chatsOf(filter) {
            if (!String(filter).startsWith(FOLDER_PREFIX)) return null
            const f = folders.find((x) => x.id === String(filter).slice(FOLDER_PREFIX.length))
            return f ? new Set(f.chats) : null
        },
        exists: (filter) => String(filter).startsWith(FOLDER_PREFIX) && folders.some((f) => FOLDER_PREFIX + f.id === filter)
    }
}

module.exports = { createFolderBar, FOLDER_PREFIX }
