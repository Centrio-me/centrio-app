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
    ipcRenderer,
    applyWorkspaceFilter
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

    document.getElementById('ctxMoveToFolder')?.addEventListener('click', (e) => {
        // BUGFIX (2026-09-14, live-репорт "хрен пойми где появляется этот
        // выбор пространства и папки, да ещё и не нажимается") — ВТОРАЯ
        // причина: sidebar-shell-bind.js вешает НА ВЕСЬ document
        // безусловный click-листенер `hideAllMenus()` (для закрытия меню
        // кликом мимо). Этот обработчик открывает #folderPickMenu, но сам
        // клик по #ctxMoveToFolder продолжает всплывать дальше к document —
        // и та же самая функция hideAllMenus() тут же закрывает то, что
        // только что открыли, ещё до того как пользователь успевает
        // кликнуть по строке внутри. stopPropagation — единственное, что
        // мешает всплытию добраться до document.
        e.stopPropagation()
        const messenger = getMessengerById(state.contextTargetId)
        // BUGFIX (2026-09-14) — ПЕРВАЯ причина, та же формулировка репорта:
        // rect ЗДЕСЬ, ДО hideAllMenus() — та прячет родительское
        // #contextMenu (снимает .show → display:none по базовому правилу
        // .context-menu), а #ctxMoveToFolder лежит ВНУТРИ него.
        // getBoundingClientRect() на уже-скрытом элементе возвращает все
        // нули, так что пикер позиционировался в (6px, 0px) — левый
        // верхний угол окна, а не
        // рядом с реальным пунктом меню, на который кликнул пользователь.
        const btnRect = document.getElementById('ctxMoveToFolder')?.getBoundingClientRect()
        // BUGFIX (2026-09-16) — {keepContextMenu:true}: see the matching
        // comment on hideAllMenus() in context-menus.js. The first-level
        // menu (#contextMenu, which #ctxMoveToFolder itself lives inside)
        // now stays visible while this submenu is open, cascading menu style,
        // instead of vanishing the instant you click "В папку".
        hideAllMenus({ keepContextMenu: true })
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

        // BUGFIX (2026-09-15, live-репорт "всплывающее окно пространства не
        // закрывается... и если мимо нажать - тоже закрываться должно"):
        // здесь раньше ЕЩЁ стояла строка menu.style.display = 'block' — тот
        // же баг сидел и здесь. Инлайн-style.display сильнее CSS-правила
        // .context-menu.show{display:block}/.context-menu{display:none},
        // так что hideAllMenus() (закрывает всё через снятие класса .show)
        // не мог визуально закрыть это меню НИКОГДА — ни при выборе пункта,
        // ни кликом мимо. Каждое другое меню в файле управляется ТОЛЬКО
        // классом .show — этот пикер и его брат чуть ниже (workspaceMoveMenu)
        // были единственным исключением.
        menu.classList.add('show')

        if (btnRect) {
            menu.style.left = `${btnRect.right + 6}px`
            menu.style.top = `${btnRect.top}px`
        }
    })

    // FEATURE (2026-09-14, live-запрос "Рядом с кнопкой 'в папку' - также
    // организовать перемещение между пространствами") — тот же паттерн, что
    // и ctxMoveToFolder выше, только пишет messenger.workspaceId вместо
    // folderId и не трогает сайдбар (applyWorkspaceFilter просто
    // показывает/скрывает уже существующий элемент, ничего не
    // перемещает/не создаёт).
    document.getElementById('ctxMoveToWorkspace')?.addEventListener('click', (e) => {
        // BUGFIX (2026-09-14) — то же stopPropagation, что и у ctxMoveToFolder
        // выше (см. объяснение там): без него клик всплывает до document,
        // где sidebar-shell-bind.js безусловно закрывает всё через
        // hideAllMenus() сразу после того, как этот обработчик открыл пикер.
        e.stopPropagation()
        const messenger = getMessengerById(state.contextTargetId)
        // BUGFIX (2026-09-14, live-репорт — тот же баг, что и у
        // ctxMoveToFolder выше, объяснение там): rect берём ДО hideAllMenus(),
        // иначе кнопка уже display:none и позиция улетает в левый верхний угол.
        const btnRect = document.getElementById('ctxMoveToWorkspace')?.getBoundingClientRect()
        // BUGFIX (2026-09-16, live-репорт коллеги — "снова закрывается
        // контекстное меню и меню второго уровня висит просто"): see the
        // matching comment on hideAllMenus() in context-menus.js.
        hideAllMenus({ keepContextMenu: true })
        if (!messenger) return

        const menu = document.getElementById('workspaceMoveMenu')
        if (!menu) return

        menu.innerHTML = ''

        const noneItem = document.createElement('div')
        noneItem.className = 'context-item'
        noneItem.textContent = tGet ? tGet('workspaces.none') : 'No Workspace'
        noneItem.addEventListener('click', () => {
            messenger.workspaceId = null
            applyWorkspaceFilter?.()
            saveData()
            hideAllMenus()
        })
        menu.appendChild(noneItem)

        state.workspaces.forEach(ws => {
            const item = document.createElement('div')
            item.className = 'context-item'
            const iconSvg = (folderIcons && folderIcons[ws.icon]) || (folderIcons && folderIcons.folder) || ''
            item.innerHTML = `
                <span class="folder-mini-icon" style="color:${ws.color || 'var(--accent)'}">${iconSvg}</span>
                <span>${ws.name}</span>
            `
            item.addEventListener('click', () => {
                messenger.workspaceId = ws.id
                applyWorkspaceFilter?.()
                saveData()
                hideAllMenus()
            })
            menu.appendChild(item)
        })

        menu.classList.add('show')

        if (btnRect) {
            menu.style.left = `${btnRect.right + 6}px`
            menu.style.top = `${btnRect.top}px`
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