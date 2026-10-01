// Быстрые ответы (2026-09-30) — right-sidebar panel, available on every plan.
// Click a reply → its text goes to the clipboard, ready to paste into any
// chat or email. Two sources:
//   • personal replies — store key 'quickReplies', synced across devices via
//     settings.extra (see getSyncPayload in renderer.js); main.js re-validates
//     every write (sanitizeQuickRepliesForStore).
//   • team replies — read-only, set by the org owner/admin on centrio.me/team,
//     pushed in by renderer/org-team.js via setTeamReplies().
// Everything is plain text: rendered with textContent only, never innerHTML.
const MAX_REPLIES = 100
const TITLE_MAX = 80
const TEXT_MAX = 2000
const COPIED_FEEDBACK_MS = 1400

function sanitize(value, max) {
    return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, max)
}

function bindQuickRepliesUi({ store, tGet, invokeIpc, openRightPanel, closeRightPanel, getUserIsPro, requirePro }) {
    const btn         = document.getElementById('quickRepliesBtn')
    const panel       = document.getElementById('quickRepliesPanel')
    const list        = document.getElementById('quickRepliesList')
    const searchInput = document.getElementById('quickRepliesSearch')
    const addBtn      = document.getElementById('quickRepliesAddBtn')
    const editor      = document.getElementById('quickRepliesEditor')
    const titleInput  = document.getElementById('quickRepliesTitleInput')
    const textInput   = document.getElementById('quickRepliesTextInput')
    const counter     = document.getElementById('quickRepliesCounter')
    const saveBtn     = document.getElementById('quickRepliesSaveBtn')
    const cancelBtn   = document.getElementById('quickRepliesCancelBtn')
    const hint        = document.getElementById('quickRepliesHint')
    if (!btn || !panel || !list) return { setTeamReplies() {}, closePanel() {} }

    let teamReplies = []
    let editingId = null
    let query = ''

    const t = (key, fallback) => tGet(`quickReplies.${key}`) || fallback

    function getOwn() {
        const raw = store.get('quickReplies', [])
        return Array.isArray(raw) ? raw.filter(r => r && r.id && r.title && r.text) : []
    }

    function saveOwn(replies) {
        store.set('quickReplies', replies.slice(0, MAX_REPLIES))
    }

    function matches(reply) {
        if (!query) return true
        const q = query.toLowerCase()
        return reply.title.toLowerCase().includes(q) || reply.text.toLowerCase().includes(q)
    }

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }

    function iconButton(action, title, pathD) {
        const b = el('button', `qr-item-action qr-item-${action}`)
        b.type = 'button'
        b.dataset.action = action
        b.title = title
        b.setAttribute('aria-label', title)
        b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${pathD}</svg>`
        return b
    }

    function renderItem(reply, { own }) {
        const item = el('div', 'qr-item')
        item.dataset.id = reply.id
        item.dataset.source = own ? 'own' : 'team'
        item.tabIndex = 0
        item.setAttribute('role', 'button')
        item.title = t('clickToCopy', 'Нажмите, чтобы скопировать')

        // Личные ответы можно менять местами перетаскиванием (или Alt+↑/↓).
        // Пока идёт поиск, список отфильтрован — порядок не трогаем.
        if (own && !query) {
            item.draggable = true
            const handle = el('span', 'qr-item-handle')
            handle.title = t('dragToReorder', 'Перетащите, чтобы изменить порядок')
            handle.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.2"/><circle cx="7.5" cy="2.5" r="1.2"/><circle cx="2.5" cy="7" r="1.2"/><circle cx="7.5" cy="7" r="1.2"/><circle cx="2.5" cy="11.5" r="1.2"/><circle cx="7.5" cy="11.5" r="1.2"/></svg>'
            item.appendChild(handle)
        }

        const body = el('div', 'qr-item-body')
        body.appendChild(el('div', 'qr-item-title', reply.title))
        body.appendChild(el('div', 'qr-item-text', reply.text))
        item.appendChild(body)

        const copied = el('span', 'qr-item-copied', t('copied', 'Скопировано'))
        item.appendChild(copied)

        if (own) {
            const actions = el('div', 'qr-item-actions')
            actions.appendChild(iconButton('edit', t('edit', 'Изменить'), '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'))
            actions.appendChild(iconButton('delete', t('delete', 'Удалить'), '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'))
            item.appendChild(actions)
        }
        return item
    }

    function renderSection(titleText, replies, opts) {
        const section = el('div', 'qr-section')
        const header = el('div', 'qr-section-title', titleText)
        if (!opts.own) {
            const badge = el('span', 'qr-section-badge', t('teamBadge', 'от руководителя'))
            header.appendChild(badge)
        }
        section.appendChild(header)
        replies.forEach(r => section.appendChild(renderItem(r, opts)))
        return section
    }

    function render() {
        list.replaceChildren()
        const own = getOwn().filter(matches)
        const team = teamReplies.filter(matches)

        if (team.length > 0) list.appendChild(renderSection(t('teamSection', 'Команда'), team, { own: false }))
        if (own.length > 0) list.appendChild(renderSection(t('ownSection', 'Мои ответы'), own, { own: true }))

        const editorOpen = editor && editor.style.display !== 'none'
        if (own.length === 0 && team.length === 0 && !editorOpen) {
            const empty = el('div', 'app-notif-empty qr-empty')
            empty.textContent = query
                ? t('nothingFound', 'Ничего не найдено')
                : t('empty', 'Сохраните тексты, которые часто пишете клиентам: адрес, часы работы, цены. Потом — один клик, и текст скопирован.')
            list.appendChild(empty)
            if (!query) {
                const cta = el('button', 'qr-empty-cta', t('addFirst', 'Добавить первый ответ'))
                cta.type = 'button'
                cta.addEventListener('click', (e) => { e.stopPropagation(); openEditor(null) })
                list.appendChild(cta)
            }
        }
        if (addBtn) addBtn.disabled = getOwn().length >= MAX_REPLIES
        if (hint) {
            const isMac = /Mac/i.test(navigator.platform || '')
            hint.textContent = t('hint', 'Нажмите на ответ — он скопируется. Вставьте в чат: {keys}').replace('{keys}', isMac ? '⌘V' : 'Ctrl+V')
        }
    }

    async function copyReply(item) {
        const source = item.dataset.source === 'team' ? teamReplies : getOwn()
        const reply = source.find(r => r.id === item.dataset.id)
        if (!reply) return
        let ok = false
        try {
            const res = await invokeIpc('copy-text-to-clipboard', reply.text)
            ok = !!res?.success
        } catch {}
        if (!ok) {
            try { await navigator.clipboard.writeText(reply.text); ok = true } catch {}
        }
        if (!ok) return
        item.classList.add('copied')
        setTimeout(() => item.classList.remove('copied'), COPIED_FEEDBACK_MS)
    }

    function updateCounter() {
        if (!counter || !textInput) return
        const n = textInput.value.length
        counter.textContent = `${n} / ${TEXT_MAX}`
        counter.classList.toggle('at-limit', n >= TEXT_MAX)
        if (saveBtn) saveBtn.disabled = !titleInput.value.trim() || !textInput.value.trim()
    }

    function openEditor(reply) {
        editingId = reply ? reply.id : null
        titleInput.value = reply ? reply.title : ''
        textInput.value = reply ? reply.text : ''
        editor.style.display = ''
        updateCounter()
        render()
        requestAnimationFrame(() => (reply ? textInput : titleInput).focus())
    }

    function closeEditor() {
        editingId = null
        editor.style.display = 'none'
        titleInput.value = ''
        textInput.value = ''
        render()
    }

    function saveEditor() {
        const title = sanitize(titleInput.value, TITLE_MAX)
        const text = sanitize(textInput.value, TEXT_MAX)
        if (!title || !text) return
        const replies = getOwn()
        if (editingId) {
            const idx = replies.findIndex(r => r.id === editingId)
            if (idx !== -1) replies[idx] = { ...replies[idx], title, text, updatedAt: Date.now() }
        } else {
            if (replies.length >= MAX_REPLIES) return
            replies.unshift({ id: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, text, updatedAt: Date.now() })
        }
        saveOwn(replies)
        closeEditor()
        render()
    }

    async function deleteReply(id) {
        const reply = getOwn().find(r => r.id === id)
        if (!reply) return
        const ok = await window.showConfirmModal({
            title: t('deleteTitle', 'Удалить быстрый ответ?'),
            message: (t('deleteText', 'Ответ «{title}» будет удалён.')).replace('{title}', reply.title),
            confirmText: t('delete', 'Удалить'),
            cancelText: t('cancel', 'Отмена'),
            danger: true
        })
        if (!ok) return
        saveOwn(getOwn().filter(r => r.id !== id))
        if (editingId === id) closeEditor()
        render()
    }

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.qr-item')
        if (!item) return
        e.stopPropagation()
        const action = e.target.closest('[data-action]')?.dataset.action
        if (action === 'edit') { openEditor(getOwn().find(r => r.id === item.dataset.id)); return }
        if (action === 'delete') { deleteReply(item.dataset.id); return }
        copyReply(item)
    })

    list.addEventListener('keydown', (e) => {
        // Alt+↑ / Alt+↓ — сдвинуть личный ответ на одну позицию.
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            const own = e.target.closest?.('.qr-item[data-source="own"]')
            if (!own || own !== e.target || query) return
            e.preventDefault()
            const replies = getOwn()
            const i = replies.findIndex(r => r.id === own.dataset.id)
            const j = e.key === 'ArrowUp' ? i - 1 : i + 1
            if (i === -1 || j < 0 || j >= replies.length) return
            ;[replies[i], replies[j]] = [replies[j], replies[i]]
            saveOwn(replies)
            render()
            list.querySelector('.qr-item[data-id="' + CSS.escape(own.dataset.id) + '"]')?.focus()
            return
        }
        if (e.key !== 'Enter' && e.key !== ' ') return
        const item = e.target.closest('.qr-item')
        if (!item || e.target !== item) return
        e.preventDefault()
        copyReply(item)
    })

    function moveReply(srcId, targetId, after) {
        const replies = getOwn()
        const from = replies.findIndex(r => r.id === srcId)
        if (from === -1) return
        const [moved] = replies.splice(from, 1)
        const to = replies.findIndex(r => r.id === targetId)
        if (to === -1) return
        replies.splice(after ? to + 1 : to, 0, moved)
        saveOwn(replies)
        render()
    }

    let dragId = null
    const OWN_ITEM = '.qr-item[data-source="own"]'

    function clearDropMarks() {
        list.querySelectorAll('.qr-drop-before, .qr-drop-after, .qr-dragging')
            .forEach(n => n.classList.remove('qr-drop-before', 'qr-drop-after', 'qr-dragging'))
    }

    function dropPosition(e, item) {
        const rect = item.getBoundingClientRect()
        return e.clientY > rect.top + rect.height / 2
    }

    list.addEventListener('dragstart', (e) => {
        const item = e.target.closest?.(OWN_ITEM)
        if (!item || query) { e.preventDefault(); return }
        dragId = item.dataset.id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', dragId)
        setTimeout(() => item.classList.add('qr-dragging'), 0)
    })

    list.addEventListener('dragover', (e) => {
        if (!dragId) return
        const item = e.target.closest?.(OWN_ITEM)
        if (!item || item.dataset.id === dragId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const after = dropPosition(e, item)
        list.querySelectorAll('.qr-drop-before, .qr-drop-after')
            .forEach(n => n.classList.remove('qr-drop-before', 'qr-drop-after'))
        item.classList.add(after ? 'qr-drop-after' : 'qr-drop-before')
    })

    list.addEventListener('drop', (e) => {
        if (!dragId) return
        const item = e.target.closest?.(OWN_ITEM)
        if (!item || item.dataset.id === dragId) return
        e.preventDefault()
        const srcId = dragId
        dragId = null
        clearDropMarks()
        moveReply(srcId, item.dataset.id, dropPosition(e, item))
    })

    list.addEventListener('dragend', () => {
        dragId = null
        clearDropMarks()
    })

    searchInput?.addEventListener('input', () => {
        query = searchInput.value.trim()
        render()
    })
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const first = list.querySelector('.qr-item')
        if (first) copyReply(first)
    })

    addBtn?.addEventListener('click', (e) => { e.stopPropagation(); openEditor(null) })
    saveBtn?.addEventListener('click', (e) => { e.stopPropagation(); saveEditor() })
    cancelBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeEditor() })
    titleInput?.addEventListener('input', updateCounter)
    textInput?.addEventListener('input', updateCounter)
    editor?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeEditor() }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor() }
    })

    // Pro feature (team members get Pro through their org seat). The icon
    // stays visible for everyone; without Pro a click shows the upsell.
    function hasAccess() {
        return typeof getUserIsPro === 'function' ? getUserIsPro() : true
    }

    function updateButtonState() {
        btn.classList.toggle('pro-locked', !hasAccess())
        if (!hasAccess() && panel.classList.contains('active')) closeRightPanel?.()
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!hasAccess()) {
            requirePro?.('quickReplies')
            return
        }
        render()
        openRightPanel?.()
        requestAnimationFrame(() => searchInput?.focus())
    })

    panel.addEventListener('click', (e) => e.stopPropagation())

    function setTeamReplies(replies) {
        teamReplies = Array.isArray(replies)
            ? replies
                .filter(r => r && typeof r.id === 'string')
                .slice(0, MAX_REPLIES)
                .map(r => ({ id: `team-${r.id}`, title: sanitize(r.title, TITLE_MAX), text: sanitize(r.text, TEXT_MAX) }))
                .filter(r => r.title && r.text)
            : []
        if (panel.classList.contains('active')) render()
    }

    updateButtonState()

    return { setTeamReplies, closePanel: () => closeRightPanel?.(), render, updateButtonState }
}

module.exports = { bindQuickRepliesUi, sanitizeQuickReplyText: sanitize }
