function createSidebarDndApi({
    state,
    store,
    messengerList,
    moveMessengerToFolder,
    // BUGFIX ("сайдбар не сохраняется" / порядок откатывается после
    // перезапуска): saveOrder() used to only write the local store. On every
    // startup where the user is logged into cloud sync, loadData()'s
    // cloudSyncPull() unconditionally overwrites local sidebarOrder with the
    // server's (stale) copy — see renderer.js loadData(). Since nothing here
    // ever pushed a fresh reorder back up, the very next restart always
    // reverted to whatever order was last in the cloud. Optional so this file
    // still works (cloud sync just skipped) if the caller doesn't wire it in.
    cloudSyncPush,
    isCloudLoggedIn
}) {
    // ── Идентификаторы DOM-элементов по типу сущности ──────────────────────
    function elIdFor(type, id) {
        if (type === 'folder') return `folder-${id}`
        if (type === 'divider') return `divider-${id}`
        return `sidebar-${id}`
    }

    // ── Порядок ──────────────────────────────────────────────────────────
    function saveOrder() {
        const order = []
        messengerList.querySelectorAll(':scope > [id^="sidebar-"], :scope > [id^="folder-"], :scope > [id^="divider-"]').forEach(el => {
            if (el.id.startsWith('sidebar-')) {
                order.push({ type: 'messenger', id: el.id.replace('sidebar-', '') })
            } else if (el.id.startsWith('folder-')) {
                order.push({ type: 'folder', id: el.id.replace('folder-', '') })
            } else if (el.id.startsWith('divider-')) {
                order.push({ type: 'divider', id: el.id.replace('divider-', '') })
            }
        })
        store.set('sidebarOrder', order)

        // Push immediately so the cloud copy never stays stale — otherwise
        // the next app start's cloudSyncPull() overwrites this change right
        // back to whatever order was last synced (see BUGFIX comment above).
        if (typeof isCloudLoggedIn === 'function' && isCloudLoggedIn() && typeof cloudSyncPush === 'function') {
            cloudSyncPush()
        }
    }

    function loadOrder() {
        const order = store.get('sidebarOrder', [])
        if (!order.length) return
        order.forEach(({ type, id }) => {
            const el = document.getElementById(elIdFor(type, id))
            if (el && el.parentElement === messengerList) messengerList.appendChild(el)
        })
    }

    // ── Очистка состояния ─────────────────────────────────────────────────
    function clearDragState() {
        document.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom, .folder-drop-target, .dragging')
            .forEach(el => el.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'folder-drop-target', 'dragging'))
    }

    // ── Логика drop ───────────────────────────────────────────────────────
    // Поддерживает любые комбинации типов сущностей верхнего уровня
    // (мессенджер / папка / разделитель), т.к. разделитель должен быть
    // перетаскиваем между любыми элементами сайдбара.
    function handleDrop(sourceId, sourceType, targetId, targetType, insertBefore, dropIntoFolder) {
        const sourceEl = document.getElementById(elIdFor(sourceType, sourceId))
        const targetEl = document.getElementById(elIdFor(targetType, targetId))
        if (!sourceEl || !targetEl || sourceId === targetId) return

        // Мессенджер → папка (переместить внутрь)
        if (sourceType === 'messenger' && targetType === 'folder' && dropIntoFolder) {
            const messenger = state.activeMessengers.find(m => m.id === sourceId)
            if (messenger && messenger.folderId !== targetId) {
                moveMessengerToFolder(sourceId, targetId)
            }
            return
        }

        // Мессенджер, лежащий внутри папки, бросили на элемент корня
        // (мессенджер/папку/разделитель) → сначала извлекаем его из папки
        if (sourceType === 'messenger' && targetEl.parentElement === messengerList) {
            const messenger = state.activeMessengers.find(m => m.id === sourceId)
            if (messenger && messenger.folderId) {
                moveMessengerToFolder(sourceId, null)
                // После перемещения элемент появится через addToSidebar, переставим его
                requestAnimationFrame(() => {
                    const movedEl = document.getElementById(`sidebar-${sourceId}`)
                    if (movedEl && targetEl) {
                        if (insertBefore) messengerList.insertBefore(movedEl, targetEl)
                        else messengerList.insertBefore(movedEl, targetEl.nextSibling)
                        saveOrder()
                    }
                })
                return
            }
        }

        // Переупорядочение на корневом уровне (мессенджер/папка/разделитель
        // в любой комбинации типов)
        if (targetEl.parentElement !== messengerList) return
        if (insertBefore) messengerList.insertBefore(sourceEl, targetEl)
        else messengerList.insertBefore(sourceEl, targetEl.nextSibling)
        saveOrder()
    }

    // ── Инициализация перетаскивания элемента ─────────────────────────────
    function initDrag(el, id, type) {
        el.setAttribute('draggable', 'true')
        el.style.cursor = 'grab'

        el.addEventListener('dragstart', (e) => {
            state.dragSrcId = id
            state.dragSrcType = type
            setTimeout(() => el.classList.add('dragging'), 0)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', id)
            if (type === 'folder') {
                const header = el.querySelector('.folder-header')
                if (header) e.dataTransfer.setDragImage(header, 18, 18)
            }
        })

        el.addEventListener('dragend', () => {
            el.classList.remove('dragging')
            clearDragState()
            state.dragSrcId = null
            state.dragSrcType = null
        })
    }

    // ── Зона drop для мессенджеров/папок (переупорядочение) ───────────────
    function initDropTarget(el, targetId, targetType) {
        el.addEventListener('dragover', (e) => {
            e.preventDefault()
            if (!state.dragSrcId || state.dragSrcId === targetId) return

            // Если тащим мессенджер на заголовок папки → отдельный обработчик
            if (state.dragSrcType === 'messenger' && targetType === 'folder') {
                clearDragState()
                el.classList.add('folder-drop-target')
                e.dataTransfer.dropEffect = 'move'
                return
            }

            const rect = el.getBoundingClientRect()
            const insertBefore = e.clientY < rect.top + rect.height / 2
            clearDragState()
            el.classList.add(insertBefore ? 'drop-indicator-top' : 'drop-indicator-bottom')
            e.dataTransfer.dropEffect = 'move'
        })

        el.addEventListener('dragleave', (e) => {
            if (!el.contains(e.relatedTarget)) {
                el.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'folder-drop-target')
            }
        })

        el.addEventListener('drop', (e) => {
            e.preventDefault()
            const dropIntoFolder = el.classList.contains('folder-drop-target')
            el.classList.remove('drop-indicator-top', 'drop-indicator-bottom', 'folder-drop-target')
            if (!state.dragSrcId || state.dragSrcId === targetId) return

            const rect = el.getBoundingClientRect()
            const insertBefore = e.clientY < rect.top + rect.height / 2
            handleDrop(state.dragSrcId, state.dragSrcType, targetId, targetType, insertBefore, dropIntoFolder)
        })
    }

    // ── Drop-зона «корень» внизу списка ──────────────────────────────────
    function initRootDropZone() {
        const zone = document.createElement('div')
        zone.className = 'sidebar-root-drop-zone'
        messengerList.appendChild(zone)

        zone.addEventListener('dragover', (e) => {
            e.preventDefault()
            if (!state.dragSrcId) return
            zone.classList.add('active')
            e.dataTransfer.dropEffect = 'move'
        })

        zone.addEventListener('dragleave', () => zone.classList.remove('active'))

        zone.addEventListener('drop', (e) => {
            e.preventDefault()
            zone.classList.remove('active')
            if (!state.dragSrcId) return

            if (state.dragSrcType === 'messenger') {
                const messenger = state.activeMessengers.find(m => m.id === state.dragSrcId)
                if (messenger && messenger.folderId) {
                    moveMessengerToFolder(state.dragSrcId, null)
                    return
                }
            }

            // Мессенджер/папка/разделитель уровня корня → переносим в самый конец списка
            const sourceEl = document.getElementById(elIdFor(state.dragSrcType, state.dragSrcId))
            if (sourceEl && sourceEl.parentElement === messengerList) {
                messengerList.insertBefore(sourceEl, zone)
                saveOrder()
            }
        })

        return zone
    }

    return {
        initDrag,
        initDropTarget,
        initRootDropZone,
        handleDrop,
        saveOrder,
        loadOrder
    }
}

module.exports = {
    createSidebarDndApi
}
