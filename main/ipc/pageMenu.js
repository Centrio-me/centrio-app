// IPC of the page right-click menu (see main/services/pageContextMenu.js). Only the main window may ask.
const { ipcMain, dialog, app } = require('electron')
const pageMenu = require('../services/pageContextMenu')
const i18n = require('../services/i18n')
const i18nService = i18n
const imageSave = require('../services/imageSave')

function registerPageMenuIpc({ getMainWindow }) {
    const deps = { getMainWindow, language: () => i18n.getCurrentLanguage() }
    ipcMain.handle('pagemenu:action', (event, wcId, action, payload) => pageMenu.handleAction(deps, event.sender, wcId, action, payload))

    // What is under the pointer on the page: a picture the browser did not call one (canvas, a CSS background, one under a layer)
    ipcMain.handle('pagemenu:probe-image', async (event, wcId, x, y) => {
        const guest = pageMenu.guestFor(getMainWindow, event.sender, wcId)
        if (!guest) return { found: false }
        return imageSave.probeAt(guest, Number(x), Number(y))
    })

    // «Сохранить изображение»: the main process gets the picture itself and answers with what the person must be told
    ipcMain.handle('pagemenu:save-image', async (event, wcId, payload) => {
        const guest = pageMenu.guestFor(getMainWindow, event.sender, wcId)
        if (!guest) return { ok: false, code: 'gone' }
        const downloads = require('./downloads')
        const log = require('electron-log')
        try {
            return await imageSave.saveImage(guest, {
                srcURL: payload && payload.srcURL, x: payload && payload.x, y: payload && payload.y, pageURL: payload && payload.pageURL
            }, {
                getMainWindow, dialog, t: i18nService.t, log: (line) => log.info(line),
                prefs: downloads.getDownloadPrefs, downloadsPath: () => app.getPath('downloads'), addRecord: downloads.addDownloadRecord
            })
        } catch (err) {
            log.error('[image-save] unexpected: ' + (err && err.message))
            return { ok: false, code: 'generic' }
        }
    })
}

module.exports = registerPageMenuIpc
