// A messenger in its own window ("Открыть в отдельном окне" in the sidebar context menu).
// The page MOVES out of this window (WhatsApp/Telegram refuse two live copies of one session): a placeholder takes its
// place in the tab, and the page is rebuilt here when the separate window closes. The window itself, unread counters and
// notifications are handled in the main process (main/services/detachedWindows.js).
const { getVisibleMessengerIds } = require('./focused-messenger')

function createDetachedApi({ state, invokeIpc, ipcRenderer, tGet, tabsContent, getMessengerById, getSplitApi, getAddWebview, getSwitchTab, isChatWidgetMessenger }) {
    const text = (key, fallback) => {
        const value = tGet ? tGet(key) : ''
        return value && value !== key ? value : fallback
    }

    function markSidebar(id, on) {
        document.getElementById(`sidebar-${id}`)?.classList.toggle('is-detached', on)
    }

    function buildPlaceholder(m, active) {
        const pane = document.createElement('div')
        pane.id = `webview-${m.id}`
        pane.className = 'detached-pane' + (active ? ' active' : '')

        const card = document.createElement('div')
        card.className = 'detached-card'

        const icon = document.createElement('img')
        icon.className = 'detached-icon'
        icon.alt = ''
        icon.draggable = false
        icon.src = m.icon || ''
        icon.onerror = () => { icon.style.visibility = 'hidden' }

        const title = document.createElement('div')
        title.className = 'detached-title'
        title.textContent = text('detached.paneTitle', '{name} is open in a separate window').replace('{name}', m.name || '')

        const hint = document.createElement('div')
        hint.className = 'detached-hint'
        hint.textContent = text('detached.paneHint', '')

        const actions = document.createElement('div')
        actions.className = 'detached-actions'

        const show = document.createElement('button')
        show.type = 'button'
        show.className = 'detached-btn primary'
        show.textContent = text('detached.paneShow', 'Show window')
        show.addEventListener('click', () => focus(m.id))

        const back = document.createElement('button')
        back.type = 'button'
        back.className = 'detached-btn'
        back.textContent = text('detached.paneBack', 'Bring it back')
        back.addEventListener('click', () => invokeIpc('detached:close', m.id).catch(() => {}))

        actions.append(show, back)
        card.append(icon, title, hint, actions)
        pane.appendChild(card)
        return pane
    }

    function isDetached(id) {
        return state.detachedTabs.has(id)
    }

    function focus(id) {
        return invokeIpc('detached:focus', id).catch(() => false)
    }

    async function detach(id) {
        const m = getMessengerById(id)
        if (!m || (isChatWidgetMessenger && isChatWidgetMessenger(m))) return false
        if (isDetached(id)) { focus(id); return true }

        // A split holds its panes in the window: a messenger that leaves for its own window ends that split.
        if (state.splitMode && getVisibleMessengerIds(state).includes(id)) getSplitApi()?.exitSplitMode?.()

        const result = await invokeIpc('detached:open', {
            id: m.id, name: m.name, icon: m.icon, url: m.url, zoomLevel: m.zoomLevel, forceDarkMode: m.forceDarkMode
        }).catch(() => null)
        if (!result || result.success !== true) return false

        state.detachedTabs.add(id)
        state.sleepingTabs.delete(id)
        document.getElementById(`sidebar-${id}`)?.classList.remove('is-sleeping')

        const old = document.getElementById(`webview-${id}`)
        const wasActive = state.activeTabId === id || !!old?.classList.contains('active')
        if (old) {
            state.webviewWatchBound.delete(`webview-${id}`)
            old.remove()
        }
        tabsContent.appendChild(buildPlaceholder(m, wasActive))
        markSidebar(id, true)
        return true
    }

    // The separate window closed (or "bring it back" was pressed): the page returns to its tab.
    function restore(id) {
        if (!state.detachedTabs.delete(id)) return
        document.getElementById(`webview-${id}`)?.remove()
        markSidebar(id, false)
        const m = getMessengerById(id)
        if (!m) return
        getAddWebview()(m)
        if (state.activeTabId === id) getSwitchTab()(id)
    }

    // The messenger was deleted while it had its own window.
    function onMessengerRemoved(id) {
        if (!state.detachedTabs.delete(id)) return
        invokeIpc('detached:close', id).catch(() => {})
        document.getElementById(`webview-${id}`)?.remove()
        markSidebar(id, false)
    }

    function bind() {
        ipcRenderer.on('detached:closed', (id) => restore(String(id)))
    }

    return { detach, focus, restore, isDetached, onMessengerRemoved, bind }
}

module.exports = { createDetachedApi }
