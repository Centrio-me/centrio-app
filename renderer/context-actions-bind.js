function bindContextActionsUi({
    state,
    folderIcons,
    saveData,
    hideAllMenus,
    openEditModal,
    toggleMessengerVpn,
    removeMessenger,
    moveMessengerToFolder,
    removeFolder,
    addDivider,
    removeDivider,
    updateMuteIcon,
    getMessengerById,
    getFolderById,
    requirePro,
    tGet,
    ipcRenderer
}) {
    document.getElementById('ctxSidebarNewFolder')?.addEventListener('click', () => {
        if (requirePro && !requirePro('folders')) return
        hideAllMenus()
        state.editMode = 'newFolder'

        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')

        if (saveBtn) delete saveBtn.dataset.pendingMessengerId
        if (editName) editName.value = ''
        if (editModalTitle) editModalTitle.textContent = tGet ? tGet('modal.newFolderTitle') : 'New Folder'

        document.querySelectorAll('.folder-icon-option, .icon-picker-item').forEach(el => {
            el.classList.remove('active', 'selected')
        })

        state.selectedFolderIcon = 'folder'
        document.querySelector(`.folder-icon-option[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('active')
        document.querySelector(`.icon-picker-item[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('selected')

        openEditModal()
    })

    document.getElementById('ctxSidebarReloadAll')?.addEventListener('click', () => {
        hideAllMenus()
        state.activeMessengers.forEach(m => {
            document.getElementById(`webview-${m.id}`)?.reload()
        })
    })

    document.getElementById('ctxSidebarAddDivider')?.addEventListener('click', () => {
        hideAllMenus()
        if (typeof addDivider === 'function') addDivider()
    })

    document.getElementById('ctxDividerRemove')?.addEventListener('click', () => {
        const dividerId = state.contextTargetDividerId
        hideAllMenus()
        if (dividerId && typeof removeDivider === 'function') removeDivider(dividerId)
    })

    document.getElementById('ctxReload')?.addEventListener('click', () => {
        const m = getMessengerById(state.contextTargetId)
        hideAllMenus()
        if (m) document.getElementById(`webview-${m.id}`)?.reload()
    })

    document.getElementById('ctxMute')?.addEventListener('click', () => {
        const m = getMessengerById(state.contextTargetId)
        if (!m) {
            hideAllMenus()
            return
        }

        state.mutedMessengers[m.id] = !state.mutedMessengers[m.id]
        saveData()
        updateMuteIcon(m.id)
        hideAllMenus()
    })

    document.getElementById('ctxEdit')?.addEventListener('click', () => {
        const m = getMessengerById(state.contextTargetId)
        hideAllMenus()
        if (!m) return

        state.editMode = 'messenger'
        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')

        if (saveBtn) saveBtn.dataset.pendingMessengerId = m.id
        if (editName) editName.value = m.name
        if (editModalTitle) editModalTitle.textContent = tGet ? tGet('modal.editMessengerTitle') : 'Edit Messenger'

        openEditModal()
    })

    document.getElementById('ctxMoveToFolder')?.addEventListener('click', () => {
        const messenger = getMessengerById(state.contextTargetId)
        hideAllMenus()
        if (!messenger) return

        const menu = document.getElementById('folderSelectMenu') || document.getElementById('folderPickMenu')
        if (!menu) return

        menu.innerHTML = ''

        const noneItem = document.createElement('div')
        noneItem.className = 'context-item'
        noneItem.textContent = tGet ? tGet('modal.noFolder') : 'No Folder'
        noneItem.addEventListener('click', () => {
            moveMessengerToFolder(messenger.id, null)
            hideAllMenus()
        })
        menu.appendChild(noneItem)

        state.folders.forEach(folder => {
            const item = document.createElement('div')
            item.className = 'context-item'
            item.innerHTML = `
                <span class="folder-mini-icon">${folderIcons[folder.icon] || folderIcons.folder}</span>
                <span>${folder.name}</span>
            `
            item.addEventListener('click', () => {
                moveMessengerToFolder(messenger.id, folder.id)
                hideAllMenus()
            })
            menu.appendChild(item)
        })

        menu.style.display = 'block'
        menu.classList.add('show')

        const rect = document.getElementById('ctxMoveToFolder')?.getBoundingClientRect()
        if (rect) {
            menu.style.left = `${rect.right + 6}px`
            menu.style.top = `${rect.top}px`
        }
    })

    document.getElementById('ctxNewFolder')?.addEventListener('click', () => {
        if (requirePro && !requirePro('folders')) return
        hideAllMenus()
        state.editMode = 'newFolder'

        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')

        if (saveBtn) saveBtn.dataset.pendingMessengerId = state.contextTargetId
        if (editName) editName.value = ''
        if (editModalTitle) editModalTitle.textContent = tGet ? tGet('modal.newFolderTitle') : 'New Folder'

        document.querySelectorAll('.folder-icon-option, .icon-picker-item').forEach(el => {
            el.classList.remove('active', 'selected')
        })

        state.selectedFolderIcon = 'folder'
        document.querySelector(`.folder-icon-option[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('active')
        document.querySelector(`.icon-picker-item[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('selected')

        openEditModal()
    })

    document.getElementById('ctxRemove')?.addEventListener('click', () => {
        const id = state.contextTargetId
        hideAllMenus()
        removeMessenger(id)
    })

    document.getElementById('ctxRemoveFromFolder')?.addEventListener('click', () => {
        const id = state.contextTargetId
        hideAllMenus()
        if (id) moveMessengerToFolder(id, null)
    })

    document.getElementById('ctxFolderEdit')?.addEventListener('click', () => {
        const folder = getFolderById(state.contextTargetFolderId)
        hideAllMenus()
        if (!folder) return

        state.editMode = 'folder'

        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')

        if (saveBtn) saveBtn.dataset.pendingMessengerId = folder.id
        if (editName) editName.value = folder.name
        if (editModalTitle) editModalTitle.textContent = tGet ? tGet('modal.folderTitle') : 'Edit Folder'

        document.querySelectorAll('.folder-icon-option, .icon-picker-item').forEach(el => {
            el.classList.remove('active', 'selected')
        })

        state.selectedFolderIcon = folder.icon || 'folder'
        document.querySelector(`.folder-icon-option[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('active')
        document.querySelector(`.icon-picker-item[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('selected')

        openEditModal()
    })

    document.getElementById('ctxFolderChangeIcon')?.addEventListener('click', () => {
        const folder = getFolderById(state.contextTargetFolderId)
        hideAllMenus()
        if (!folder) return

        state.editMode = 'folder'

        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')

        if (saveBtn) saveBtn.dataset.pendingMessengerId = folder.id
        if (editName) editName.value = folder.name
        if (editModalTitle) editModalTitle.textContent = tGet ? tGet('folders.changeIcon') : 'Change Icon'

        document.querySelectorAll('.folder-icon-option, .icon-picker-item').forEach(el => {
            el.classList.remove('active', 'selected')
        })

        state.selectedFolderIcon = folder.icon || 'folder'
        document.querySelector(`.folder-icon-option[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('active')
        document.querySelector(`.icon-picker-item[data-icon="${state.selectedFolderIcon}"]`)?.classList.add('selected')

        openEditModal()
    })

    document.getElementById('ctxFolderRemove')?.addEventListener('click', () => {
        const folderId = state.contextTargetFolderId
        hideAllMenus()
        if (folderId) removeFolder(folderId)
    })

    document.getElementById('ctxVpn')?.addEventListener('click', (e) => {
        const m = getMessengerById(state.contextTargetId)
        if (!m || !toggleMessengerVpn) { hideAllMenus(); return }
        // Не закрываем меню — даём увидеть переключение ползунка
        e.stopPropagation()
        const toggle = document.getElementById('ctxVpnToggle')
        if (toggle) toggle.classList.toggle('on')
        toggleMessengerVpn(m.id)
    })

    document.getElementById('ctxDarkMode')?.addEventListener('click', () => {
        // SECURITY: forced dark mode is the same Pro-gated 'darkmode' native
        // extension the Extensions panel toggles (extensions-ui.js's
        // getUserIsPro() check) — this context-menu shortcut had no
        // equivalent check at all, so any free-plan user could force dark
        // mode on any messenger regardless of plan, no exploit needed.
        if (requirePro && !requirePro('extensions')) { hideAllMenus(); return }
        const m = getMessengerById(state.contextTargetId)
        hideAllMenus()
        if (!m) return

        const wv = document.getElementById(`webview-${m.id}`)
        if (!wv) return

        const current = m.forceDarkMode || false
        m.forceDarkMode = !current
        saveData()

        const css = `
            html { filter: invert(1) hue-rotate(180deg) !important; }
            img, video, canvas, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
        `
        if (m.forceDarkMode) {
            wv.insertCSS(css).then(id => { wv._darkModeCssId = id })
        } else {
            wv.reload() // Easiest way to remove injected CSS without tracking ID perfectly
        }
    })

    document.getElementById('ctxDevTools')?.addEventListener('click', () => {
        const m = getMessengerById(state.contextTargetId)
        hideAllMenus()
        if (!m) return
        document.getElementById(`webview-${m.id}`)?.openDevTools()
    })

}

module.exports = {
    bindContextActionsUi
}