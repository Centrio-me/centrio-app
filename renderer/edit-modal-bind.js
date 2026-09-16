function bindEditModalUi({
    state,
    editModal,
    folderIcons,
    saveData,
    moveMessengerToFolder,
    renderFolder,
    addToSidebar,
    getFolderById,
    getMessengerById,
    applyWorkspaceFilter,
    getWorkspaceById,
    updateSwitcherLabel
}) {
    const WORKSPACE_COLOR_PALETTE = [
        '#6366f1', '#ec4899', '#22c55e', '#f59e0b',
        '#06b6d4', '#a855f7', '#ef4444', '#14b8a6'
    ]
    const closeEditModal = () => {
        editModal.classList.remove('show')
    }

    document.getElementById('closeEditModalBtn')?.addEventListener('click', () => {
        closeEditModal()
    })

    document.getElementById('editName')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('saveEditBtn')?.click()
    })

    editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal()
    })

    document.getElementById('saveEditBtn')?.addEventListener('click', () => {
        const editNameInput = document.getElementById('editName')
        const saveBtn = document.getElementById('saveEditBtn')
        const newName = editNameInput?.value.trim()

        if (!newName) {
            if (editNameInput) editNameInput.style.borderColor = 'var(--danger)'
            return
        }

        if (editNameInput) editNameInput.style.borderColor = ''

        if (state.editMode === 'messenger') {
            const targetId = saveBtn?.dataset.pendingMessengerId
            const messenger = getMessengerById(targetId)
            if (!messenger) {
                closeEditModal()
                return
            }

            messenger.name = newName
            const sidebarEl = document.getElementById(`sidebar-${messenger.id}`)
            sidebarEl?.setAttribute('title', newName)
            // BUGFIX (2026-09-16, "После переименования мессенджера почему-то
            // не меняется его название сразу" — live user report): this used
            // to update the sidebar item's `title` tooltip and the split-view
            // tab's `.tab-name`, but never the sidebar row's own visible
            // `.messenger-name` span (see renderer/messengers.js's addToSidebar)
            // — the new name only appeared after something else re-rendered
            // the sidebar from scratch (e.g. a restart), not immediately.
            const sidebarNameEl = sidebarEl?.querySelector('.messenger-name')
            if (sidebarNameEl) sidebarNameEl.textContent = newName

            const tab = document.getElementById(`tab-${messenger.id}`)
            const nameEl = tab?.querySelector('.tab-name')
            if (nameEl) nameEl.textContent = newName

            // Плагин "Рабочие пространства" (2026-09-14, третий пересмотр) —
            // прямая привязка мессенджера вне папки к пространству, тот же
            // #editFolderWorkspace select, что и у папок (см. renderer.js's
            // openEditModal()); скрыт для мессенджера внутри папки — там
            // видимость решает сама папка.
            const wsSelect = document.getElementById('editFolderWorkspace')
            if (wsSelect && wsSelect.closest('#folderWorkspaceWrap')?.style.display !== 'none') {
                messenger.workspaceId = wsSelect.value || null
                applyWorkspaceFilter?.()
            }

            saveData()
            closeEditModal()
            return
        }

        if (state.editMode === 'folder') {
            const targetId = saveBtn?.dataset.pendingMessengerId
            const folder = getFolderById(targetId)
            if (!folder) {
                closeEditModal()
                return
            }

            folder.name = newName
            folder.icon = state.selectedFolderIcon
            // Плагин "Рабочие пространства" (2026-09-14) — необязательная
            // принадлежность папки одному пространству, см. index.html
            // #editFolderWorkspace / renderer.js's openEditModal() wrapper.
            const wsSelect = document.getElementById('editFolderWorkspace')
            if (wsSelect && wsSelect.closest('#folderWorkspaceWrap')?.style.display !== 'none') {
                folder.workspaceId = wsSelect.value || null
                applyWorkspaceFilter?.()
            }

            const folderHeader = document.querySelector(`#folder-${folder.id} .folder-header`)
            if (folderHeader) {
                folderHeader.title = newName
                // BUGFIX (2026-09-16, same rename-not-updating pattern as
                // messengers): .folder-name (see renderer.js's renderFolder)
                // needs its text updated too, not just the hover title.
                const folderNameEl = folderHeader.querySelector('.folder-name')
                if (folderNameEl) folderNameEl.textContent = newName
                const iconWrap = folderHeader.querySelector('.folder-icon-wrap')
                if (iconWrap) {
                    const badge = iconWrap.querySelector('.folder-badge')
                    iconWrap.innerHTML = folderIcons[state.selectedFolderIcon] || folderIcons.folder
                    if (badge) iconWrap.appendChild(badge)
                }
            }

            saveData()
            closeEditModal()
            return
        }

        if (state.editMode === 'newFolder') {
            const wsSelect = document.getElementById('editFolderWorkspace')
            const wsVisible = wsSelect && wsSelect.closest('#folderWorkspaceWrap')?.style.display !== 'none'
            const folder = {
                id: Date.now().toString(),
                name: newName,
                icon: state.selectedFolderIcon,
                workspaceId: wsVisible ? (wsSelect.value || null) : null
            }

            state.folders.push(folder)
            renderFolder(folder)
            applyWorkspaceFilter?.()

            const pendingId = saveBtn?.dataset.pendingMessengerId
            if (pendingId) moveMessengerToFolder(pendingId, folder.id)

            saveData()
            closeEditModal()
            return
        }

        // Плагин "Рабочие пространства" (2026-09-14, второй пересмотр) —
        // та же нативная модалка, что и у папок/мессенджеров выше, вместо
        // отдельного самодельного попапа (см. renderer/workspaces-ui.js
        // openCreateModal()/openRenameModal() для причины).
        if (state.editMode === 'workspace') {
            const targetId = saveBtn?.dataset.pendingMessengerId
            const ws = getWorkspaceById?.(targetId)
            if (!ws) {
                closeEditModal()
                return
            }

            ws.name = newName
            ws.icon = state.selectedWorkspaceIcon || 'folder'
            updateSwitcherLabel?.()
            saveData()
            closeEditModal()
            return
        }

        if (state.editMode === 'newWorkspace') {
            const ws = {
                id: Date.now().toString(),
                name: newName,
                icon: state.selectedWorkspaceIcon || 'folder',
                color: WORKSPACE_COLOR_PALETTE[state.workspaces.length % WORKSPACE_COLOR_PALETTE.length]
            }
            state.workspaces.push(ws)
            updateSwitcherLabel?.()
            saveData()
            closeEditModal()
        }
    })
}

module.exports = {
    bindEditModalUi
}