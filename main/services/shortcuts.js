const { app, globalShortcut } = require('electron')
const { focusWindow, withWindow } = require('../utils/window')
const registry = require('./shortcutRegistry')

// Actions that already have a renderer handler (renderer/window-bind.js) keep their channel.
const RENDERER_CHANNELS = {
    nextTab: 'switch-messenger-next',
    prevTab: 'switch-messenger-prev',
    reload: 'reload-active',
    settings: 'open-settings'
}

let currentDeps = null

function toggleWindowVisibility({ getMainWindow, showMainWindow }) {
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
}

function runAction(actionId) {
    if (!currentDeps) return
    const { getMainWindow } = currentDeps
    withWindow(getMainWindow, (win) => {
        if (actionId === 'fullscreen') {
            win.setFullScreen(!win.isFullScreen())
            return
        }
        const channel = RENDERER_CHANNELS[actionId]
        if (channel) win.webContents.send(channel)
        else win.webContents.send('shortcut-action', { action: actionId })
    })
}

// Keys are matched in the main process for the app window and for every messenger webview, so a shortcut works
// whichever of them has the focus.
function attachShortcutHandling(contents) {
    contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.isAutoRepeat) return
        const actionId = registry.actionForInput(input)
        if (!actionId) return
        event.preventDefault()
        runAction(actionId)
    })
}

function registerGlobalShortcuts() {
    globalShortcut.unregisterAll()
    const hideShow = registry.list().find(item => item.id === 'hideShow')
    if (hideShow && hideShow.accel) {
        try {
            globalShortcut.register(hideShow.accel, () => toggleWindowVisibility(currentDeps))
        } catch (err) {
            console.warn('[shortcuts] cannot register', hideShow.accel, err.message)
        }
    }

    // F12 — toggle DevTools for the main window. This shortcut is the only way
    // to open the console now: the "Инструменты разработчика" context-menu
    // item was removed.
    globalShortcut.register('F12', () => {
        withWindow(currentDeps.getMainWindow, (win) => win.webContents.toggleDevTools())
    })
}

function registerShortcuts({ getMainWindow, showMainWindow }) {
    currentDeps = { getMainWindow, showMainWindow }
    registerGlobalShortcuts()

    withWindow(getMainWindow, (win) => attachShortcutHandling(win.webContents))
    app.on('web-contents-created', (_event, contents) => {
        if (contents.getType() === 'webview') attachShortcutHandling(contents)
    })
}

function unregisterShortcuts() {
    globalShortcut.unregisterAll()
}

module.exports = {
    registerShortcuts,
    unregisterShortcuts,
    registerGlobalShortcuts
}
