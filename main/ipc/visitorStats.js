// Renderer -> main: anonymous product events for the admin funnel (see main/services/visitor-tracker.js).
const { ipcMain } = require('electron')
const visitorTracker = require('../services/visitor-tracker')

function registerVisitorStatsIpc() {
    ipcMain.handle('visitor:track', async (_event, name, props) => {
        try { await visitorTracker.track(String(name || ''), props); return { success: true } } catch { return { success: false } }
    })
}

module.exports = registerVisitorStatsIpc
