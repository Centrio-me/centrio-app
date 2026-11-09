// The page of a messenger, wherever it lives (3.7.1). Normally it is the <webview> in this window; a messenger moved to
// its own window leaves a placeholder here, and its page is reached through the main process instead. Opening the
// notified chat and replying from a notification use this, so both also work for messengers in a separate window.
const invoke = (channel, ...args) => window.electronAPI?.invoke?.(channel, ...args) ?? Promise.reject(new Error('no_ipc'))

function detachedPage(id) {
    return {
        detached: true,
        executeJavaScript: (code) => invoke('detached:exec', id, String(code)),
        insertText: (text) => invoke('detached:insert-text', id, String(text)),
        sendInputEvent: (event) => { invoke('detached:input', id, event).catch(() => {}) },
        focus: () => { invoke('detached:focus', id).catch(() => {}) },
        // The separate window always shows its page: the "give the tab a layout" trick of the main window is not needed.
        classList: { contains: () => true, add: () => {}, remove: () => {} }
    }
}

function pageFor(messengerId) {
    const node = document.getElementById(`webview-${messengerId}`)
    if (!node) return null
    if (node.classList.contains('detached-pane')) return detachedPage(String(messengerId))
    return typeof node.executeJavaScript === 'function' ? node : null
}

module.exports = { pageFor }
