'use strict'
// Renderer -> main: the owner's in-app windows (see main/services/announcements.js).
const { ipcMain } = require('electron')
const announcements = require('../services/announcements')

function registerAnnouncementsIpc() {
    ipcMain.handle('announcements:active', async () => {
        try { return { success: true, items: await announcements.fetchActive() } } catch { return { success: false, items: [] } }
    })
    ipcMain.handle('announcements:event', async (_event, id, name) => {
        try { return { success: await announcements.sendEvent(String(id || ''), String(name || '')) } } catch { return { success: false } }
    })
}

module.exports = registerAnnouncementsIpc
