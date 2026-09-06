function bindWindowUi({
    store,
    state,
    ipcRenderer,
    switchTab,
    showLockScreen,
    openSettings,
    exitSplitMode
}) {
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
        if (state.activeMessengers[index]) switchTab(state.activeMessengers[index].id)
    })

    ipcRenderer.on('switch-messenger-next', () => {
        if (!state.activeMessengers.length) return
        const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
        if (idx === -1) return
        switchTab(state.activeMessengers[(idx + 1) % state.activeMessengers.length].id)
    })

    ipcRenderer.on('switch-messenger-prev', () => {
        if (!state.activeMessengers.length) return
        const idx = state.activeMessengers.findIndex(m => m.id === state.activeTabId)
        if (idx === -1) return
        switchTab(state.activeMessengers[(idx - 1 + state.activeMessengers.length) % state.activeMessengers.length].id)
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
    ipcRenderer.on('notification-clicked-id', (messengerId) => {
        if (!messengerId) return
        if (state.splitMode && typeof exitSplitMode === 'function') exitSplitMode()
        switchTab(messengerId)
    })
}

module.exports = {
    bindWindowUi
}