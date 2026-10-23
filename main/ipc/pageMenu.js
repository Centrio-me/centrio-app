// IPC of the page right-click menu (see main/services/pageContextMenu.js). Only the main window may ask.
const { ipcMain } = require('electron')
const pageMenu = require('../services/pageContextMenu')
const i18n = require('../services/i18n')

function registerPageMenuIpc({ getMainWindow }) {
    const deps = { getMainWindow, language: () => i18n.getCurrentLanguage() }
    ipcMain.handle('pagemenu:action', (event, wcId, action, payload) => pageMenu.handleAction(deps, event.sender, wcId, action, payload))
}

module.exports = registerPageMenuIpc
