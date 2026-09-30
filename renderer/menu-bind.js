function bindMenuUi({
    state,
    store,
    ipcRenderer,
    menuToggleBtn,
    applyMenuCollapsed,
    applyAppZoom,
    openSettings
}) {
    document.querySelectorAll('.menu-item').forEach(item => {
        const label = item.querySelector('.menu-label')
        if (!label) return

        label.addEventListener('click', (e) => {
            e.stopPropagation()
            const isOpen = item.classList.contains('open')
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
            if (!isOpen) item.classList.add('open')
        })
    })

    document.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    menuToggleBtn.addEventListener('click', () => {
        state.menuCollapsed = !state.menuCollapsed
        store.set('menuCollapsed', state.menuCollapsed)
        applyMenuCollapsed()
    })

    document.getElementById('menuSettings').addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
        openSettings()
    })

    document.getElementById('menuQuit').addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
        ipcRenderer.send('quit-app', false)
    })

    // REDESIGN (2026-09-30, "убираем - отменить и повторить" — live
    // request): menuUndo/menuRedo dropped from this list along with their
    // elements in index.html — they're not relocated into #menuEdit, just
    // removed entirely.
    ;['menuCut', 'menuCopy', 'menuPaste', 'menuDelete', 'menuSelectAll'].forEach(id => {
        const cmds = {
            menuCut: 'cut',
            menuCopy: 'copy',
            menuPaste: 'paste',
            menuDelete: 'delete',
            menuSelectAll: 'selectAll'
        }

        document.getElementById(id).addEventListener('click', () => {
            document.execCommand(cmds[id])
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
        })
    })

    document.getElementById('menuAppZoomReset').addEventListener('click', () => {
        applyAppZoom(0)
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuAppZoomIn').addEventListener('click', () => {
        applyAppZoom(state.appZoomLevel + 1)
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuAppZoomOut').addEventListener('click', () => {
        applyAppZoom(state.appZoomLevel - 1)
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuFullscreen').addEventListener('click', () => {
        ipcRenderer.send('toggle-fullscreen')
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuHide').addEventListener('click', () => {
        ipcRenderer.send('minimize-window')
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuClose').addEventListener('click', () => {
        ipcRenderer.send('close-window')
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
    })

    document.getElementById('menuAbout').addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'))
        openSettings()
        setTimeout(() => {
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'))
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'))
            document.querySelector('[data-section="system"]').classList.add('active')
            document.getElementById('section-system').classList.add('active')
        }, 100)
    })
}

module.exports = {
    bindMenuUi
}