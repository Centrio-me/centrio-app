function createStatusBarApi({ store, state, tGet, getCurrentLocale }) {
    function updateStatusBar() {
        const total = state.activeMessengers.length
        const totalUnread = Object.values(state.unreadCounts).reduce((a, b) => a + b, 0)

        const statusMessengersText = document.getElementById('statusMessengersText')
        const statusUnreadText = document.getElementById('statusUnreadText')
        const statusActiveText = document.getElementById('statusActiveText')
        const statusTime = document.getElementById('statusTime')

        if (statusMessengersText) {
            if (total === 0) statusMessengersText.textContent = tGet('status.noMessengers')
            else if (total === 1) statusMessengersText.textContent = tGet('status.oneMessenger')
            else if (total < 5) statusMessengersText.textContent = tGet('status.fewMessengers').replace('{n}', total)
            else statusMessengersText.textContent = tGet('status.manyMessengers').replace('{n}', total)
        }

        if (statusUnreadText) {
            statusUnreadText.textContent = totalUnread > 0
                ? tGet('status.unread').replace('{n}', totalUnread)
                : tGet('status.noUnread')
            document.getElementById('statusUnread')?.classList.toggle('status-accent', totalUnread > 0)
        }

        const offlineNet = (typeof navigator !== 'undefined' && navigator.onLine === false)

        if (statusActiveText) {
            const statusActive = document.getElementById('statusActive')
            const statusDot = statusActive?.querySelector('.status-dot')
            if (offlineNet) {
                statusActiveText.textContent = tGet('status.noInternet')
                statusActive?.classList.add('status-no-internet-item')
                statusDot?.classList.remove('status-online')
                statusDot?.classList.add('status-no-internet')
            } else {
                statusActiveText.textContent = total > 0 ? tGet('status.online') : tGet('status.offline')
                statusActive?.classList.remove('status-no-internet-item')
                statusDot?.classList.remove('status-no-internet')
                statusDot?.classList.add('status-online')
            }
        }

        const offlineOverlay = document.getElementById('offlineOverlay')
        if (offlineOverlay) {
            const textEl = offlineOverlay.querySelector('.offline-overlay-text')
            if (textEl) textEl.textContent = tGet('status.offlineBannerText')
            offlineOverlay.style.display = offlineNet ? 'flex' : 'none'
        }

        if (statusTime) {
            const now = new Date()
            statusTime.textContent = now.toLocaleTimeString(getCurrentLocale(store), {
                hour: '2-digit',
                minute: '2-digit'
            })
        }

        const statusDate = document.getElementById('statusDate')
        if (statusDate) {
            const now = new Date()
            statusDate.textContent = now.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            })
        }
    }

    function updateZoomStatus() {
        const pct = Math.round((1 + state.appZoomLevel * 0.2) * 100)
        const statusTime = document.getElementById('statusTime')

        if (statusTime) {
            statusTime.textContent = `${pct}%`
            clearTimeout(statusTime._zoomTimeout)
            statusTime._zoomTimeout = setTimeout(() => {
                const now = new Date()
                statusTime.textContent = now.toLocaleTimeString(getCurrentLocale(store), {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }, 2000)
        }
    }

    return {
        updateStatusBar,
        updateZoomStatus
    }
}

module.exports = {
    createStatusBarApi
}