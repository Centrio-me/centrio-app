const { globalShortcut } = require('electron')
const { focusWindow, withWindow } = require('../utils/window')

function registerShortcuts({ getMainWindow, showMainWindow }) {
    // Ctrl+M — toggle window visibility (only global shortcut needed)
    // Navigation shortcuts (Ctrl+Tab, Ctrl+1-9, etc.) are handled inside
    // the renderer via document keydown + webview preload forwarding to
    // avoid double-firing when both globalShortcut and webview preload fire.
    globalShortcut.register('CmdOrCtrl+M', () => {
        const focused = withWindow(getMainWindow, (win) => {
            if (win.isVisible() && win.isFocused()) {
                win.hide()
                return true
            }
            return false
        })

        if (!focused) {
            focusWindow(getMainWindow) || showMainWindow()
        }
    })

    // F12 — toggle DevTools for the main window itself (renderer.js/split.js/
    // unread.js etc). Complements webview.openDevTools() (see ctxDevTools in
    // context-actions-bind.js, opens DevTools scoped to one messenger's own
    // page) — this one is for host-side code that isn't inside any webview.
    globalShortcut.register('F12', () => {
        withWindow(getMainWindow, (win) => win.webContents.toggleDevTools())
    })
}

function unregisterShortcuts() {
    globalShortcut.unregisterAll()
}

module.exports = {
    registerShortcuts,
    unregisterShortcuts
}