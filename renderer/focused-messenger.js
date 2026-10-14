// The messenger the user is working in right now: the active tab, or in a split the pane that has focus.
// Shared by search (Ctrl+F) and the usage tracker so both agree on "the focused messenger".
function getFocusedMessengerId (state) {
    if (!state.splitMode) return state.activeTabId
    if (state.splitLayout === '2col') {
        return state.splitFocus === 'right' && state.splitTabId ? state.splitTabId : state.activeTabId
    }
    const zone = state.splitZoneFocus || 0
    return zone === 0 ? state.activeTabId : ((state.splitZoneIds || [])[zone] || state.activeTabId)
}

// Messengers visible in the current layout (one when not split).
function getVisibleMessengerIds (state) {
    if (!state.splitMode) return state.activeTabId ? [state.activeTabId] : []
    if (state.splitLayout === '2col') return [state.activeTabId, state.splitTabId].filter(Boolean)
    return [state.activeTabId, ...((state.splitZoneIds || []).slice(1))].filter(Boolean)
}

module.exports = { getFocusedMessengerId, getVisibleMessengerIds }
