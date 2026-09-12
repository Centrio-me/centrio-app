function bindSidebarShellUi({
    state,
    hideAllMenus,
    closeFolderPanel,
    toggleMuteAll,
    updateUnreadCount,
    updateMuteIcon,
    getActiveMessengers,
    getRawUnreadCount,
    sidebarContextMenu,
    tGet
}) {
    function showSidebarContextMenuAt(x, y) {
        document.dispatchEvent(new CustomEvent('close-all-popups'))

        sidebarContextMenu.style.left = `${x}px`
        sidebarContextMenu.style.top = `${y}px`
        sidebarContextMenu.classList.add('show')

        const rect = sidebarContextMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) {
            sidebarContextMenu.style.left = `${x - rect.width}px`
        }
        if (rect.bottom > window.innerHeight) {
            sidebarContextMenu.style.top = `${y - rect.height}px`
        }
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    document.addEventListener('click', () => hideAllMenus())

    document.getElementById('folderPanelClose')?.addEventListener('click', () => {
        closeFolderPanel()
    })

    document.getElementById('messengerList')?.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.messenger-item') || e.target.closest('.folder-item') || e.target.closest('.sidebar-divider')) return

        e.preventDefault()
        e.stopPropagation()
        showSidebarContextMenuAt(e.clientX, e.clientY)
    })

    document.querySelector('.activity-bar')?.addEventListener('contextmenu', (e) => {
        if (
            e.target.closest('.messenger-item') ||
            e.target.closest('.folder-item') ||
            e.target.closest('.sidebar-divider') ||
            e.target.closest('.activity-btn')
        ) return

        e.preventDefault()
        e.stopPropagation()
        showSidebarContextMenuAt(e.clientX, e.clientY)
    })

    // BUGFIX ("не удается создать больше 1 папки"): the only two ways to
    // open sidebarContextMenu (the two handlers above) require right-clicking
    // genuinely EMPTY pixel space in the messenger list / activity bar — space
    // that shrinks with every messenger/folder/divider added. Once the sidebar
    // fills up (a handful of messengers is enough), there's no empty pixel
    // left to right-click, so "New Folder" (and "Add Divider") become
    // permanently unreachable even though nothing about folder creation
    // itself is broken. Give it a second, always-reachable entry point on the
    // persistent "+" add-messenger button, which never scrolls out of view
    // regardless of sidebar contents.
    document.getElementById('addMessengerBtn')?.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        showSidebarContextMenuAt(e.clientX, e.clientY)
    })
}

module.exports = {
    bindSidebarShellUi
}