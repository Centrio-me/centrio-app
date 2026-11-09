const { getVisualMessengerOrder } = require('./tab-order')
const { openNotifiedChat } = require('./notif-open-chat')
const { sendReply } = require('./notif-reply')
const { pickNotificationTarget } = require('./notif-target')

const { SUPPORT_NOTIFICATION_PREFIX } = require('./support-tickets-ui')

function bindWindowUi({
    store,
    state,
    ipcRenderer,
    switchTab,
    showLockScreen,
    openSettings,
    exitSplitMode,
    getSplitApi = () => null,
    detachMessenger = null
}) {
    // Opens the messenger a notification belongs to, respecting the split on screen and the person's choice.
    function openForNotification(messengerId) {
        const splitApi = getSplitApi()
        const choice = (store.get('notifOpenIn', {}) || {})[messengerId]
        const presets = splitApi?.getPresets?.() || []
        const target = pickNotificationTarget({ state, id: messengerId, choice, presets })
        if (target.kind === 'pane' && splitApi?.focusPresetMember) {
            splitApi.focusPresetMember(messengerId)
            return
        }
        if (target.kind === 'window' && typeof detachMessenger === 'function') {
            detachMessenger(messengerId)
            return
        }
        if (target.kind === 'preset' && splitApi?.applyPreset) {
            const alreadyOpen = state.splitMode && state.splitPresetId === target.presetId
            if (alreadyOpen || splitApi.applyPreset(target.presetId)) {
                splitApi.focusPresetMember(messengerId)
                return
            }
        }
        if (state.splitMode && typeof exitSplitMode === 'function') exitSplitMode()
        switchTab(messengerId)
    }

    document.getElementById('minimizeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('minimize-window')
    })

    document.getElementById('maximizeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('maximize-window')
    })

    document.getElementById('closeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('close-window')
    })

    ipcRenderer.on('app-hidden', () => {
        const sec = store.get('security', {})
        if (sec.enabled && sec.lockOnHide) showLockScreen()
    })

    // Отправляется из main/ipc/window.js: при сворачивании/скрытии в трей (lockOnHide,
    // дублирует проверку 'app-hidden' выше на случай другого пути скрытия окна) и при
    // срабатывании автоблокировки по бездействию (powerMonitor.getSystemIdleTime()).
    ipcRenderer.on('show-lock-screen', () => {
        const sec = store.get('security', {})
        if (sec.enabled && sec.hash) showLockScreen()
    })

    ipcRenderer.on('switch-messenger-index', (index) => {
        const target = getVisualMessengerOrder(state)[index]
        if (target) switchTab(target.id)
    })

    ipcRenderer.on('switch-messenger-next', () => {
        const order = getVisualMessengerOrder(state)
        if (!order.length) return
        const idx = order.findIndex(m => m.id === state.activeTabId)
        if (idx === -1) return
        switchTab(order[(idx + 1) % order.length].id)
    })

    ipcRenderer.on('switch-messenger-prev', () => {
        const order = getVisualMessengerOrder(state)
        if (!order.length) return
        const idx = order.findIndex(m => m.id === state.activeTabId)
        if (idx === -1) return
        switchTab(order[(idx - 1 + order.length) % order.length].id)
    })

    ipcRenderer.on('reload-active', () => {
        if (!state.activeTabId) return
        document.getElementById(`webview-${state.activeTabId}`)?.reload()
    })

    ipcRenderer.on('open-settings', () => {
        if (typeof openSettings === 'function') openSettings()
    })

    // Same parameter-shape bug as auto-launch-result in settings-bind.js —
    // preload's .on() wrapper passes the payload only, no event object, so
    // messengerId was always undefined and clicking a notification never
    // actually switched to that messenger's tab.
    //
    // BUGFIX ("уведомление ломает пресет"): switchTab() deliberately
    // special-cases state.splitMode to route clicks into whichever
    // pane/zone currently has FOCUS (see switchTab() in renderer.js) —
    // that's correct for user-driven sidebar/tab clicks, but a notification
    // click isn't the user picking a pane, it's the user saying "show me
    // this message". Calling switchTab() as-is silently overwrote whatever
    // messenger occupied the focused split pane with the notification's
    // messenger, destroying the user's split arrangement. Exit split mode
    // first so switchTab() falls through to its normal single-tab path —
    // the clicked messenger is shown full-size and nothing else in the
    // (now closed) split/preset gets reassigned or lost.
    // A reply typed into a notification pop-up: put it into the right chat and report whether it went out.
    ipcRenderer.on('notification-reply', async (payload) => {
        if (!payload || !payload.replyId) return
        const messenger = (state.activeMessengers || []).find(m => m.id === payload.messengerId)
        const result = await sendReply(messenger, payload.nid, payload.text, { title: payload.title, body: payload.body, peer: payload.peer }, (outcome, diag) => {
            if (outcome === 'ok' && !(diag && diag.dup)) return
            const flags = ['id', 'nav', 'dom', 'msgs', 'dup'].map((k) => k + (diag && diag[k] ? 1 : 0)).join(' ') + (diag && diag.boxes != null ? ' boxes' + diag.boxes : '')
            ipcRenderer.send('notif-diag', { messenger: messenger && messenger.name, tag: 'reply', decision: outcome + ' ' + flags })
        })
        ipcRenderer.send('notification-reply-result', payload.replyId, result)
    })

    ipcRenderer.on('notification-open-chat', (payload) => {
        if (!payload || !payload.messengerId) return
        const { messengerId, nid, url } = payload
        const openByLink = () => {
            if (!url) return
            const messenger = (state.activeMessengers || []).find(m => m.id === messengerId)
            const webview = document.getElementById(`webview-${messengerId}`)
            if (!messenger || !webview || typeof webview.loadURL !== 'function') return
            try {
                // same site only: the link comes from the content of a third-party page
                if (new URL(url).hostname !== new URL(messenger.url).hostname) return
                webview.loadURL(url)
            } catch {}
        }
        if (nid) openNotifiedChat(messengerId, nid, openByLink)
        else openByLink()
    })

    ipcRenderer.on('notification-clicked-id', (messengerId) => {
        if (!messengerId) return
        if (String(messengerId).startsWith(SUPPORT_NOTIFICATION_PREFIX)) {
            document.dispatchEvent(new CustomEvent('open-support-ticket', { detail: { id: messengerId.slice(SUPPORT_NOTIFICATION_PREFIX.length) } }))
            return
        }
        openForNotification(messengerId)
    })

    // 3.7.3: the notification centre (bell) opens a messenger the same way as a pop-up notification
    // (stays in the split, or the preset / own window chosen for it) — renderer/app-notif-bind.js
    window.__centrioOpenForNotification = openForNotification

    // 3.7.3: another service asked to open a link that belongs to a tab the person already has (Yandex Mail -> Alice):
    // that tab comes to the front and opens it. The main process found the tab by its exact host; checked here again.
    ipcRenderer.on('open-link-in-tab', (payload) => {
        const messengerId = payload && payload.messengerId
        const url = payload && payload.url
        const messenger = (state.activeMessengers || []).find((m) => m.id === messengerId)
        if (!messenger || typeof url !== 'string') return
        // same scheme, host (www ignored) and port as the tab, like main/services/linkRouting.js
        const key = (raw) => { try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname.replace(/^www\./, '')}:${u.port}` : '' } catch { return '' } }
        if (!key(url) || key(url) !== key(messenger.url)) return
        const openOutside = () => ipcRenderer.send('open-url', url) // the link is never lost
        const before = document.getElementById(`webview-${messengerId}`)
        // a call or a video playing in that tab is not interrupted
        try { if (before && typeof before.isCurrentlyAudible === 'function' && before.isCurrentlyAudible()) { openOutside(); return } } catch {}
        openForNotification(messengerId) // also wakes a sleeping tab
        if (state.detachedTabs && state.detachedTabs.has(messengerId)) { openOutside(); return }
        const webview = document.getElementById(`webview-${messengerId}`)
        if (!webview || typeof webview.loadURL !== 'function') { openOutside(); return }
        const load = () => { try { webview.loadURL(url).catch(openOutside) } catch { openOutside() } }
        // a tab that was asleep is just loading again: open the link once its page is ready
        let ready = false
        try { ready = typeof webview.getWebContentsId === 'function' && !!webview.getWebContentsId() && !webview.isLoading() } catch { ready = false }
        if (ready) load()
        else webview.addEventListener('dom-ready', load, { once: true })
    })
}

module.exports = {
    bindWindowUi
}