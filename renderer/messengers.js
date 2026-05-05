function createMessengersApi({
    state,
    store,
    ipcRenderer,
    invokeIpc,
    tGet,
    preloadPath,
    messengerList,
    tabsBar,
    tabsContent,
    welcomeScreen,
    webviewContextMenu,
    showTooltip,
    hideTooltip,
    playNotifSound,
    updateStatusBar,
    updateFolderBadge,
    updateUnreadCount,
    updateMuteIcon,
    isMessengerMuted,
    resetMessengerNotifyState,
    hideAllMenus,
    showContextMenu,
    initDrag,
    initDropTarget,
    saveData,
    getTabZoomLevel
}) {
    async function sendPushNotificationFromSite(messenger, payload = {}) {
        const settings = store.get('settings', {})
        if (settings.notifications === false) return
        if (isMessengerMuted(messenger.id)) return

        const title = String(payload.title || messenger.name || tGet('notifications.messageTitle')).trim()
        const body = String(payload.body || tGet('notifications.newMessage')).trim()
        const tag = String(payload.tag || '')
        const icon = payload.icon || messenger.icon || ''

        const dedupeKey = `${messenger.id}::${title}::${body}::${tag}`
        const now = Date.now()
        const prevTime = state.siteNotificationState[dedupeKey] || 0
        if (now - prevTime < 5000) return
        state.siteNotificationState[dedupeKey] = now

        const isActiveTab = state.activeTabId === messenger.id

        let winState = { visible: true, focused: true, minimized: false }
        try {
            const result = await invokeIpc('get-window-visibility-state')
            if (result.success && result.data) winState = result.data
        } catch {}

        const appInForeground = winState.visible && !winState.minimized && winState.focused
        const shouldPlaySound = settings.notifSound !== false && (!isActiveTab || !appInForeground)
        const shouldShowNotification = !appInForeground || !isActiveTab

        if (shouldPlaySound) playNotifSound(messenger.id)
        if (!shouldShowNotification) return

        ipcRenderer.send('show-notification', {
            title: messenger.name || title,
            body: body || tGet('notifications.newMessage'),
            icon,
            messengerId: messenger.id,
            silent: true
        })
    }

    function watchWebview(webview, messenger) {
        if (state.webviewWatchBound.has(webview.id)) return
        state.webviewWatchBound.add(webview.id)

        webview.addEventListener('ipc-message', (e) => {
            if (e.channel === 'unread-count') {
                const rawCount = Number(e.args[0])
                const count = Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : 0
                updateUnreadCount(messenger.id, count)
                return
            }

            if (e.channel === 'site-notification') {
                const payload = e.args[0] || {}
                sendPushNotificationFromSite(messenger, payload)
            }
        })
    }

    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function createMessengerItem(messenger) {
        const item = document.createElement('div')
        item.className = 'messenger-item'
        item.id = `sidebar-${messenger.id}`

        const hostname = (() => {
            try {
                return new URL(messenger.url).hostname
            } catch {
                return ''
            }
        })()

        const iconSources = [
            messenger.icon,
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            `https://icon.horse/icon/${hostname}`
        ]

        item.innerHTML = `
            <img class="messenger-icon"
                 src="${escHtml(iconSources[0])}"
                 alt="${escHtml(messenger.name)}"
                 data-sources="${escHtml(JSON.stringify(iconSources))}"
                 data-index="0">
            <span class="messenger-name">${escHtml(messenger.name)}</span>
        `

        const img = item.querySelector('img')
        img.addEventListener('error', function () {
            const sources = JSON.parse(this.dataset.sources)
            const nextIndex = parseInt(this.dataset.index) + 1

            if (nextIndex < sources.length) {
                this.dataset.index = nextIndex
                this.src = sources[nextIndex]
            } else {
                this.style.display = 'none'
                const letter = document.createElement('div')
                letter.className = 'messenger-letter'
                letter.textContent = messenger.name[0].toUpperCase()
                this.parentElement.insertBefore(letter, this)
            }
        })

        item.addEventListener('click', () => switchTab(messenger.id))
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            showContextMenu(e, messenger.id)
        })

        if (isMessengerMuted(messenger.id)) updateMuteIcon(messenger.id)
        initDrag(item, messenger.id, 'messenger')
        initDropTarget(item, messenger.id, 'messenger')

        item.addEventListener('mouseenter', () => {
            if (item.closest('.folder-panel-content')) return
            showTooltip(item, messenger.name, state.unreadCounts[messenger.id] || 0)
        })

        item.addEventListener('mouseleave', hideTooltip)
        return item
    }

    function addTab(messenger) {
        const tab = document.createElement('div')
        tab.className = 'tab'
        tab.id = `tab-${messenger.id}`

        const hostname = (() => {
            try {
                return new URL(messenger.url).hostname
            } catch {
                return ''
            }
        })()

        tab.innerHTML = `
            <img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32"
                 onerror="this.style.display='none'" width="16" height="16"
                 style="border-radius:6px;flex-shrink:0;">
            <span class="tab-name" style="overflow:hidden;text-overflow:ellipsis;">${messenger.name}</span>
            <span class="tab-close" data-id="${messenger.id}">✕</span>
        `

        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) switchTab(messenger.id)
        })

        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation()
            removeMessenger(messenger.id)
        })

        tabsBar.appendChild(tab)
    }

    function attachFindListener(webview) {
        webview.addEventListener('found-in-page', (e) => {
            const { activeMatchOrdinal, matches } = e.result
            const findCount = document.getElementById('findCount')
            if (!findCount) return

            if (matches > 0) {
                findCount.textContent = `${activeMatchOrdinal} / ${matches}`
                findCount.style.color = 'var(--text-secondary)'
            } else {
                findCount.textContent = tGet('search.notFound')
                findCount.style.color = 'var(--danger)'
            }
        })
    }

    function attachContextMenu(webview) {
        webview.addEventListener('ipc-message', (e) => {
            if (e.channel === 'close-context-menu') {
                webviewContextMenu.classList.remove('show')
                return
            }

            if (e.channel === 'image-data') {
                const dataUrl = e.args[0]
                if (dataUrl) ipcRenderer.send('save-image-data', dataUrl, state.wvContextParams._filePath || '')
                return
            }

            if (e.channel !== 'context-menu') return

            const params = e.args[0]
            state.wvContextParams = params

            document.querySelectorAll('.context-menu').forEach((m) => m.classList.remove('show'))
            document.getElementById('wvSaveImage').style.display = params.mediaType === 'image' ? 'flex' : 'none'

            webviewContextMenu.style.left = `${params.x}px`
            webviewContextMenu.style.top = `${params.y}px`
            webviewContextMenu.classList.add('show')

            requestAnimationFrame(() => {
                const rect = webviewContextMenu.getBoundingClientRect()
                if (rect.right > window.innerWidth) webviewContextMenu.style.left = `${params.x - rect.width}px`
                if (rect.bottom > window.innerHeight) webviewContextMenu.style.top = `${params.y - rect.height}px`
            })
        })
    }

    function addWebview(messenger) {
        const webview = document.createElement('webview')
        webview.id = `webview-${messenger.id}`
        webview.src = messenger.url
        webview.setAttribute('allowpopups', 'true')
        webview.setAttribute('partition', `persist:${messenger.id}`)
        webview.setAttribute(
            'useragent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        if (preloadPath) {
            webview.setAttribute('preload', preloadPath)
        }

        webview.addEventListener('new-window', (e) => {
            e.preventDefault()
            const url = e.url
            if (!url || url === 'about:blank') return
            if (url.startsWith('chrome-extension://')) {
                invokeIpc('open-popup-window', url, {
                    width: 400,
                    height: 600,
                    partition: `persist:${messenger.id}`
                }).catch(() => {})
            } else {
                ipcRenderer.send('open-url', url)
            }
        })

        webview.addEventListener('will-navigate', (e) => {
            const url = e.url
            if (!url) return
            try {
                const messengerHost = new URL(messenger.url).hostname
                const navHost = new URL(url).hostname
                if (navHost !== messengerHost && !url.startsWith('file://')) {
                    e.preventDefault()
                    ipcRenderer.send('open-url', url)
                }
            } catch {}
        })

        webview.addEventListener('did-fail-load', (e) => {
            if (e.errorCode !== -3) webview.loadURL(messenger.url)
        })

        watchWebview(webview, messenger)
        attachFindListener(webview)
        attachContextMenu(webview)

        tabsContent.appendChild(webview)
        tabsContent.style.pointerEvents = 'auto'
        invokeIpc('ext:apply-to-session', `persist:${messenger.id}`).catch(() => {})
    }

    function addMessenger(messenger) {
        const id = Date.now().toString()
        const sameCount = state.activeMessengers.filter((m) => m.name.startsWith(messenger.name)).length
        const newName = sameCount > 0 ? `${messenger.name} ${sameCount + 1}` : messenger.name

        const newMessenger = {
            ...messenger,
            id,
            name: newName,
            folderId: null,
            notifSound: '__default__'
        }

        state.activeMessengers.push(newMessenger)
        const item = createMessengerItem(newMessenger)
        messengerList.appendChild(item)
        item.classList.add('just-added')
        item.addEventListener('animationend', () => item.classList.remove('just-added'), { once: true })

        addTab(newMessenger)
        addWebview(newMessenger)
        switchTab(id)

        welcomeScreen.style.display = 'none'
        state.rawUnreadCounts[id] = 0
        state.unreadCounts[id] = 0
        resetMessengerNotifyState(id, 0)

        saveData()
        updateStatusBar()
    }

    function switchTab(id) {
        state.activeTabId = id

        document.querySelectorAll('.messenger-item').forEach((item) => item.classList.remove('active'))
        const sidebarItem = document.getElementById(`sidebar-${id}`)
        if (sidebarItem) {
            sidebarItem.classList.add('active')
            const folderChildren = sidebarItem.closest('.folder-children')
            if (folderChildren) folderChildren.closest('.folder-item')?.classList.add('open')
        }

        document.querySelectorAll('.tab').forEach((tEl) => tEl.classList.remove('active'))
        const tab = document.getElementById(`tab-${id}`)
        if (tab) {
            tab.classList.add('active')
            tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }

        document.querySelectorAll('webview').forEach((wv) => wv.classList.remove('active'))
        const activeWebview = document.getElementById(`webview-${id}`)
        if (activeWebview) {
            activeWebview.classList.add('active')
            activeWebview.setZoomFactor(getTabZoomLevel())
        }
    }

    function removeMessenger(id) {
        const messenger = state.activeMessengers.find((m) => m.id === id)
        const folderId = messenger?.folderId

        state.activeMessengers = state.activeMessengers.filter((m) => m.id !== id)
        delete state.unreadCounts[id]
        delete state.rawUnreadCounts[id]
        delete state.mutedMessengers[id]
        delete state.messengerNotifyState[id]
        state.webviewWatchBound.delete(`webview-${id}`)

        document.getElementById(`sidebar-${id}`)?.remove()
        document.getElementById(`tab-${id}`)?.remove()
        document.getElementById(`webview-${id}`)?.remove()

        if (folderId) updateFolderBadge(folderId)

        if (state.activeMessengers.length > 0) {
            switchTab(state.activeMessengers[state.activeMessengers.length - 1].id)
        } else {
            welcomeScreen.style.display = 'flex'
            state.activeTabId = null
        }

        tabsContent.style.pointerEvents = state.activeMessengers.length > 0 ? 'auto' : 'none'
        saveData()
        store.set('mutedMessengers', state.mutedMessengers)
        updateStatusBar()
    }

    return {
        sendPushNotificationFromSite,
        watchWebview,
        createMessengerItem,
        addTab,
        attachFindListener,
        attachContextMenu,
        addWebview,
        addMessenger,
        switchTab,
        removeMessenger
    }
}

module.exports = {
    createMessengersApi
}