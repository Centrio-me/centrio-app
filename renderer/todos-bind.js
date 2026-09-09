// Планировщик задач (Todos) в правом сайдбаре, как во FRANZ.
// Хранится полностью локально через store (ключ 'todos'), без сервера.
// Панель встроена в раскладку (см. #rightPanel в renderer.js) — открытие
// и закрытие делает общий контроллер openRightPanel/closeRightPanel,
// этот модуль отвечает только за содержимое (списки, задачи, вкладки).
//
// Формат данных: { lists: [{id, name}], items: [{id, text, done, starred, listId}] }.
// Раньше 'todos' был плоским массивом задач без списков — miграция ниже
// оборачивает его в один список по умолчанию, если обнаружен старый формат.
const DEFAULT_LIST_ID = 'default'

function bindTodosUi({ store, tGet, openRightPanel, closeRightPanel }) {
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
    const ctxStar      = document.getElementById('ctxTodoStar')
    const ctxStarLabel = document.getElementById('ctxTodoStarLabel')
    const ctxDelete    = document.getElementById('ctxTodoDelete')

    if (!btn || !panel || !list) return

    // 'starred' или id одного из data.lists
    let activeTab = DEFAULT_LIST_ID
    let contextTodoId = null // задача, на которую было выполнено правое нажатие

    function getData() {
        let data = store.get('todos', null)
        if (!data || Array.isArray(data) || !Array.isArray(data.lists)) {
            // Миграция старого плоского формата (или пустое хранилище).
            const oldItems = Array.isArray(data) ? data : []
            data = {
                lists: [{ id: DEFAULT_LIST_ID, name: tGet('todos.all') || 'Todos' }],
                items: oldItems.map(t => ({ ...t, listId: DEFAULT_LIST_ID }))
            }
            store.set('todos', data)
        }
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
                <span class="todo-item-text">${escapeHtml(todo.text)}</span>
                <button class="todo-item-star ${todo.starred ? 'starred' : ''}" data-action="star" title="${escapeHtml(tGet('todos.star') || 'Закрепить')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="todo-item-delete" data-action="delete" title="${escapeHtml(tGet('todos.delete') || 'Удалить')}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `).join('')
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
        e.stopPropagation()
        const itemEl = e.target.closest('.todo-item')
        if (!itemEl) return
        const id = itemEl.dataset.id
        const actionEl = e.target.closest('[data-action]')
        const action = actionEl?.dataset.action || 'toggle'

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
        data.items.unshift({ id: Date.now(), text, done: false, starred: false, listId })
        saveData(data)
        if (addInput) addInput.value = ''
        renderList()
    })

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
