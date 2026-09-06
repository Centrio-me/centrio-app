// Привязка уведомлений приложения (от администратора / changelog).
// Панель встроена в раскладку правого сайдбара (см. #rightPanel в
// renderer.js) — открытие/закрытие делает общий контроллер
// openRightPanel/closeRightPanel, этот модуль отвечает только за
// содержимое списка.
function bindAppNotifUi({
    cloudStore,
    invokeIpc,
    ipcRenderer,
    authorizedInvoke,
    tGet,
    state,
    toggleMuteAll,
    switchTab,
    openRightPanel,
    closeRightPanel
}) {
    const btn          = document.getElementById('appNotifBtn')
    const panel        = document.getElementById('appNotifPanel')
    const badge        = document.getElementById('appNotifBadge')
    const list         = document.getElementById('appNotifList')
    const markAllBtn   = document.getElementById('appNotifMarkAllRead')
    const deleteAllBtn = document.getElementById('appNotifDeleteAll')
    const muteToggle   = document.getElementById('appNotifMuteToggle')

    if (!btn || !panel) return

    let notifications = []
    // Панель теперь встроена в раскладку и её открытие/закрытие управляется
    // общим контроллером в renderer.js (может закрыться из-за клика по
    // ДРУГОЙ кнопке правого сайдбара) — поэтому вместо своего "open"-флага
    // читаем актуальное состояние прямо из DOM.
    const isPanelOpen = () => panel.classList.contains('active')

    // ── Локальные (от мессенджеров) vs облачные (от админки) уведомления ────────
    // Локальные записи (addMessengerNotification) персистятся через main-процесс
    // (main/ipc/appNotifications.js, store-ключ messengerNotifHistory) и несут
    // id вида "local-...". Облачные приходят из fetchNotifications() и несут
    // серверный id. Различаем по префиксу, чтобы periodic-опрос облака мог
    // безопасно заменять только "свою" часть массива, не стирая локальные.
    function isLocalNotifId(id) {
        return typeof id === 'string' && id.startsWith('local-')
    }

    function sortNotifications() {
        notifications.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    }

    // ── Dismiss (навсегда скрыть) ──────────────────────────────────────────────
    const DISMISSED_KEY = 'centrio-dismissed-notifs'

    function getDismissed() {
        try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) }
        catch { return new Set() }
    }

    function dismiss(id) {
        const set = getDismissed()
        set.add(id)
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
        notifications = notifications.filter(n => n.id !== id)
        updateBadge()
        renderPanel()
    }

    function getVisible() {
        const dismissed = getDismissed()
        return notifications.filter(n => !dismissed.has(n.id))
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function getToken() {
        return cloudStore?.isLoggedIn?.() ? cloudStore.getToken?.() : null
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr)
            const now = new Date()
            const diffMs = now - d
            const diffMins = Math.floor(diffMs / 60000)
            if (diffMins < 1) return tGet('notifications.justNow') || 'just now'
            if (diffMins < 60) return (tGet('notifications.minAgo') || '{n} min ago').replace('{n}', diffMins)
            const diffH = Math.floor(diffMins / 60)
            if (diffH < 24) return (tGet('notifications.hAgo') || '{n} h ago').replace('{n}', diffH)
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        } catch { return '' }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    // ── Клик по записи → переход к нужному чату ─────────────────────────────────
    // BUGFIX/FEATURE ("нажимать на уведомление - переходишь к этому сообщению"):
    // раньше клик по записи вообще ничего не делал (только кнопка dismiss/action
    // работали). Теперь: переключаемся на вкладку мессенджера (switchTab), и если
    // у записи есть actionUrl (см. sendPushNotificationFromSite в
    // webview-notify.js) — дополнительно навигируем webview этой вкладки на
    // конкретный чат/сообщение. Same-origin проверка перед loadURL — actionUrl
    // формально приходит из нашего же main-процесса, но в основе лежит
    // произвольный URL, извлечённый из контента стороннего сайта
    // (options.data), поэтому не доверяем ему без сверки хоста с самим
    // мессенджером.
    function openNotificationTarget(n) {
        if (!n) return

        if (!n.isRead) {
            n.isRead = true
            updateBadge()
        }

        if (n.messengerId && typeof switchTab === 'function') {
            try { switchTab(n.messengerId) } catch {}
        }

        if (!n.actionUrl || !n.messengerId) return

        const messenger = (state?.activeMessengers || []).find(m => m.id === n.messengerId)
        if (!messenger) return

        try {
            const targetHost = new URL(n.actionUrl).hostname
            const ownHost = new URL(messenger.url).hostname
            if (targetHost !== ownHost) return

            const webview = document.getElementById(`webview-${n.messengerId}`)
            if (webview && typeof webview.loadURL === 'function') {
                webview.loadURL(n.actionUrl)
            }
        } catch {}
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    function renderPanel() {
        if (!list) return

        const visible = getVisible()

        if (!visible.length) {
            list.innerHTML = `<div class="app-notif-empty">${tGet('notifications.noNotifs')}</div>`
            return
        }

        list.innerHTML = visible.map(n => {
            const imgHtml = n.imageUrl
                ? `<img class="app-notif-item-img" src="${escapeHtml(n.imageUrl)}" alt="" loading="lazy">`
                : ''

            const actionHtml = n.actionLabel && n.actionUrl
                ? `<button class="app-notif-action-btn" data-open-url="${escapeHtml(n.actionUrl)}">${escapeHtml(n.actionLabel)}</button>`
                : ''

            // ── Иконка мессенджера-источника ── подтягиваем из state.activeMessengers
            // по messengerId (см. addMessengerNotification/sendPushNotificationFromSite);
            // облачные (админ/changelog) записи и записи от уже удалённых вкладок
            // остаются с логотипом приложения — messengerId у них либо нет, либо
            // мессенджер больше не найден.
            const sourceMessenger = n.messengerId
                ? (state?.activeMessengers || []).find(m => m.id === n.messengerId)
                : null
            const avatarSrc = sourceMessenger?.icon || '../assets/logo.png'
            const unreadDotHtml = n.isRead ? '' : '<span class="app-notif-unread-dot"></span>'
            const clickable = !!(n.messengerId || (n.actionLabel && n.actionUrl))

            return `
                <div class="app-notif-item ${n.isRead ? '' : 'unread'} ${clickable ? 'clickable' : ''}" data-id="${escapeHtml(n.id)}">
                    <button class="app-notif-dismiss" data-dismiss-id="${escapeHtml(n.id)}" title="${tGet('notifications.dismiss') || 'Dismiss'}">✕</button>
                    <div class="app-notif-avatar-wrap">
                        <img class="app-notif-avatar" src="${escapeHtml(avatarSrc)}" alt="" onerror="this.src='../assets/logo.png'">
                        ${unreadDotHtml}
                    </div>
                    <div class="app-notif-item-content">
                        ${imgHtml}
                        <div class="app-notif-item-title">${escapeHtml(n.title)}</div>
                        <div class="app-notif-item-body">${escapeHtml(n.body)}</div>
                        ${actionHtml}
                        <div class="app-notif-item-time">${formatDate(n.createdAt)}</div>
                    </div>
                </div>
            `
        }).join('')

        // Attach dismiss listeners
        list.querySelectorAll('.app-notif-dismiss').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                dismiss(btn.dataset.dismissId)
            })
        })

        // Attach action button listeners (open external URL)
        list.querySelectorAll('.app-notif-action-btn[data-open-url]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const url = btn.dataset.openUrl
                if (!url) return
                // В Electron — через electronAPI, иначе window.open
                if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url)
                } else {
                    window.open(url, '_blank', 'noopener')
                }
            })
        })

        // Клик по самой записи (не по dismiss/action, у них уже stopPropagation)
        // → переключиться на вкладку мессенджера и, если есть actionUrl, перейти
        // к конкретному чату/сообщению.
        list.querySelectorAll('.app-notif-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                const n = notifications.find(x => x.id === item.dataset.id)
                openNotificationTarget(n)
                closePanel()
            })
        })
    }

    function updateBadge() {
        const dismissed = getDismissed()
        const unread = notifications.filter(n => !n.isRead && !dismissed.has(n.id)).length
        if (badge) {
            if (unread > 0) {
                badge.textContent = unread > 99 ? '99+' : String(unread)
                badge.style.display = 'flex'
            } else {
                badge.style.display = 'none'
            }
        }
    }

    function syncMuteToggle() {
        if (!muteToggle) return
        const muted = state?.globalMuteAll ?? false
        const iconNormal = muteToggle.querySelector('.mute-icon-normal')
        const iconMuted  = muteToggle.querySelector('.mute-icon-muted')
        if (muted) {
            muteToggle.classList.add('muted')
            muteToggle.title = tGet('notifications.unmute') || 'Unmute'
            if (iconNormal) iconNormal.style.display = 'none'
            if (iconMuted)  iconMuted.style.display  = 'block'
        } else {
            muteToggle.classList.remove('muted')
            muteToggle.title = tGet('notifications.mute') || 'Mute'
            if (iconNormal) iconNormal.style.display = 'block'
            if (iconMuted)  iconMuted.style.display  = 'none'
        }
    }

    async function fetchNotifications() {
        if (!cloudStore?.isLoggedIn?.()) return

        try {
            const invoker = typeof authorizedInvoke === 'function' ? authorizedInvoke : null
            const token = getToken()
            const result = invoker
                ? await invoker('api-get-notifications')
                : token ? await invokeIpc('api-get-notifications', token) : null

            // Сервер возвращает { success, data:[] }, wrapApi оборачивает ещё раз
            const notifArray = Array.isArray(result?.data)
                ? result.data
                : Array.isArray(result?.data?.data)
                ? result.data.data
                : null

            if (result?.success && notifArray) {
                const prevIds = new Set(notifications.map(n => n.id))
                const dismissed = getDismissed()
                const newOnes = notifArray.filter(n => !prevIds.has(n.id) && !n.isRead && !dismissed.has(n.id))

                // BUGFIX ("в центр уведомлений вообще не попадают уведомления
                // от мессенджеров"): раньше здесь было `notifications = notifArray`
                // — полная замена массива, которая молча стирала все локальные
                // (from-messenger) записи в течение 45 сек. после их появления.
                // Облачная часть по-прежнему полностью управляется сервером
                // (нужно для честного отражения прочитанности/удаления на
                // сервере), но локальная часть теперь сохраняется поверх.
                const localOnes = notifications.filter(n => isLocalNotifId(n.id))
                notifications = [...notifArray, ...localOnes]
                sortNotifications()
                updateBadge()
                if (isPanelOpen()) renderPanel()

                for (const n of newOnes) {
                    try {
                        new window.Notification(n.title || 'Centrio', {
                            body: n.body || '',
                            icon: '../assets/logo.png'
                        })
                    } catch {}
                }
            }
        } catch {}
    }

    function addMessengerNotification(title, body, messengerName, messengerId, actionUrl) {
        const fakeEntry = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: messengerName ? `${messengerName}: ${title}` : title,
            body: body || '',
            isRead: false,
            createdAt: new Date().toISOString(),
            messengerId: messengerId || null,
            imageUrl: null,
            actionLabel: null,
            actionUrl: typeof actionUrl === 'string' ? actionUrl : null
        }
        notifications.unshift(fakeEntry)
        sortNotifications()
        updateBadge()
        if (isPanelOpen()) renderPanel()

        // Персистентность: сохраняем через main-процесс (main/ipc/appNotifications.js),
        // иначе запись живёт только в памяти этой вкладки и теряется при
        // перезапуске приложения. Чисто локально — никакого сетевого вызова,
        // текст уведомления никуда, кроме electron-store на этом ПК, не уходит.
        try { ipcRenderer?.send?.('app-notifs:add', fakeEntry) } catch {}
    }

    function openPanel() {
        syncMuteToggle()
        renderPanel()
        openRightPanel?.()
    }

    function closePanel() {
        closeRightPanel?.()
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openPanel()
    })

    markAllBtn?.addEventListener('click', async (e) => {
        e.stopPropagation()

        // BUGFIX: раньше весь обработчик выходил рано, если пользователь не
        // залогинен в облако — так «Прочитать всё» не работало вообще, даже
        // для чисто локальных (от мессенджеров) уведомлений, которые к
        // облачному аккаунту отношения не имеют. Облачный API-вызов теперь
        // делаем только когда есть логин, а локальную часть — всегда.
        if (cloudStore?.isLoggedIn?.()) {
            try {
                if (typeof authorizedInvoke === 'function') {
                    await authorizedInvoke('api-read-all-notifications')
                } else {
                    const token = getToken()
                    if (token) await invokeIpc('api-read-all-notifications', token)
                }
            } catch {}
        }

        notifications = notifications.map(n => ({ ...n, isRead: true }))
        updateBadge()
        renderPanel()
        try { ipcRenderer?.send?.('app-notifs:mark-all-read') } catch {}
    })

    deleteAllBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        // Добавляем все видимые уведомления в dismissed
        const dismissed = getDismissed()
        notifications.forEach(n => dismissed.add(n.id))
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]))
        updateBadge()
        renderPanel()
    })

    muteToggle?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (typeof toggleMuteAll === 'function') {
            toggleMuteAll()
        }
        syncMuteToggle()
    })

    // Закрытие "кликом мимо" убрано намеренно: панель теперь встроена в
    // раскладку правого сайдбара, закрывается только повторным кликом по
    // той же иконке (см. toggleRightPanel в renderer.js) — клики внутри
    // ЛЮБОЙ секции правой панели (не только этой) не должны её закрывать.

    // ── Локальная история (от мессенджеров) ─────────────────────────────────────
    // Live-обновления от main-процесса (на случай, если запись пришла не через
    // addMessengerNotification этой же сессии рендерера — например, задержанная
    // трансляция сразу после app-notifs:add).
    function upsertLocal(record) {
        if (!record || !record.id) return
        const idx = notifications.findIndex(n => n.id === record.id)
        if (idx === -1) notifications.unshift(record)
        else notifications[idx] = record
        sortNotifications()
        updateBadge()
        if (isPanelOpen()) renderPanel()
    }
    ipcRenderer?.on?.('app-notifs:item-update', (record) => upsertLocal(record))

    // Гидратация локальной истории при старте — иначе после перезапуска
    // приложения все ранее пойманные уведомления от мессенджеров пропадали
    // (хранились только в памяти вкладки, см. комментарий выше в
    // addMessengerNotification).
    ;(async () => {
        try {
            const history = await invokeIpc('app-notifs:get-history')
            if (Array.isArray(history) && history.length) {
                const existingIds = new Set(notifications.map(n => n.id))
                const toAdd = history.filter(n => !existingIds.has(n.id))
                if (toAdd.length) {
                    notifications = [...notifications, ...toAdd]
                    sortNotifications()
                    updateBadge()
                    if (isPanelOpen()) renderPanel()
                }
            }
        } catch {}
    })()

    fetchNotifications()
    setInterval(fetchNotifications, 45 * 1000)

    window.addEventListener('focus', () => {
        fetchNotifications()
    })

    // Экспортируется для renderer/assistant-tools.js (инструмент
    // get_recent_notifications) — единственная санкционированная лазейка в
    // "не читать контент мессенджеров": превью из колокольчика уведомлений,
    // не полные диалоги. См. заголовочный комментарий assistant-tools.js.
    function getRecentNotifications() {
        return getVisible().map(n => ({
            id: n.id,
            title: n.title || '',
            body: n.body || '',
            isRead: !!n.isRead,
            createdAt: n.createdAt || null,
            messengerId: n.messengerId || null
        }))
    }

    return { fetchNotifications, addMessengerNotification, getRecentNotifications }
}

module.exports = { bindAppNotifUi }
