const { adapterFor } = require('./notif-reply')

const DUPLICATE_WINDOW_MS = 8000

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
        if (payload.tag !== 'unread-fallback') state.lastSiteNotifyAt[messenger.id] = Date.now()
        const settings = store.get('settings', {})
        // What happened to every notification, without its content: a note for the log (main/ipc/notifications.js),
        // so a "no notification came" report can be traced to the exact reason.
        const note = (decision) => { try { ipcRenderer.send('notif-diag', { messenger: messenger.name || '', decision, tag: payload.tag === 'unread-fallback' ? 'fallback' : 'site' }) } catch {} }
        if (settings.notifications === false) { note('off-in-settings'); return }
        if (isMessengerMuted(messenger.id)) { note('messenger-muted'); return }

        const title = String(payload.title || messenger.name || tGet('notifications.messageTitle')).trim()
        const body = String(payload.body || tGet('notifications.newMessage')).trim()
        const tag = String(payload.tag || '')

        // The same message often arrives twice: a site fires Notification AND the service worker's
        // showNotification, usually with a different tag. Same sender (title) and same text within a few seconds is
        // one message; two different senders writing "ok" are not merged (the unread-count fallback keeps its own key).
        const dedupeKey = tag === 'unread-fallback'
            ? `${messenger.id}::unread-fallback`
            : `${messenger.id}::${title}::${body}`
        const now = Date.now()
        const prevTime = state.siteNotificationState[dedupeKey] || 0
        if (now - prevTime < DUPLICATE_WINDOW_MS) { note('duplicate-within-8s'); return }
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
            // The main process answers with the state itself ({ visible, focused, minimized }), not wrapped in
            // { success, data }. Reading it as wrapped made every window look "focused", so a minimized, hidden or
            // covered app never showed a notification for the messenger tab that happened to be open.
            const data = result && typeof result.visible === 'boolean' ? result : (result && result.success ? result.data : null)
            if (data) winState = data
        } catch {}

        const appInForeground = winState.visible && !winState.minimized && winState.focused
        const shouldPlaySound = settings.notifSound !== false
        // A notification the site itself raised is already the site's decision that this message needs attention
        // (Telegram, for instance, raises one for another chat even while its tab is open and focused), and the
        // site's own system toast is suppressed, so it is always shown. Only the app's own "unread count grew"
        // fallback keeps the old rule of staying quiet while the tab is in front.
        const isFallback = tag === 'unread-fallback'
        const shouldShowNotification = !isFallback || !appInForeground || (!isActiveTab && !isVisibleInSplit)

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
            addMessengerNotification(title, body, messenger.name, messenger.id, actionUrl, payload.nid)
        }

        if (shouldPlaySound) playNotifSound(messenger.id)
        if (!shouldShowNotification) { note('fallback-skipped-tab-in-front'); return }
        note('shown')

        // The toast carries the sender (the site's own title), the text, and the sender's picture when the site
        // sent one; otherwise the messenger's icon. Same format for every message, whatever the site.
        ipcRenderer.send('show-notification', {
            title: title || messenger.name,
            body: body || tGet('notifications.newMessage'),
            icon: payload.icon || messenger.icon || '',
            messengerId: messenger.id,
            nid: payload.nid || '',
            url: actionUrl || '',
            app: messenger.name || '',
            canReply: !!(payload.nid && adapterFor(messenger.url)),
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
    // "Количество выросло, а сайт промолчал" (2026-10-05, "во ВКонтакте не приходит всплывающее уведомление
    // Windows"): часть сайтов (ВК) не вызывает Notification API, пока считает окно активным, поэтому
    // всплывашки не было, хотя бейдж рос. Если число непрочитанных выросло и сайт сам не присылал
    // уведомлений последние 10 минут, показываем своё. Первый замер после загрузки страницы не считается.
    const lastUnreadSeen = {}
    const FALLBACK_DELAY_MS = 3500
    const SITE_SILENT_MS = 10 * 60 * 1000

    function scheduleUnreadFallback(messengerId, delta) {
        setTimeout(() => {
            if (Date.now() - (state.lastSiteNotifyAt[messengerId] || 0) < SITE_SILENT_MS) return
            const messenger = (state.activeMessengers || []).find(m => m.id === messengerId)
            if (!messenger) return
            const body = delta > 1
                ? (tGet('notifications.newMessagesCount', { count: delta }) || `Новых сообщений: ${delta}`)
                : (tGet('notifications.newMessage') || 'Новое сообщение')
            sendPushNotificationFromSite(messenger, { title: messenger.name, body, tag: 'unread-fallback' })
        }, FALLBACK_DELAY_MS)
    }

    ipcRenderer?.on?.('messenger-unread-count', (messengerId, count) => {
        if (!messengerId) return
        const n = Number.isFinite(count) && count >= 0 ? count : 0
        updateUnreadCount(messengerId, n)
        const before = lastUnreadSeen[messengerId]
        lastUnreadSeen[messengerId] = n
        if (before !== undefined && n > before) scheduleUnreadFallback(messengerId, n - before)
    })

    // Sign-in state of the page (see startLoginStatePolling in main); org-team.js reports it to the owner.
    ipcRenderer?.on?.('messenger-login-state', (messengerId, value) => {
        if (!messengerId || (value !== 'in' && value !== 'out')) return
        if (state.loginStates[messengerId] === value) return
        state.loginStates[messengerId] = value
        document.dispatchEvent(new CustomEvent('login-state-changed', { detail: { messengerId, state: value } }))
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