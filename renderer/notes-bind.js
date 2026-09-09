// Плагин "Заметки" — Pro/Team, включается в Настройки → Расширения (см.
// renderer/extensions-ui.js NATIVE_EXTENSIONS 'notes', main.js
// NATIVE_EXTENSION_IDS). В отличие от todos-bind.js (чисто локальное
// хранилище) это полноценный CRUD с сервером — landing/notes-route.js,
// смонтирован на /api/notes отдельно от общего блока синхронизации
// настроек (тот "перезаписывает всё целиком", для растущего списка
// отдельно редактируемых заметок не подходит).
//
// Два вида заметок в одной модели: обычная заметка (поле body) и
// чек-лист/список покупок (поле items — [{id, text, done}]). Открытие и
// закрытие панели — общий контроллер openRightPanel/closeRightPanel (как у
// Ассистента/Задач/Уведомлений), этот модуль отвечает за содержимое.

function bindNotesUi({ store, tGet, authorizedInvoke, openRightPanel, closeRightPanel, getUserIsPro, requirePro }) {
    const btn = document.getElementById('notesBtn')
    const panel = document.getElementById('notesPanel')
    const listView = document.getElementById('notesListView')
    const editView = document.getElementById('notesEditView')
    const listEl = document.getElementById('notesList')
    const addNoteBtn = document.getElementById('notesAddNoteBtn')
    const addChecklistBtn = document.getElementById('notesAddChecklistBtn')
    const backBtn = document.getElementById('notesBackBtn')
    const titleInput = document.getElementById('notesEditTitle')
    const pinBtn = document.getElementById('notesPinBtn')
    const deleteBtn = document.getElementById('notesDeleteBtn')
    const bodyTextarea = document.getElementById('notesEditBody')
    const checklistWrap = document.getElementById('notesEditChecklist')
    const checklistItemsEl = document.getElementById('notesChecklistItems')
    const addItemForm = document.getElementById('notesAddItemForm')
    const addItemInput = document.getElementById('notesAddItemInput')
    const saveIndicator = document.getElementById('notesSaveIndicator')
    const searchInput = document.getElementById('notesSearchInput')
    const duplicateBtn = document.getElementById('notesDuplicateBtn')
    const colorRow = document.getElementById('notesColorRow')
    const editDateEl = document.getElementById('notesEditDate')
    const charCountEl = document.getElementById('notesCharCount')
    const archiveToggleBtn = document.getElementById('notesArchiveToggleBtn')
    const archiveBtn = document.getElementById('notesArchiveBtn')
    const saveBtn = document.getElementById('notesSaveBtn')
    const ctxMenu = document.getElementById('notesContextMenu')
    const ctxOpen = document.getElementById('ctxNoteOpen')
    const ctxPin = document.getElementById('ctxNotePin')
    const ctxPinLabel = document.getElementById('ctxNotePinLabel')
    const ctxDuplicate = document.getElementById('ctxNoteDuplicate')
    const ctxArchive = document.getElementById('ctxNoteArchive')
    const ctxArchiveLabel = document.getElementById('ctxNoteArchiveLabel')
    const ctxDelete = document.getElementById('ctxNoteDelete')

    if (!btn || !panel || !listEl) return

    let notes = []
    let loading = false
    let activeNote = null // текущая открытая заметка (полный объект с сервера)
    let saveTimer = null
    let pendingSave = null // функция отложенного сохранения — дёргаем сразу по кнопке "Сохранить"
    let searchQuery = ''
    let viewingArchived = false
    let dragId = null // id перетаскиваемой карточки — drag&drop сортировка списка
    let contextNoteId = null // заметка, на которую было выполнено правое нажатие

    function escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str ?? ''
        return div.innerHTML
    }

    function isEnabled() {
        const state = store.get('extensionsState', {}) || {}
        return state.notes === true
    }

    // Показываем кнопку только если плагин включён в Настройках И план это
    // позволяет — то же самое приложение проверяет заново (не доверяя
    // локальному store) на каждый реальный запрос к серверу через 403
    // pro_required, см. handleAuthError ниже.
    function updateButtonVisibility() {
        const visible = isEnabled() && (typeof getUserIsPro === 'function' ? getUserIsPro() : true)
        // BUGFIX (2026-09-09, "иконка медиа прыгает с места на место") —
        // visibility:hidden instead of display:none keeps this button's slot
        // reserved in the shared .activity-top flex column, so mediaPlayerBtn
        // (rendered right after it in index.html) doesn't shift position
        // every time Notes gets enabled/disabled or re-checked for Pro.
        btn.style.visibility = visible ? '' : 'hidden'
        if (!visible && panel.classList.contains('active')) closeRightPanel?.()
    }

    function previewText(note) {
        if (note.type === 'CHECKLIST') {
            const items = Array.isArray(note.items) ? note.items : []
            const done = items.filter(i => i.done).length
            return items.length ? `${done}/${items.length} · ${tGet('notes.newChecklist') || 'Список покупок'}` : (tGet('notes.newChecklist') || 'Список покупок')
        }
        return (note.body || '').slice(0, 80) || ''
    }

    // Сегодня — только время; в этом году — день+месяц; иначе + год. Тот же
    // принцип относительного форматирования, что и у экрана блокировки
    // (renderer/lock.js formatRelativeTime), но с абсолютной датой — заметкам
    // важнее точный день, чем "N часов назад".
    function formatNoteDate(dateStr) {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        if (Number.isNaN(d.getTime())) return ''
        const now = new Date()
        const sameDay = d.toDateString() === now.toDateString()
        if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        const opts = { day: 'numeric', month: 'short' }
        if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
        return d.toLocaleDateString(undefined, opts)
    }

    function matchesSearch(note, query) {
        if (!query) return true
        const q = query.toLowerCase()
        if ((note.title || '').toLowerCase().includes(q)) return true
        if (note.type === 'CHECKLIST') {
            return (note.items || []).some(i => (i.text || '').toLowerCase().includes(q))
        }
        return (note.body || '').toLowerCase().includes(q)
    }

    // Drag&drop сортировка доступна только в обычном (неархивном) списке без
    // активного поиска — только там порядок элементов `notes` 1:1 совпадает
    // с тем, что видит пользователь, и пересчёт position после переноса
    // однозначен. В архиве/при поиске карточки просто не draggable.
    function canReorder() {
        return !viewingArchived && !searchQuery
    }

    function renderList() {
        const visible = notes.filter(n => matchesSearch(n, searchQuery))
        if (!visible.length) {
            const msg = searchQuery
                ? (tGet('notes.searchEmpty') || 'Ничего не найдено')
                : viewingArchived
                    ? (tGet('notes.archiveEmpty') || 'В архиве пока пусто')
                    : escapeHtml(tGet('notes.emptyTitle') || 'Заметок пока нет')
            listEl.innerHTML = `<div class="app-notif-empty">
                <div>${escapeHtml(msg)}</div>
                ${(!searchQuery && !viewingArchived) ? `<div style="opacity:.6;font-size:12px;margin-top:6px;">${escapeHtml(tGet('notes.emptyHint') || '')}</div>` : ''}
            </div>`
            return
        }
        const draggable = canReorder()
        listEl.innerHTML = visible.map(n => `
            <div class="note-card ${n.pinned ? 'pinned' : ''}" data-id="${escapeHtml(n.id)}" data-color="${escapeHtml(n.color || '')}" ${draggable ? 'draggable="true"' : ''}>
                <div class="note-card-icon">
                    ${n.type === 'CHECKLIST'
                        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
                        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'}
                </div>
                <div class="note-card-body">
                    <div class="note-card-title">${escapeHtml(n.title) || `<span style="opacity:.5">${escapeHtml(tGet('notes.titlePlaceholder') || 'Без названия')}</span>`}</div>
                    <div class="note-card-preview">${escapeHtml(previewText(n))}</div>
                    <div class="note-card-date">${escapeHtml(formatNoteDate(n.updatedAt || n.createdAt))}</div>
                </div>
                ${n.pinned ? '<svg class="note-card-pin" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 5.5L19 9l-5 3.5.5 5.5-2.5-3-2.5 3 .5-5.5L5 9l5.5-1.5z"/></svg>' : ''}
            </div>
        `).join('')
    }

    function showList() {
        activeNote = null
        listView.style.display = ''
        editView.style.display = 'none'
        searchQuery = ''
        if (searchInput) searchInput.value = ''
        renderList()
    }

    function renderChecklistItems() {
        const items = Array.isArray(activeNote?.items) ? activeNote.items : []
        if (!items.length) {
            checklistItemsEl.innerHTML = ''
            return
        }
        checklistItemsEl.innerHTML = items.map(it => `
            <div class="note-checklist-item ${it.done ? 'done' : ''}" data-id="${escapeHtml(it.id)}">
                <div class="note-checklist-check" data-action="toggle">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span class="note-checklist-text">${escapeHtml(it.text)}</span>
                <button class="note-checklist-delete" data-action="delete">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `).join('')
    }

    function updateCharCount() {
        if (!charCountEl || !activeNote) return
        if (activeNote.type === 'CHECKLIST') {
            const items = Array.isArray(activeNote.items) ? activeNote.items : []
            const done = items.filter(i => i.done).length
            charCountEl.textContent = items.length ? `${done}/${items.length}` : ''
        } else {
            const len = (activeNote.body || '').length
            charCountEl.textContent = len ? `${len} ${tGet('notes.charsShort') || 'симв.'}` : ''
        }
    }

    function showEdit(note) {
        activeNote = note
        listView.style.display = 'none'
        editView.style.display = ''
        titleInput.value = note.title || ''
        pinBtn.classList.toggle('active', !!note.pinned)
        archiveBtn?.classList.toggle('active', !!note.archived)

        if (colorRow) {
            colorRow.querySelectorAll('.notes-color-swatch').forEach(sw => {
                sw.classList.toggle('active', (sw.dataset.color || '') === (note.color || ''))
            })
        }
        if (editDateEl) {
            const label = tGet('notes.editedLabel') || 'Изменено'
            editDateEl.textContent = formatNoteDate(note.updatedAt || note.createdAt)
                ? `${label}: ${formatNoteDate(note.updatedAt || note.createdAt)}`
                : ''
        }

        if (note.type === 'CHECKLIST') {
            bodyTextarea.style.display = 'none'
            checklistWrap.style.display = ''
            renderChecklistItems()
        } else {
            bodyTextarea.style.display = ''
            checklistWrap.style.display = 'none'
            bodyTextarea.value = note.body || ''
        }
        saveIndicator.textContent = ''
        updateCharCount()
    }

    function setSaving() {
        saveIndicator.textContent = tGet('notes.savingIndicator') || 'Сохранение…'
    }
    function setSaved() {
        saveIndicator.textContent = tGet('notes.savedIndicator') || 'Сохранено'
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => { saveIndicator.textContent = '' }, 1500)
    }

    async function handleAuthError(result) {
        if (result?.code === 'pro_required' || result?.status === 403) {
            updateButtonVisibility()
            closeRightPanel?.()
            requirePro?.('notes')
            return true
        }
        return false
    }

    async function loadNotes() {
        if (loading) return
        loading = true
        listEl.innerHTML = `<div class="app-notif-empty">…</div>`
        const result = await authorizedInvoke('api-notes-list', { archived: viewingArchived })
        loading = false
        if (!result?.success) {
            if (await handleAuthError(result)) return
            listEl.innerHTML = `<div class="app-notif-empty">${escapeHtml(tGet('notes.syncError') || 'Не удалось синхронизировать заметки')}</div>`
            return
        }
        notes = result.data?.notes || []
        renderList()
    }

    async function createNote(type, seed = {}) {
        const result = await authorizedInvoke('api-notes-create', { type, title: '', position: notes.length, ...seed })
        if (!result?.success) { await handleAuthError(result); return }
        notes = [result.data.note, ...notes]
        showEdit(result.data.note)
        requestAnimationFrame(() => titleInput.focus())
    }

    async function duplicateActiveNote() {
        if (!activeNote) return
        const suffix = tGet('notes.copySuffix') || 'копия'
        await createNote(activeNote.type, {
            title: activeNote.title ? `${activeNote.title} (${suffix})` : '',
            body: activeNote.body || '',
            items: Array.isArray(activeNote.items) ? activeNote.items.map(i => ({ ...i, id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })) : [],
            color: activeNote.color || ''
        })
    }

    function patchActiveNote(patch, { immediate = false } = {}) {
        if (!activeNote) return
        activeNote = { ...activeNote, ...patch }
        notes = notes.map(n => n.id === activeNote.id ? activeNote : n)

        // Захватываем id заметки СЕЙЧАС, а не читаем activeNote изнутри run() —
        // иначе к моменту срабатывания debounce/await пользователь мог уже
        // открыть другую заметку (или закрыть панель), и патч/переприсваивание
        // activeNote ниже тихо улетели бы не в ту заметку (нашли живьём: правка
        // заголовка заметки A применялась к заметке B, если успеть переключиться
        // за 500мс debounce).
        const noteId = activeNote.id
        clearTimeout(saveTimer)
        const run = async () => {
            pendingSave = null
            setSaving()
            const result = await authorizedInvoke('api-notes-update', noteId, patch)
            if (!result?.success) { await handleAuthError(result); return }
            notes = notes.map(n => n.id === noteId ? result.data.note : n)
            // Применяем к activeNote/UI только если пользователь всё ещё
            // редактирует ТУ ЖЕ заметку — иначе это уже состояние другой
            // заметки или списка, трогать их нельзя.
            if (activeNote?.id !== noteId) return
            activeNote = result.data.note
            setSaved()
            if (editDateEl) {
                const label = tGet('notes.editedLabel') || 'Изменено'
                editDateEl.textContent = `${label}: ${formatNoteDate(activeNote.updatedAt)}`
            }
        }
        if (immediate) run()
        else { pendingSave = run; saveTimer = setTimeout(run, 500) }
    }

    // Кнопка "Сохранить" — для клиентов, которым непонятно молчаливое
    // автосохранение: дёргает уже отложенный запрос немедленно, либо (если
    // сохранять нечего) просто мигает индикатором "Сохранено".
    function forceSave() {
        if (!activeNote) return
        clearTimeout(saveTimer)
        if (pendingSave) { const run = pendingSave; pendingSave = null; run() }
        else setSaved()
    }

    async function deleteActiveNote() {
        if (!activeNote) return
        const id = activeNote.id
        const result = await authorizedInvoke('api-notes-delete', id)
        if (!result?.success) { await handleAuthError(result); return }
        notes = notes.filter(n => n.id !== id)
        showList()
    }

    // ── операции по id (для контекстного меню — карточка не обязательно
    // открыта в редакторе, patchActiveNote/deleteActiveNote тут не подходят) ─
    async function patchNoteById(id, patch) {
        const result = await authorizedInvoke('api-notes-update', id, patch)
        if (!result?.success) { await handleAuthError(result); return }
        notes = notes.map(n => n.id === id ? result.data.note : n)
        if (activeNote?.id === id) activeNote = result.data.note
        renderList()
    }

    async function deleteNoteById(id) {
        const note = notes.find(n => n.id === id)
        const ok = await window.showConfirmModal({
            title: tGet('notes.deleteConfirmTitle') || 'Удалить заметку?',
            message: tGet('notes.deleteConfirmText') || 'Действие нельзя отменить.',
            confirmText: tGet('notes.deleteBtn') || 'Удалить',
            cancelText: tGet('notes.cancelBtn') || 'Отмена',
            danger: true
        })
        if (!ok) return
        const result = await authorizedInvoke('api-notes-delete', id)
        if (!result?.success) { await handleAuthError(result); return }
        notes = notes.filter(n => n.id !== id)
        if (activeNote?.id === id) showList()
        else renderList()
    }

    async function duplicateNoteById(id) {
        const note = notes.find(n => n.id === id)
        if (!note) return
        const suffix = tGet('notes.copySuffix') || 'копия'
        const result = await authorizedInvoke('api-notes-create', {
            type: note.type,
            title: note.title ? `${note.title} (${suffix})` : '',
            body: note.body || '',
            items: Array.isArray(note.items) ? note.items.map(i => ({ ...i, id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })) : [],
            color: note.color || '',
            position: notes.length
        })
        if (!result?.success) { await handleAuthError(result); return }
        notes = [result.data.note, ...notes]
        renderList()
    }

    // ── события ──────────────────────────────────────────────────────────
    addNoteBtn?.addEventListener('click', (e) => { e.stopPropagation(); createNote('NOTE') })
    addChecklistBtn?.addEventListener('click', (e) => { e.stopPropagation(); createNote('CHECKLIST') })
    backBtn?.addEventListener('click', (e) => { e.stopPropagation(); showList() })

    listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.note-card')
        // BUGFIX (2026-09-10, "меню ПКМ в заметках не исчезает если не
        // выбрать никакой пункт а например щёлкнуть ЛКМ в любом пустом
        // месте" — live user report): stopPropagation() used to run
        // unconditionally here, even for a click on empty space inside the
        // list (not on a card) — that swallowed the click before it could
        // bubble up to panel's own click listener below (added by an
        // earlier "context menu doesn't close" fix), which is what actually
        // closes ctxMenu. Only stop propagation once we know this click is
        // actually opening a note, so an empty-space click keeps bubbling
        // and reaches the handler that closes the menu.
        if (!card) return
        e.stopPropagation()
        const note = notes.find(n => String(n.id) === card.dataset.id)
        if (note) showEdit(note)
    })

    // ── правая кнопка мыши по карточке — открыть/закрепить/дублировать/
    // архивировать/удалить, не открывая редактор ────────────────────────
    function closeCtxMenu() {
        ctxMenu?.classList.remove('show')
        contextNoteId = null
    }
    document.addEventListener('close-all-popups', closeCtxMenu)

    listEl.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.note-card')
        if (!card || !ctxMenu) return
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        contextNoteId = card.dataset.id
        const note = notes.find(n => String(n.id) === contextNoteId)
        if (!note) return

        if (ctxPinLabel) ctxPinLabel.setAttribute('data-i18n', note.pinned ? 'notes.unpin' : 'notes.pin')
        if (ctxPinLabel) ctxPinLabel.textContent = tGet(note.pinned ? 'notes.unpin' : 'notes.pin') || (note.pinned ? 'Открепить' : 'Закрепить')
        if (ctxArchiveLabel) ctxArchiveLabel.setAttribute('data-i18n', note.archived ? 'notes.unarchive' : 'notes.archive')
        if (ctxArchiveLabel) ctxArchiveLabel.textContent = tGet(note.archived ? 'notes.unarchive' : 'notes.archive') || (note.archived ? 'Разархивировать' : 'Архивировать')

        ctxMenu.style.left = `${e.clientX}px`
        ctxMenu.style.top = `${e.clientY}px`
        ctxMenu.classList.add('show')
        const rect = ctxMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) ctxMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) ctxMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    })

    ctxOpen?.addEventListener('click', (e) => {
        e.stopPropagation()
        const note = notes.find(n => String(n.id) === contextNoteId)
        closeCtxMenu()
        if (note) showEdit(note)
    })
    ctxPin?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextNoteId
        const note = notes.find(n => String(n.id) === id)
        closeCtxMenu()
        if (note) patchNoteById(note.id, { pinned: !note.pinned })
    })
    ctxDuplicate?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextNoteId
        closeCtxMenu()
        if (id != null) duplicateNoteById(notes.find(n => String(n.id) === id)?.id)
    })
    ctxArchive?.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = contextNoteId
        const note = notes.find(n => String(n.id) === id)
        closeCtxMenu()
        if (!note) return
        const nextArchived = !note.archived
        await patchNoteById(note.id, { archived: nextArchived })
        // Список сейчас показывает либо архив, либо обычные заметки (фильтр
        // применяется на сервере через loadNotes) — если после переключения
        // заметка больше не относится к текущему виду, убираем её из DOM
        // без повторного похода на сервер.
        if (nextArchived !== viewingArchived) {
            notes = notes.filter(n => n.id !== note.id)
            if (activeNote?.id === note.id) showList()
            else renderList()
        }
    })
    ctxDelete?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextNoteId
        const note = notes.find(n => String(n.id) === id)
        closeCtxMenu()
        if (note) deleteNoteById(note.id)
    })

    saveBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        forceSave()
    })

    archiveToggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        viewingArchived = !viewingArchived
        archiveToggleBtn.classList.toggle('active', viewingArchived)
        // Создавать заметки, находясь в архиве, бессмысленно — новая заметка
        // не архивная и просто не появилась бы в текущем (архивном) списке.
        if (addNoteBtn) addNoteBtn.style.display = viewingArchived ? 'none' : ''
        if (addChecklistBtn) addChecklistBtn.style.display = viewingArchived ? 'none' : ''
        loadNotes()
    })

    // ── drag&drop сортировка списка (только неархивный вид без поиска,
    // см. canReorder()) ────────────────────────────────────────────────
    listEl.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.note-card[draggable="true"]')
        if (!card) return
        dragId = card.dataset.id
        card.classList.add('dragging')
        e.dataTransfer.effectAllowed = 'move'
    })

    listEl.addEventListener('dragover', (e) => {
        if (!dragId) return
        e.preventDefault()
        const overCard = e.target.closest('.note-card')
        if (!overCard || overCard.dataset.id === dragId) return
        const rect = overCard.getBoundingClientRect()
        const before = (e.clientY - rect.top) < rect.height / 2
        overCard.parentNode.insertBefore(
            listEl.querySelector(`.note-card[data-id="${dragId}"]`),
            before ? overCard : overCard.nextSibling
        )
    })

    listEl.addEventListener('dragend', async (e) => {
        const card = e.target.closest('.note-card')
        card?.classList.remove('dragging')
        if (!dragId) return
        dragId = null

        // Порядок в DOM после переноса — источник истины: пересчитываем
        // position по видимым карточкам (0, 1, 2…) и сохраняем и локально
        // (notes), и на сервере одним запросом (POST /reorder).
        const ids = [...listEl.querySelectorAll('.note-card')].map(el => el.dataset.id)
        const order = ids.map((id, i) => ({ id, position: i }))
        const byId = new Map(notes.map(n => [n.id, n]))
        notes = ids.map(id => byId.get(id)).filter(Boolean).concat(notes.filter(n => !ids.includes(n.id)))
        await authorizedInvoke('api-notes-reorder', order)
    })

    archiveBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!activeNote) return
        const nextArchived = !activeNote.archived
        patchActiveNote({ archived: nextArchived }, { immediate: true })
        notes = notes.filter(n => n.id !== activeNote.id)
        showList()
    })

    titleInput?.addEventListener('input', () => patchActiveNote({ title: titleInput.value }))
    bodyTextarea?.addEventListener('input', () => {
        patchActiveNote({ body: bodyTextarea.value })
        updateCharCount()
    })

    searchInput?.addEventListener('input', () => {
        searchQuery = searchInput.value.trim()
        renderList()
    })

    pinBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!activeNote) return
        patchActiveNote({ pinned: !activeNote.pinned }, { immediate: true })
        pinBtn.classList.toggle('active', !!activeNote.pinned)
    })

    duplicateBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        duplicateActiveNote()
    })

    colorRow?.addEventListener('click', (e) => {
        e.stopPropagation()
        const sw = e.target.closest('.notes-color-swatch')
        if (!sw || !activeNote) return
        const color = sw.dataset.color || ''
        patchActiveNote({ color }, { immediate: true })
        colorRow.querySelectorAll('.notes-color-swatch').forEach(el => el.classList.toggle('active', el === sw))
    })

    deleteBtn?.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!activeNote) return
        const ok = await window.showConfirmModal({
            title: tGet('notes.deleteConfirmTitle') || 'Удалить заметку?',
            message: tGet('notes.deleteConfirmText') || 'Действие нельзя отменить.',
            confirmText: tGet('notes.deleteBtn') || 'Удалить',
            cancelText: tGet('notes.cancelBtn') || 'Отмена',
            danger: true
        })
        if (ok) deleteActiveNote()
    })

    checklistItemsEl?.addEventListener('click', (e) => {
        e.stopPropagation()
        const itemEl = e.target.closest('.note-checklist-item')
        if (!itemEl || !activeNote) return
        const id = itemEl.dataset.id
        const items = [...(activeNote.items || [])]
        const idx = items.findIndex(i => String(i.id) === id)
        if (idx === -1) return
        const action = e.target.closest('[data-action]')?.dataset.action || 'toggle'
        if (action === 'delete') items.splice(idx, 1)
        else items[idx] = { ...items[idx], done: !items[idx].done }
        patchActiveNote({ items }, { immediate: true })
        renderChecklistItems()
        updateCharCount()
    })

    addItemForm?.addEventListener('submit', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const text = (addItemInput?.value || '').trim()
        if (!text || !activeNote) return
        const items = [...(activeNote.items || []), { id: `item-${Date.now()}`, text, done: false }]
        patchActiveNote({ items }, { immediate: true })
        renderChecklistItems()
        updateCharCount()
        if (addItemInput) addItemInput.value = ''
    })

    // BUGFIX ("контекстное меню не закрывается при клике в другое место"):
    // этот listener глушит клик до document — 'close-all-popups' (см.
    // popup-backdrop-bind.js) диспатчится только для клика ВНЕ панели,
    // поэтому клик по пустому месту ВНУТРИ самой панели (например, по фону
    // списка) ctxMenu не закрывал. ctxMenu — отдельный DOM-узел вне panel
    // (см. index.html), так что stopPropagation() здесь на него не влияет:
    // безопасно закрывать меню на любой клик по панели, если сам клик не по
    // ctxMenu (иначе клик по пункту меню закрывал бы его раньше, чем
    // успевал сработать collapse обработчик пункта).
    panel.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!ctxMenu?.contains(e.target)) closeCtxMenu()
    })

    function openPanel() {
        viewingArchived = false
        archiveToggleBtn?.classList.remove('active')
        if (addNoteBtn) addNoteBtn.style.display = ''
        if (addChecklistBtn) addChecklistBtn.style.display = ''
        showList()
        // Всегда грузим заново, а не из кэша: если между открытиями
        // сменился аккаунт (logout/login другим пользователем в одной
        // и той же запущенной сессии), нельзя случайно показать чужие
        // заметки, оставшиеся в памяти с прошлого раза.
        loadNotes()
        openRightPanel?.()
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openPanel()
    })

    updateButtonVisibility()

    return {
        updateButtonVisibility,
        // Вызывается после логина/логаута/синка — сбрасываем кэш, чтобы
        // при следующем открытии панели заново подтянуть актуальный список
        // (например, после входа в другой аккаунт на этом же устройстве).
        invalidate() {
            notes = []
        }
    }
}

module.exports = { bindNotesUi }
