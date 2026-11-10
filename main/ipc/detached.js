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
    // 3.7.1: windows open again after a restart; the main window reaches the page in a separate window to open the
    // notified chat and to reply from a notification (only the main window may ask).
    ipcMain.handle('detached:reopen-list', (event) => (fromMainWindow(event) ? detached.takeReopenList() : []))
    ipcMain.handle('detached:exec', async (event, id, code) => {
        if (!fromMainWindow(event)) throw new Error('forbidden')
        return detached.execInPage(id, code)
    })
    ipcMain.handle('detached:insert-text', async (event, id, text) => {
        if (!fromMainWindow(event)) throw new Error('forbidden')
        return detached.insertTextInPage(id, text)
    })
    ipcMain.handle('detached:input', (event, id, input) => (fromMainWindow(event) ? detached.inputToPage(id, input) : false))

    // 3.7.4: the main window changed its theme or accent: separate windows follow at once
    ipcMain.handle('detached:retheme', (event, theme, accent) => (fromMainWindow(event) ? (detached.retheme(theme, accent), true) : false))
    ipcMain.handle('detached:init', (event) => detached.handleInit(event.sender))
    ipcMain.on('detached:control', (event, action, value) => detached.handleControl(event.sender, action, value))
}

module.exports = registerDetachedIpc
