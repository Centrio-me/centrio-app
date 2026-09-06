function createWebviewNotifyApi({
    state,
    store,
    tGet,
    ipcRenderer,
    invokeIpc,
    playNotifSound,
    isMessengerMuted,
    updateUnreadCount,
    addMessengerNotification
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

        // BUGFIX (Item №6 — "уведомления дублируются в сплит-экране"):
        // раньше видимость проверялась только по state.activeTabId, то есть
        // мессенджер в НЕ-основной панели сплита (splitTabId в 2col,
        // остальные зоны в 3col/2x2/2top1bottom/1top2bottom) всегда считался
        // "неактивным" и получал полноценный OS-нотиф, даже если сообщение
        // уже видно прямо на экране рядом с основной вкладкой. Основная
        // (zone 0 / activeTabId) панель уже покрыта isActiveTab выше — эта
        // проверка нужна именно для остальных видимых панелей.
        const isVisibleInSplit = state.splitMode && (
            state.splitLayout === '2col'
                ? state.splitTabId === messenger.id
                : Array.isArray(state.splitZoneIds) && state.splitZoneIds.includes(messenger.id)
        )

        let winState = { visible: true, focused: true, minimized: false }
        try {
            const result = await invokeIpc('get-window-visibility-state')
            if (result.success && result.data) winState = result.data
        } catch {}

        const appInForeground = winState.visible && !winState.minimized && winState.focused
        const shouldPlaySound = settings.notifSound !== false
        const shouldShowNotification = !appInForeground || (!isActiveTab && !isVisibleInSplit)

        // ── Count notification regardless of whether we show OS popup ──
        // Tagged with the messenger's display name so it lines up with the
        // service key used by tracker:service-time (see switchTab's
        // _tkPrevName in renderer.js) — keeps the dashboard's per-service
        // breakdown consistent instead of always showing 0.
        invokeIpc('tracker:notif', 1, messenger.name || null).catch(() => {})

        // ── A site-fired notification is the most reliable, source-agnostic
        // signal we have that a new message arrived (arbitrary web content
        // makes DOM-level "message received" detection unreliable across
        // different messengers) ──
        invokeIpc('tracker:msg-received', 1).catch(() => {})

        // ── Кандидат-ссылка на конкретный чат/сообщение (см. payload.url —
        // извлекается из options.data патч-скриптами в registerAppEvents.js
        // и swNotifPatcher.js) — используется при клике по записи в центре
        // уведомлений вместо простого переключения на вкладку мессенджера.
        // Резолвим относительно messenger.url на случай относительного пути
        // ("/chat/123"); если формат невалиден — просто не даём actionUrl.
        let actionUrl = null
        if (payload.url) {
            try { actionUrl = new URL(payload.url, messenger.url).href } catch {}
        }

        // ── Добавляем в панель уведомлений как уведомление от мессенджера ──
        if (typeof addMessengerNotification === 'function') {
            addMessengerNotification(title, body, messenger.name, messenger.id, actionUrl)
        }

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
                // Приходит из webview-preload.js — сейчас на этой версии
                // Electron не исполняется для <webview> (см. комментарий в
                // начале webview-preload.js), основной канал детекта теперь
                // 'messenger-unread-count' ниже. Оставлено на случай, если
                // preload когда-нибудь снова заработает сам по себе.
                const rawCount = Number(e.args[0])
                const count = Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : 0
                updateUnreadCount(messenger.id, count)
                return
            }

            if (e.channel === 'site-notification') {
                const payload = e.args[0] || {}
                sendPushNotificationFromSite(messenger, payload)
                return
            }

            if (e.channel === 'msg-sent') {
                invokeIpc('tracker:msg-sent').catch(() => {})
            }
        })
    }

    // Основной канал детекта непрочитанных — main-процесс сам опрашивает
    // каждую гостевую страницу через executeJavaScript (см.
    // main/bootstrap/registerAppEvents.js, startUnreadPolling) и шлёт сюда
    // результат напрямую, в обход preload/webview 'ipc-message' выше.
    ipcRenderer?.on?.('messenger-unread-count', (messengerId, count) => {
        if (!messengerId) return
        const n = Number.isFinite(count) && count >= 0 ? count : 0
        updateUnreadCount(messengerId, n)
    })

    // ── Site-уведомления (Notification/SW showNotification), пойманные
    // main-процессом через executeJavaScript на dom-ready (см.
    // main/bootstrap/registerAppEvents.js, startNotifPolling) — в обход
    // preload, который на текущей версии Electron не исполняется для
    // <webview> вообще (та же причина, что и у 'messenger-unread-count' выше).
    ipcRenderer?.on?.('messenger-site-notification', (messengerId, payload) => {
        if (!messengerId) return
        const messenger = (state.activeMessengers || []).find(m => m.id === messengerId)
        if (!messenger) return
        sendPushNotificationFromSite(messenger, payload || {})
    })

    return {
        sendPushNotificationFromSite,
        watchWebview
    }
}

module.exports = {
    createWebviewNotifyApi
}