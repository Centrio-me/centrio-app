function createContextMenusApi({
    state,
    contextMenu,
    folderContextMenu,
    folderPickMenu,
    sidebarContextMenu,
    webviewContextMenu,
    dividerContextMenu,
    folderIcons,
    tGet,
    getActiveMessengers,
    moveMessengerToFolder,
    updateContextMuteLabel
}) {
    function hideAllMenus() {
        contextMenu.classList.remove('show')
        folderContextMenu.classList.remove('show')
        folderPickMenu.classList.remove('show')
        sidebarContextMenu.classList.remove('show')
        webviewContextMenu.classList.remove('show')
        if (dividerContextMenu) dividerContextMenu.classList.remove('show')
        state.contextTargetId = null
        state.contextTargetFolderId = null
        state.contextTargetDividerId = null
    }

    // Единая точка входа "закрыть вообще всё" — см. renderer/popup-backdrop-bind.js.
    // Подписка тут одна на всё семейство контекстных меню вместо того, чтобы
    // каждое меню отдельно слушало событие.
    document.addEventListener('close-all-popups', hideAllMenus)

    function showContextMenu(e, messengerId) {
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        state.contextTargetId = messengerId

        const messenger = getActiveMessengers().find(m => m.id === messengerId)
        document.getElementById('ctxRemoveFromFolder').style.display =
            (messenger && messenger.folderId) ? 'flex' : 'none'

        updateContextMuteLabel(messengerId)
        document.dispatchEvent(new CustomEvent('contextmenu-opened', { detail: { messengerId } }))
        contextMenu.style.left = `${e.clientX}px`
        contextMenu.style.top = `${e.clientY}px`
        contextMenu.classList.add('show')

        const rect = contextMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) contextMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) contextMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function showFolderContextMenu(e, folderId) {
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        state.contextTargetFolderId = folderId

        folderContextMenu.style.left = `${e.clientX}px`
        folderContextMenu.style.top = `${e.clientY}px`
        folderContextMenu.classList.add('show')

        const rect = folderContextMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) folderContextMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) folderContextMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function showFolderPickMenu(e, messengerId) {
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        state.contextTargetId = messengerId

        const folderPickList = document.getElementById('folderPickList')
        folderPickList.innerHTML = ''

        if (state.folders.length > 0) {
            const divider = document.createElement('div')
            divider.className = 'context-divider'
            folderPickList.appendChild(divider)

            state.folders.forEach(folder => {
                const item = document.createElement('div')
                item.className = 'context-item'
                const iconSvg = folderIcons[folder.icon] || folderIcons.folder
                item.innerHTML = `<span style="display:flex;align-items:center;color:var(--text-secondary)">${iconSvg}</span>${folder.name}`
                item.addEventListener('click', () => {
                    moveMessengerToFolder(messengerId, folder.id)
                    hideAllMenus()
                })
                folderPickList.appendChild(item)
            })

            const messenger = getActiveMessengers().find(m => m.id === messengerId)
            if (messenger?.folderId) {
                const div2 = document.createElement('div')
                div2.className = 'context-divider'
                folderPickList.appendChild(div2)

                const removeItem = document.createElement('div')
                removeItem.className = 'context-item'
                removeItem.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>${tGet('ctx.removeFromFolder')}`
                removeItem.addEventListener('click', () => {
                    moveMessengerToFolder(messengerId, null)
                    hideAllMenus()
                })
                folderPickList.appendChild(removeItem)
            }
        }

        folderPickMenu.style.left = `${e.clientX + 5}px`
        folderPickMenu.style.top = `${e.clientY}px`
        folderPickMenu.classList.add('show')

        const rect = folderPickMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) folderPickMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) folderPickMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function showDividerContextMenu(e, dividerId) {
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        state.contextTargetDividerId = dividerId

        dividerContextMenu.style.left = `${e.clientX}px`
        dividerContextMenu.style.top = `${e.clientY}px`
        dividerContextMenu.classList.add('show')

        const rect = dividerContextMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) dividerContextMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) dividerContextMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    return {
        hideAllMenus,
        showContextMenu,
        showFolderContextMenu,
        showFolderPickMenu,
        showDividerContextMenu
    }
}

module.exports = {
    createContextMenusApi
}