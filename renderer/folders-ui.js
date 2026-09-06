function createFoldersUiApi({
    state,
    store,
    folderPanel,
    messengerList,
    renderMessengerItem,
    addToSidebar,
    saveData
}) {
    function updateFolderBadge(folderId) {
        const folderEl = document.getElementById(`folder-${folderId}`)
        if (!folderEl) return

        const total = state.activeMessengers
            .filter(m => m.folderId === folderId)
            .reduce((sum, m) => sum + (state.unreadCounts[m.id] || 0), 0)

        const iconWrap = folderEl.querySelector('.folder-icon-wrap')
        if (!iconWrap) return

        let badge = iconWrap.querySelector('.folder-badge')
        if (total > 0) {
            if (!badge) {
                badge = document.createElement('span')
                badge.className = 'folder-badge'
                iconWrap.appendChild(badge)
            }
            badge.textContent = total > 99 ? '99+' : total
        } else {
            badge?.remove()
        }
    }

    function renderFolderPanel(folderId) {
        const content = document.getElementById('folderPanelContent')
        content.innerHTML = ''

        let panelDragSrcId = null

        state.activeMessengers
            .filter(m => m.folderId === folderId)
            .forEach(messenger => {
                const item = renderMessengerItem(messenger)
                item.removeAttribute('title')

                const count = state.unreadCounts[messenger.id] || 0
                if (count > 0) {
                    let badge = item.querySelector('.messenger-badge')
                    if (!badge) {
                        badge = document.createElement('span')
                        badge.className = 'messenger-badge'
                        item.appendChild(badge)
                    }
                    badge.textContent = count > 99 ? '99+' : count
                }

                item.setAttribute('draggable', 'true')
                item.style.cursor = 'grab'

                item.addEventListener('dragstart', (e) => {
                    panelDragSrcId = messenger.id
                    setTimeout(() => item.classList.add('dragging'), 0)
                    e.dataTransfer.effectAllowed = 'move'
                })
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging')
                    content.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom')
                        .forEach(el => el.classList.remove('drop-indicator-top', 'drop-indicator-bottom'))
                    panelDragSrcId = null
                })
                item.addEventListener('dragover', (e) => {
                    e.preventDefault()
                    if (!panelDragSrcId || panelDragSrcId === messenger.id) return
                    const rect = item.getBoundingClientRect()
                    const insertBefore = e.clientY < rect.top + rect.height / 2
                    content.querySelectorAll('.drop-indicator-top, .drop-indicator-bottom')
                        .forEach(el => el.classList.remove('drop-indicator-top', 'drop-indicator-bottom'))
                    item.classList.add(insertBefore ? 'drop-indicator-top' : 'drop-indicator-bottom')
                    e.dataTransfer.dropEffect = 'move'
                })
                item.addEventListener('dragleave', (e) => {
                    if (!item.contains(e.relatedTarget))
                        item.classList.remove('drop-indicator-top', 'drop-indicator-bottom')
                })
                item.addEventListener('drop', (e) => {
                    e.preventDefault()
                    item.classList.remove('drop-indicator-top', 'drop-indicator-bottom')
                    if (!panelDragSrcId || panelDragSrcId === messenger.id) return
                    const srcEl = content.querySelector(`#sidebar-${panelDragSrcId}`)
                    if (!srcEl) return
                    const rect = item.getBoundingClientRect()
                    const insertBefore = e.clientY < rect.top + rect.height / 2
                    if (insertBefore) content.insertBefore(srcEl, item)
                    else content.insertBefore(srcEl, item.nextSibling)
                    const srcIdx = state.activeMessengers.findIndex(m => m.id === panelDragSrcId)
                    const tgtIdx = state.activeMessengers.findIndex(m => m.id === messenger.id)
                    if (srcIdx !== -1 && tgtIdx !== -1) {
                        const [moved] = state.activeMessengers.splice(srcIdx, 1)
                        const newTgt = state.activeMessengers.findIndex(m => m.id === messenger.id)
                        state.activeMessengers.splice(insertBefore ? newTgt : newTgt + 1, 0, moved)
                        saveData()
                    }
                })

                content.appendChild(item)
            })
    }

    function updateFolderPanelPosition() {
        const activityBar = document.querySelector('.activity-bar')
        const rect = activityBar.getBoundingClientRect()
        folderPanel.style.left = `${rect.right}px`
        folderPanel.style.top = '36px'
        folderPanel.style.bottom = '26px'
    }

    function openFolderPanel(folderId) {
        const folder = state.folders.find(f => f.id === folderId)
        if (!folder) return

        document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('open'))
        state.activeFolderPanelId = folderId

        const folderEl = document.getElementById(`folder-${folderId}`)
        if (folderEl) folderEl.classList.add('open')

        document.getElementById('folderPanelName').textContent = folder.name
        renderFolderPanel(folderId)
        folderPanel.classList.add('open')
        document.querySelector('.main-container').classList.add('folder-panel-open')
        updateFolderPanelPosition()
    }

    function closeFolderPanel() {
        state.activeFolderPanelId = null
        folderPanel.classList.remove('open')
        document.querySelector('.main-container').classList.remove('folder-panel-open')
        document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('open'))
    }

    function toggleFolderPanel(folderId) {
        if (state.activeFolderPanelId === folderId) closeFolderPanel()
        else openFolderPanel(folderId)
    }

    function addToFolder(messenger, folderId) {
        const container = document.getElementById(`folder-children-${folderId}`)
        if (!container) return
        container.appendChild(renderMessengerItem(messenger))
        document.getElementById(`folder-${folderId}`)?.classList.add('open')
    }

    function removeFolder(folderId) {
        if (state.activeFolderPanelId === folderId) closeFolderPanel()
        state.activeMessengers.filter(m => m.folderId === folderId).forEach(m => {
            m.folderId = null
            if (typeof addToSidebar === 'function') addToSidebar(m)
        })
        document.getElementById(`folder-${folderId}`)?.remove()
        state.folders = state.folders.filter(f => f.id !== folderId)
        saveData()
    }

    function applyFoldersEnabled(enabled) {
        if (enabled) {
            document.querySelectorAll('.folder-item').forEach(f => { f.style.display = 'flex' })
            state.activeMessengers.forEach(m => {
                if (m.folderId) {
                    const el = document.getElementById(`sidebar-${m.id}`)
                    if (el && el.closest('.folder-item') === null) el.remove()
                }
            })
        } else {
            document.querySelectorAll('.folder-item').forEach(f => { f.style.display = 'none' })
            closeFolderPanel()
            // BUGFIX ("не сохраняет порядок сайдбара" / divider jumps to top):
            // this used to unconditionally remove+re-append EVERY messenger's
            // sidebar element, in raw state.activeMessengers array order (the
            // original messengers[] insertion order from config.json, NOT the
            // user's saved sidebarOrder). Since this runs via a 100ms
            // setTimeout scheduled in renderer.js loadData() *before*
            // loadOrder() but resolving *after* it, it silently clobbered the
            // correct DOM order loadOrder() had just built, on every single
            // startup where foldersEnabled === false. Divider elements were
            // never touched by this loop, so after every messenger got
            // stripped and pushed to the end, the divider (left in its
            // original loadOrder()-assigned position) ended up as the very
            // first child of messengerList — exactly the "огромный отступ,
            // там разделитель" symptom.
            // Fix: only extract messengers that are ACTUALLY still nested
            // inside a .folder-item container (i.e. genuinely need pulling
            // out to root level). Messengers already at root level got their
            // position from loadOrder() (or drag-and-drop) and must be left
            // untouched.
            let extractedCount = 0
            state.activeMessengers.forEach(m => {
                const el = document.getElementById(`sidebar-${m.id}`)
                if (el && el.closest('.folder-item')) {
                    el.remove()
                    messengerList.appendChild(renderMessengerItem(m))
                    extractedCount++
                }
            })
        }
        store.set('foldersEnabled', enabled)
    }

    return {
        updateFolderBadge,
        renderFolderPanel,
        updateFolderPanelPosition,
        openFolderPanel,
        closeFolderPanel,
        toggleFolderPanel,
        addToFolder,
        removeFolder,
        applyFoldersEnabled
    }
}

module.exports = {
    createFoldersUiApi
}