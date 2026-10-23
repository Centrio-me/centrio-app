// IPC for messengers in their own window (see main/services/detachedWindows.js).
// Two kinds of callers: the main window (open/focus/close/list) and the window host pages themselves (init/control).
const { ipcMain } = require('electron')
const detached = require('../services/detachedWindows')

function registerDetachedIpc({ getMainWindow }) {
    detached.init({ getMainWindow })

    const fromMainWindow = (event) => {
        const win = getMainWindow()
        return !!win && !win.isDestroyed() && event.sender === win.webContents
    }

    ipcMain.handle('detached:open', (event, record) => {
        if (!fromMainWindow(event)) return { success: false, error: 'forbidden' }
        return detached.open(record)
    })
    ipcMain.handle('detached:open-link', (event, record, url) => {
        if (!fromMainWindow(event)) return { success: false, error: 'forbidden' }
        return detached.openLink(record, url)
    })
    ipcMain.handle('detached:focus', (event, id) => (fromMainWindow(event) ? detached.focus(id) : false))
    ipcMain.handle('detached:close', (event, id) => (fromMainWindow(event) ? detached.close(id) : false))
    ipcMain.handle('detached:list', (event) => (fromMainWindow(event) ? detached.list() : []))

    ipcMain.handle('detached:init', (event) => detached.handleInit(event.sender))
    ipcMain.on('detached:control', (event, action, value) => detached.handleControl(event.sender, action, value))
}

module.exports = registerDetachedIpc
