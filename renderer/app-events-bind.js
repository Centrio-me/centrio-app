function bindAppEvents({
    state,
    quickSearch,
    findBar,
    closeQuickSearch,
    openQuickSearch,
    closeFindBar,
    openFindBar,
    switchTab,
    applyAppZoom,
    applyTabZoom,
    openSettings
}) {
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA'

        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'Comma') {
            e.preventDefault()
            if (typeof openSettings === 'function') openSettings()
            return
        }

        if (e.ctrlKey && (e.code === 'KeyP' || e.code === 'KeyK')) {
            e.preventDefault()
            quickSearch.classList.contains('show') ? closeQuickSearch() : openQuickSearch()
            return
        }

        if (e.ctrlKey && e.code === 'KeyF') {
            e.preventDefault()
            findBar.classList.contains('show') ? closeFindBar() : openFindBar()
            return
        }

        if (e.key === 'Escape') {
            if (quickSearch.classList.contains('show')) {
                closeQuickSearch()
                return
            }
            if (findBar.classList.contains('show')) {
                closeFindBar()
                return
            }
        }

        if (isInput) return

        if (e.ctrlKey && e.code === 'KeyR') {
            e.preventDefault()
            if (state.activeTabId) document.getElementById(`webview-${state.activeTabId}`)?.reload()
            return
        }

        if (e.ctrlKey && !e.shiftKey && e.code === 'Tab') {
            e.preventDefault()
            if (!state.activeMessengers.length) return
            const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
            if (idx === -1) return
            switchTab(state.activeMessengers[(idx + 1) % state.activeMessengers.length].id)
            return
        }

        if (e.ctrlKey && e.shiftKey && e.code === 'Tab') {
            e.preventDefault()
            if (!state.activeMessengers.length) return
            const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
            if (idx === -1) return
            switchTab(state.activeMessengers[(idx - 1 + state.activeMessengers.length) % state.activeMessengers.length].id)
            return
        }

        if (e.ctrlKey && e.code >= 'Digit1' && e.code <= 'Digit9') {
            e.preventDefault()
            const idx = parseInt(e.code.replace('Digit', '')) - 1
            if (state.activeMessengers[idx]) switchTab(state.activeMessengers[idx].id)
        }
    })

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === '=' || e.code === 'Equal')) {
            e.preventDefault()
            applyAppZoom(state.appZoomLevel + 1)
            return
        }

        if (e.ctrlKey && e.shiftKey && (e.key === '-' || e.code === 'Minus')) {
            e.preventDefault()
            applyAppZoom(state.appZoomLevel - 1)
            return
        }

        if (e.ctrlKey && !e.shiftKey && e.code === 'Digit0') {
            e.preventDefault()
            applyAppZoom(0)
            return
        }

        if (e.ctrlKey && !e.shiftKey && (e.key === '=' || e.code === 'Equal')) {
            e.preventDefault()
            applyTabZoom(state.tabZoomLevel + 0.25)
            return
        }

        if (e.ctrlKey && !e.shiftKey && (e.key === '-' || e.code === 'Minus')) {
            e.preventDefault()
            applyTabZoom(state.tabZoomLevel - 0.25)
        }
    })

    document.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.activity-btn, .messenger-item')
        if (!btn) return

        btn.classList.remove('ripple-active')
        void btn.offsetWidth
        btn.classList.add('ripple-active')
        btn.addEventListener('animationend', () => btn.classList.remove('ripple-active'), { once: true })
    })
}

module.exports = {
    bindAppEvents
}