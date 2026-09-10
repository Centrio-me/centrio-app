// Планировщик задач (Todos) в правом сайдбаре, как во FRANZ.
// Хранится полностью локально через store (ключ 'todos'), без сервера.
// Панель встроена в раскладку (см. #rightPanel в renderer.js) — открытие
// и закрытие делает общий контроллер openRightPanel/closeRightPanel,
// этот модуль отвечает только за содержимое (списки, задачи, вкладки).
//
// Формат данных: { lists: [{id, name}], items: [{id, text, done, starred,
// listId, dueDate, priority, notes, subtasks, reminderEnabled, reminderFired,
// createdAt}] }.
// Раньше 'todos' был плоским массивом задач без списков — миграция ниже
// оборачивает его в один список по умолчанию, если обнаружен старый формат.
//
// FEATURE (2026-09-11, "расширить функционал задач... сильно... больше
// данных... дату нужно добавить" — live user request): items gained
// dueDate/priority/notes/subtasks/reminder — see migrateItem() below for the
// backward-compatible defaulting of pre-existing tasks, and openTaskDetail()
// for the new detail modal that edits them.
const DEFAULT_LIST_ID = 'default'
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000

function migrateItem(t) {
    return {
        ...t,
        dueDate: t.dueDate ?? null,
        priority: t.priority || 'none',
        notes: t.notes || '',
        subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
        reminderEnabled: !!t.reminderEnabled,
        reminderFired: !!t.reminderFired,
        createdAt: t.createdAt || Date.now()
    }
}

function bindTodosUi({ store, tGet, ipcRenderer, openRightPanel, closeRightPanel }) {
    const btn         = document.getElementById('todosBtn')
    const panel       = document.getElementById('todosPanel')
    const list        = document.getElementById('todosList')
    const addForm     = document.getElementById('todoAddForm')
    const addInput    = document.getElementById('todoAddInput')
    const tabStarred  = document.getElementById('todosTabStarred')
    const listTabsEl  = document.getElementById('todosListTabs')
    const listAddBtn   = document.getElementById('todoListAddBtn')
    const listAddInput = document.getElementById('todoListAddInput')
    const ctxMenu      = document.getElementById('todosContextMenu')
    const ctxEdit      = document.getElementById('ctxTodoEdit')
    const ctxDetails   = document.getElementById('ctxTodoDetails')
    const ctxStar      = document.getElementById('ctxTodoStar')
    const ctxStarLabel = document.getElementById('ctxTodoStarLabel')
    const ctxDelete    = document.getElementById('ctxTodoDelete')

    // ── Модал "Подробности задачи" (2026-09-11) ───────────────────────────
    const detailModal     = document.getElementById('taskDetailModal')
    const detailTitle     = document.getElementById('taskDetailTitle')
    const detailDueDate   = document.getElementById('taskDetailDueDate')
    const detailPriority  = document.getElementById('taskDetailPriority')
    const detailReminder  = document.getElementById('taskDetailReminder')
    const detailNotes     = document.getElementById('taskDetailNotes')
    const detailSubtasks  = document.getElementById('taskDetailSubtasks')
    const detailSubInput  = document.getElementById('taskDetailSubtaskInput')
    const detailSubAddBtn = document.getElementById('taskDetailSubtaskAddBtn')
    const detailSaveBtn   = document.getElementById('taskDetailSaveBtn')
    const detailDeleteBtn = document.getElementById('taskDetailDeleteBtn')
    const detailCloseBtn  = document.getElementById('closeTaskDetailBtn')

    let detailTodoId = null
    let detailSubtasksDraft = []

    if (!btn || !panel || !list) return

    // 'starred' или id одного из data.lists
    let activeTab = DEFAULT_LIST_ID
    let contextTodoId = null // задача, на которую было выполнено правое нажатие

    function getData() {
        let data = store.get('todos', null)
        let dirty = false
        if (!data || Array.isArray(data) || !Array.isArray(data.lists)) {
            // Миграция старого плоского формата (или пустое хранилище).
            const oldItems = Array.isArray(data) ? data : []
            data = {
                lists: [{ id: DEFAULT_LIST_ID, name: tGet('todos.all') || 'Todos' }],
                items: oldItems.map(t => ({ ...t, listId: DEFAULT_LIST_ID }))
            }
            dirty = true
        }
        // Миграция на расширенный формат задачи (дата/приоритет/заметки/
        // подзадачи/напоминание) — добавляет только недостающие поля,
        // ничего не перезаписывает у уже расширенных задач.
        if (data.items.some(t => t.priority === undefined)) {
            data.items = data.items.map(migrateItem)
            dirty = true
        }
        if (dirty) store.set('todos', data)
        return data
    }

    function saveData(data) {
        store.set('todos', data)
    }

    function escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
    }

    function renderTabs() {
        const data = getData()
        if (!listTabsEl) return
        // Крестик удаления — только когда списков больше одного: без этого
        // легко остаться вообще без единой категории, куда класть задачи.
        const canDelete = data.lists.length > 1
        listTabsEl.innerHTML = data.lists.map(l => `
            <button class="todos-tab ${activeTab === l.id ? 'active' : ''}" data-list-id="${escapeHtml(l.id)}">
                <span class="todos-tab-name">${escapeHtml(l.name)}</span>
                ${canDelete ? `<span class="todos-tab-delete" data-action="delete-list" data-list-id="${escapeHtml(l.id)}" title="${escapeHtml(tGet('todos.deleteList') || 'Удалить список')}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </span>` : ''}
            </button>
        `).join('')
        tabStarred?.classList.toggle('active', activeTab === 'starred')
    }

    async function deleteList(listId) {
        const data = getData()
        if (data.lists.length <= 1) return
        const listToDelete = data.lists.find(l => l.id === listId)
        if (!listToDelete) return

        const ok = await window.showConfirmModal({
            title: tGet('todos.deleteListConfirmTitle') || 'Удалить список?',
            message: (tGet('todos.deleteListConfirmText') || 'Список "{name}" и все задачи в нём будут удалены безвозвратно.').replace('{name}', listToDelete.name),
            confirmText: tGet('todos.delete') || 'Удалить',
            cancelText: tGet('todos.cancel') || 'Отмена',
            danger: true
        })
        if (!ok) return

        data.lists = data.lists.filter(l => l.id !== listId)
        data.items = data.items.filter(t => t.listId !== listId)
        saveData(data)

        if (activeTab === listId) {
            setActiveTab(data.lists[0]?.id || DEFAULT_LIST_ID)
        } else {
            renderAll()
        }
    }

    function renderList() {
        const data = getData()
        const visible = activeTab === 'starred'
            ? data.items.filter(t => t.starred)
            : data.items.filter(t => t.listId === activeTab)

        if (visible.length === 0) {
            list.innerHTML = `<div class="app-notif-empty">${escapeHtml(tGet('todos.empty') || 'Нет задач')}</div>`
            return
        }

        list.innerHTML = visible.map(todo => `
            <div class="todo-item ${todo.done ? 'done' : ''}" data-id="${todo.id}">
                <div class="todo-item-check" data-action="toggle">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                ${todo.priority && todo.priority !== 'none' ? `<span class="todo-item-priority-dot ${todo.priority}" title="${escapeHtml(tGet('todos.priority' + todo.priority[0].toUpperCase() + todo.priority.slice(1)) || todo.priority)}"></span>` : ''}
                <span class="todo-item-text" data-action="open">${escapeHtml(todo.text)}</span>
                <div class="todo-item-meta">
                    ${renderSubtaskProgress(todo)}
                    ${renderDueBadge(todo)}
                </div>
                <button class="todo-item-star ${todo.starred ? 'starred' : ''}" data-action="star" title="${escapeHtml(tGet('todos.star') || 'Закрепить')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="todo-item-delete" data-action="delete" title="${escapeHtml(tGet('todos.delete') || 'Удалить')}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `).join('')
    }

    function renderSubtaskProgress(todo) {
        if (!todo.subtasks || todo.subtasks.length === 0) return ''
        const done = todo.subtasks.filter(s => s.done).length
        return `<span class="todo-item-subtask-progress">${done}/${todo.subtasks.length}</span>`
    }

    function renderDueBadge(todo) {
        if (!todo.dueDate) return ''
        const due = new Date(todo.dueDate + 'T00:00:00')
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isOverdue = !todo.done && due < today
        const isToday = due.getTime() === today.getTime()
        const label = due.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
        const cls = isOverdue ? 'overdue' : (isToday ? 'today' : '')
        return `<span class="todo-item-due ${cls}">${escapeHtml(label)}</span>`
    }

    function renderAll() {
        renderTabs()
        renderList()
    }

    // Инлайн-редактирование текста задачи — по контекстному меню (см. ниже),
    // без отдельного экрана редактирования, как у заметок: задача — это
    // одна строка, отдельный "редактор" был бы избыточен.
    function editTodoInline(id) {
        const itemEl = list.querySelector(`.todo-item[data-id="${id}"]`)
        const textEl = itemEl?.querySelector('.todo-item-text')
        if (!itemEl || !textEl) return

        const data = getData()
        const todo = data.items.find(t => String(t.id) === String(id))
        if (!todo) return

        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'todo-item-edit-input'
        input.value = todo.text
        input.maxLength = 200
        textEl.replaceWith(input)
        input.focus()
        input.select()

        let done = false
        const commit = (save) => {
            if (done) return
            done = true
            if (save) {
                const text = input.value.trim()
                if (text) {
                    const fresh = getData()
                    const idx = fresh.items.findIndex(t => String(t.id) === String(id))
                    if (idx !== -1) {
                        fresh.items[idx].text = text
                        saveData(fresh)
                    }
                }
            }
            renderList()
        }
        input.addEventListener('blur', () => commit(true))
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(true) }
            else if (e.key === 'Escape') { e.preventDefault(); commit(false) }
        })
    }

    function setActiveTab(tab) {
        activeTab = tab
        renderAll()
    }

    // Клик по чекбоксу/звезде/удалению внутри списка задач — раньше это
    // закрывало всю правую панель из-за отдельного, не связанного с этой
    // панелью, "клик-мимо" обработчика в app-notif-bind.js (уже убран).
    // stopPropagation здесь на случай, если такая логика где-то появится
    // снова — клики внутри панели никогда не должны её закрывать.
    list.addEventListener('click', (e) => {
        // BUGFIX (2026-09-10, "в задачах ещё не закрывается контекстное меню
        // при нажатии в другом месте" — live user report, same class of bug
        // just fixed in renderer/notes-bind.js): stopPropagation() ran
        // unconditionally here, even for a click on empty list space (not on
        // a .todo-item) — that swallowed the click before it could bubble up
        // to panel's own click listener below, which is what actually closes
        // ctxMenu. Only stop propagation once we know this click is actually
        // acting on a todo item.
        const itemEl = e.target.closest('.todo-item')
        if (!itemEl) return
        e.stopPropagation()
        const id = itemEl.dataset.id
        const actionEl = e.target.closest('[data-action]')
        const action = actionEl?.dataset.action || 'toggle'

        // BUGFIX/FEATURE (2026-09-11, extended tasks): clicking the task
        // TEXT now opens the detail modal instead of toggling done — the
        // checkbox (data-action="toggle") is the only thing that still
        // toggles completion, so a click meant to inspect/edit a task
        // doesn't accidentally mark it done.
        if (action === 'open') {
            openTaskDetail(id)
            return
        }

        const data = getData()
        const idx = data.items.findIndex(t => String(t.id) === String(id))
        if (idx === -1) return

        if (action === 'delete') {
            data.items.splice(idx, 1)
        } else if (action === 'star') {
            data.items[idx].starred = !data.items[idx].starred
        } else {
            data.items[idx].done = !data.items[idx].done
        }
        saveData(data)
        renderList()
    })

    // ── правая кнопка мыши по задаче — изменить/закрепить/удалить ────────
    function closeCtxMenu() {
        ctxMenu?.classList.remove('show')
        contextTodoId = null
    }
    document.addEventListener('close-all-popups', closeCtxMenu)

    list.addEventListener('contextmenu', (e) => {
        const itemEl = e.target.closest('.todo-item')
        if (!itemEl || !ctxMenu) return
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        contextTodoId = itemEl.dataset.id
        const data = getData()
        const todo = data.items.find(t => String(t.id) === String(contextTodoId))
        if (!todo) return

        if (ctxStarLabel) ctxStarLabel.textContent = tGet(todo.starred ? 'todos.unstar' : 'todos.star') || (todo.starred ? 'Открепить' : 'Закрепить')

        ctxMenu.style.left = `${e.clientX}px`
        ctxMenu.style.top = `${e.clientY}px`
        ctxMenu.classList.add('show')
        const rect = ctxMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) ctxMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) ctxMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    })

    ctxEdit?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextTodoId
        closeCtxMenu()
        if (id != null) editTodoInline(id)
    })
    ctxDetails?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextTodoId
        closeCtxMenu()
        if (id != null) openTaskDetail(id)
    })
    ctxStar?.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = contextTodoId
        closeCtxMenu()
        if (id == null) return
        const data = getData()
        const idx = data.items.findIndex(t => String(t.id) === String(id))
        if (idx === -1) return
        data.items[idx].starred = !data.items[idx].starred
        saveData(data)
        renderList()
    })
    ctxDelete?.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = contextTodoId
        closeCtxMenu()
        if (id == null) return
        const ok = await window.showConfirmModal({
            title: tGet('todos.deleteConfirmTitle') || 'Удалить задачу?',
            message: tGet('todos.deleteConfirmText') || 'Действие нельзя отменить.',
            confirmText: tGet('todos.delete') || 'Удалить',
            cancelText: tGet('todos.cancel') || 'Отмена',
            danger: true
        })
        if (!ok) return
        const data = getData()
        data.items = data.items.filter(t => String(t.id) !== String(id))
        saveData(data)
        renderList()
    })

    addForm?.addEventListener('submit', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const text = (addInput?.value || '').trim()
        if (!text) return
        const data = getData()
        // Добавление задачи, пока открыта вкладка "Важное" (без своего
        // списка), кладёт её в первый обычный список — иначе непонятно,
        // куда её сохранять.
        const listId = activeTab === 'starred' ? (data.lists[0]?.id || DEFAULT_LIST_ID) : activeTab
        data.items.unshift(migrateItem({ id: Date.now(), text, done: false, starred: false, listId }))
        saveData(data)
        if (addInput) addInput.value = ''
        renderList()
    })

    // ── Подробности задачи (2026-09-11) ───────────────────────────────────
    function renderDetailSubtasks() {
        if (!detailSubtasks) return
        if (detailSubtasksDraft.length === 0) {
            detailSubtasks.innerHTML = ''
            return
        }
        detailSubtasks.innerHTML = detailSubtasksDraft.map(s => `
            <div class="task-detail-subtask-item ${s.done ? 'done' : ''}" data-id="${s.id}">
                <input type="checkbox" data-action="toggle-subtask" ${s.done ? 'checked' : ''}>
                <span class="task-detail-subtask-text">${escapeHtml(s.text)}</span>
                <button type="button" class="task-detail-subtask-remove" data-action="remove-subtask">&times;</button>
            </div>
        `).join('')
    }

    function openTaskDetail(id) {
        const data = getData()
        const todo = data.items.find(t => String(t.id) === String(id))
        if (!todo || !detailModal) return

        detailTodoId = id
        detailSubtasksDraft = (todo.subtasks || []).map(s => ({ ...s }))

        if (detailTitle) detailTitle.value = todo.text
        if (detailDueDate) detailDueDate.value = todo.dueDate || ''
        if (detailPriority) detailPriority.value = todo.priority || 'none'
        if (detailReminder) detailReminder.checked = !!todo.reminderEnabled
        if (detailNotes) detailNotes.value = todo.notes || ''
        renderDetailSubtasks()

        detailModal.classList.add('show')
    }

    function closeTaskDetail() {
        detailModal?.classList.remove('show')
        detailTodoId = null
    }

    function saveTaskDetail() {
        if (detailTodoId == null) return
        const data = getData()
        const idx = data.items.findIndex(t => String(t.id) === String(detailTodoId))
        if (idx === -1) return

        const newDueDate = detailDueDate?.value || null
        const item = data.items[idx]
        // Меняем дату — сбрасываем "уже сработавшее" напоминание, иначе
        // перенос задачи на другой день никогда бы больше не напомнил.
        if (newDueDate !== item.dueDate) item.reminderFired = false

        item.text = (detailTitle?.value || '').trim() || item.text
        item.dueDate = newDueDate
        item.priority = detailPriority?.value || 'none'
        item.reminderEnabled = !!detailReminder?.checked
        item.notes = detailNotes?.value || ''
        item.subtasks = detailSubtasksDraft

        saveData(data)
        closeTaskDetail()
        renderList()
    }

    detailSubAddBtn?.addEventListener('click', () => {
        const text = (detailSubInput?.value || '').trim()
        if (!text) return
        detailSubtasksDraft.push({ id: `sub-${Date.now()}`, text, done: false })
        if (detailSubInput) detailSubInput.value = ''
        renderDetailSubtasks()
    })
    detailSubInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); detailSubAddBtn?.click() }
    })
    detailSubtasks?.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.task-detail-subtask-item')
        if (!itemEl) return
        const subId = itemEl.dataset.id
        const action = e.target.closest('[data-action]')?.dataset.action
        if (action === 'remove-subtask') {
            detailSubtasksDraft = detailSubtasksDraft.filter(s => String(s.id) !== String(subId))
            renderDetailSubtasks()
        } else if (action === 'toggle-subtask') {
            const sub = detailSubtasksDraft.find(s => String(s.id) === String(subId))
            if (sub) sub.done = !sub.done
            renderDetailSubtasks()
        }
    })

    detailSaveBtn?.addEventListener('click', saveTaskDetail)
    detailCloseBtn?.addEventListener('click', closeTaskDetail)
    detailDeleteBtn?.addEventListener('click', async () => {
        if (detailTodoId == null) return
        const ok = await window.showConfirmModal({
            title: tGet('todos.deleteConfirmTitle') || 'Удалить задачу?',
            message: tGet('todos.deleteConfirmText') || 'Действие нельзя отменить.',
            confirmText: tGet('todos.delete') || 'Удалить',
            cancelText: tGet('todos.cancel') || 'Отмена',
            danger: true
        })
        if (!ok) return
        const data = getData()
        data.items = data.items.filter(t => String(t.id) !== String(detailTodoId))
        saveData(data)
        closeTaskDetail()
        renderList()
    })
    detailModal?.addEventListener('click', (e) => { if (e.target === detailModal) closeTaskDetail() })

    // ── Напоминания (2026-09-11) ───────────────────────────────────────────
    // Раз в минуту проверяем задачи с включённым напоминанием, у которых
    // наступила (или прошла) дата и напоминание ещё не срабатывало —
    // используем тот же 'show-notification' канал, что и уведомления
    // мессенджеров (main/ipc/notifications.js), поэтому никакой новой
    // main-процессной логики не требуется.
    function checkReminders() {
        if (!ipcRenderer) return
        const data = getData()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        let changed = false

        data.items.forEach(t => {
            if (!t.reminderEnabled || t.reminderFired || t.done || !t.dueDate) return
            const due = new Date(t.dueDate + 'T00:00:00')
            if (due > today) return
            ipcRenderer.send('show-notification', {
                title: tGet('todos.reminderNotifTitle') || 'Напоминание о задаче',
                body: t.text,
                messengerId: 'todos-reminder'
            })
            t.reminderFired = true
            changed = true
        })

        if (changed) saveData(data)
    }
    setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS)
    checkReminders()

    tabStarred?.addEventListener('click', (e) => {
        e.stopPropagation()
        setActiveTab('starred')
    })

    listTabsEl?.addEventListener('click', (e) => {
        e.stopPropagation()
        const deleteEl = e.target.closest('[data-action="delete-list"]')
        if (deleteEl) { deleteList(deleteEl.dataset.listId); return }
        const tabBtn = e.target.closest('[data-list-id]')
        if (tabBtn) setActiveTab(tabBtn.dataset.listId)
    })

    // "+" прячется, на его месте появляется поле ввода имени, как во FRANZ.
    function showListAddInput() {
        if (listAddBtn) listAddBtn.style.display = 'none'
        if (listAddInput) {
            listAddInput.style.display = ''
            listAddInput.focus()
        }
    }

    function hideListAddInput() {
        if (listAddInput) {
            listAddInput.style.display = 'none'
            listAddInput.value = ''
        }
        if (listAddBtn) listAddBtn.style.display = ''
    }

    listAddBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        showListAddInput()
    })

    listAddInput?.addEventListener('click', (e) => e.stopPropagation())
    listAddInput?.addEventListener('blur', () => {
        // Небольшая задержка — иначе клик по самому полю (фокус→блюр при
        // клике на соседнюю кнопку) успевает спрятать поле раньше, чем
        // сработает click/keydown на нём же.
        setTimeout(() => {
            if (document.activeElement !== listAddInput) hideListAddInput()
        }, 150)
    })
    listAddInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideListAddInput()
            return
        }
        if (e.key !== 'Enter') return
        e.preventDefault()
        const name = (listAddInput.value || '').trim()
        if (!name) { hideListAddInput(); return }
        const data = getData()
        const newList = { id: `list-${Date.now()}`, name }
        data.lists.push(newList)
        saveData(data)
        hideListAddInput()
        setActiveTab(newList.id)
    })

    function openPanel() {
        renderAll()
        openRightPanel?.()
    }

    function closePanel() {
        closeRightPanel?.()
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openPanel()
        requestAnimationFrame(() => addInput?.focus())
    })

    // BUGFIX ("контекстное меню не закрывается при клике в другое место") —
    // см. тот же комментарий в renderer/notes-bind.js: клик по пустому месту
    // внутри самой панели раньше не закрывал ctxMenu, т.к. stopPropagation()
    // здесь не даёт клику дойти до document-уровневого 'close-all-popups'.
    panel.addEventListener('click', (e) => {
        e.stopPropagation()
        closeCtxMenu()
    })

    return { closePanel }
}

module.exports = { bindTodosUi }
