function createUnreadApi({
    state,
    store,
    tGet,
    ipcRenderer,
    updateStatusBar,
    updateFolderBadge
}) {
    function isMessengerMuted(id) {
        return state.globalMuteAll || state.mutedMessengers[id] === true
    }

    function getEffectiveUnreadCount(id) {
        const raw = Math.max(0, Number(state.rawUnreadCounts[id]) || 0)
        return isMessengerMuted(id) ? 0 : raw
    }

    function sanitizeUnreadCount(messengerId, rawCount) {
        const prev = Math.max(0, Number(state.rawUnreadCounts[messengerId]) || 0)
        const num = Number(rawCount)

        if (!Number.isFinite(num)) return 0
        if (num < 0) return 0

        const next = Math.floor(num)

        // Разрешаем нормальные значения
        if (next <= 200) return next

        // Всегда разрешаем явный сброс
        if (next === 0) return 0

        // Совсем подозрительные числа считаем мусором
        if (next > 999) return prev

        // Резкий скачок с нуля/почти нуля
        if (prev <= 1 && next > 200) return prev

        // Резкий скачок в много раз
        if (prev > 0 && next > prev * 10 && next > 200) return prev

        return next
    }

    function resetMessengerNotifyState(messengerId, currentCount = 0) {
        state.messengerNotifyState[messengerId] = {
            lastNotifyAt: 0,
            lastNotifiedCount: Math.max(0, Number(currentCount) || 0),
            lastIncomingCount: Math.max(0, Number(currentCount) || 0),
            lastDelta: 0
        }
    }

    function updateMuteIcon(id) {
        const item = document.getElementById(`sidebar-${id}`)
        if (!item) return

        const muted = isMessengerMuted(id)
        let muteIcon = item.querySelector('.mute-icon')

        if (muted) {
            if (!muteIcon) {
                muteIcon = document.createElement('span')
                muteIcon.className = 'mute-icon'
                muteIcon.title = tGet('notifications.muteIcon')
                muteIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2"/>
                    <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>`
                item.appendChild(muteIcon)
            }
        } else {
            muteIcon?.remove()
        }
    }

    function updateContextMuteLabel(id) {
        const ctxMute = document.getElementById('ctxMute')
        if (!ctxMute) return

        const muted = state.mutedMessengers[id] === true
        ctxMute.innerHTML = muted
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2"/>
               </svg> ${tGet('notifications.unmute')}`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2"/>
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
               </svg> ${tGet('notifications.mute')}`
    }

    function updateMuteAllBtn() {
        // Синхронизируем кнопку mute в панели уведомлений
        const muteToggle = document.getElementById('appNotifMuteToggle')
        if (!muteToggle) return
        const iconNormal = muteToggle.querySelector('.mute-icon-normal')
        const iconMuted  = muteToggle.querySelector('.mute-icon-muted')
        if (state.globalMuteAll) {
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

    function updateUnreadCount(messengerId, rawCount) {
        const normalizedRaw = sanitizeUnreadCount(messengerId, rawCount)

        clearTimeout(state.unreadStabilizeTimers[messengerId])
        state.unreadStabilizeTimers[messengerId] = setTimeout(() => {
            state.rawUnreadCounts[messengerId] = normalizedRaw
            const effectiveCount = getEffectiveUnreadCount(messengerId)
            state.unreadCounts[messengerId] = effectiveCount

            const notifyState = state.messengerNotifyState[messengerId]
            if (notifyState && normalizedRaw < notifyState.lastNotifiedCount) {
                resetMessengerNotifyState(messengerId, normalizedRaw)
            }

            const sidebarItem = document.getElementById(`sidebar-${messengerId}`)
            if (sidebarItem) {
                let badge = sidebarItem.querySelector('.messenger-badge')
                if (effectiveCount > 0) {
                    if (!badge) {
                        badge = document.createElement('span')
                        badge.className = 'messenger-badge'
                        sidebarItem.appendChild(badge)
                    }
                    badge.textContent = effectiveCount > 99 ? '99+' : effectiveCount
                } else {
                    badge?.remove()
                }
            }

            const tab = document.getElementById(`tab-${messengerId}`)
            if (tab) {
                let tabBadge = tab.querySelector('.tab-badge')
                if (effectiveCount > 0) {
                    if (!tabBadge) {
                        tabBadge = document.createElement('span')
                        tabBadge.className = 'tab-badge'
                        const closeBtn = tab.querySelector('.tab-close')
                        tab.insertBefore(tabBadge, closeBtn)
                    }
                    tabBadge.textContent = effectiveCount > 99 ? '99+' : effectiveCount
                } else {
                    tabBadge?.remove()
                }
            }

            const messenger = state.activeMessengers.find(m => m.id === messengerId)
            if (messenger?.folderId) updateFolderBadge(messenger.folderId)

            const totalUnread = Object.keys(state.rawUnreadCounts).reduce((sum, id) => {
                return sum + getEffectiveUnreadCount(id)
            }, 0)

            const settings = store.get('settings', {})
            const count = settings.trayBadge === false ? 0 : totalUnread
            ipcRenderer.send('update-badge', count)
            ipcRenderer.send('tray:update-menu', count)
            updateStatusBar()
        }, 250)
    }

    function toggleMuteMessenger(id) {
        state.mutedMessengers[id] = !state.mutedMessengers[id]
        store.set('mutedMessengers', state.mutedMessengers)
        updateMuteIcon(id)
        updateContextMuteLabel(id)
        updateUnreadCount(id, state.rawUnreadCounts[id] || 0)
        resetMessengerNotifyState(id, state.rawUnreadCounts[id] || 0)
    }

    function toggleMuteAll() {
        state.globalMuteAll = !state.globalMuteAll
        store.set('globalMuteAll', state.globalMuteAll)
        updateMuteAllBtn()

        state.activeMessengers.forEach(m => {
            updateUnreadCount(m.id, state.rawUnreadCounts[m.id] || 0)
            resetMessengerNotifyState(m.id, state.rawUnreadCounts[m.id] || 0)
            updateMuteIcon(m.id)
        })
    }

    // BUGFIX ("бейджи пропали из сайдбара, но в трее/таскбаре число верное"):
    // updateUnreadCount() silently no-ops when #sidebar-<id> doesn't exist
    // yet (item not mounted, e.g. main-process polling reached it before the
    // renderer finished building the sidebar). state.rawUnreadCounts still
    // gets updated correctly (which is why the tray/taskbar total — driven
    // by the same state — stays right), but since a later poll with the SAME
    // unchanged count never re-sends (dedup in startUnreadPolling), the
    // sidebar badge for that messenger is then never (re)painted at all.
    // Call once after the sidebar is fully populated to repaint every badge
    // from whatever's already tracked, independent of new updates arriving.
    function repaintAllUnreadBadges() {
        state.activeMessengers.forEach(m => {
            const raw = state.rawUnreadCounts[m.id]
            if (typeof raw === 'number' && raw > 0) updateUnreadCount(m.id, raw)
        })
    }

    return {
        isMessengerMuted,
        getEffectiveUnreadCount,
        sanitizeUnreadCount,
        resetMessengerNotifyState,
        updateMuteIcon,
        updateContextMuteLabel,
        updateMuteAllBtn,
        updateUnreadCount,
        repaintAllUnreadBadges,
        toggleMuteMessenger,
        toggleMuteAll
    }
}

module.exports = {
    createUnreadApi
}