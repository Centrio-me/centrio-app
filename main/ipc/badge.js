const { ipcMain } = require('electron')
const { clearBadges } = require('../services/badge')
const { focusWindow } = require('../utils/window')

const { app } = require('electron')

function registerBadgeIpc({ getMainWindow, updateTrayMenu }) {
    ipcMain.on('update-badge', (event, count) => {
        const val = Math.max(0, Number(count) || 0)

        if (typeof updateTrayMenu === 'function') {
            updateTrayMenu(val)
        }

        if (typeof app.setBadgeCount === 'function') {
            app.setBadgeCount(val)
        }

        clearBadges(getMainWindow)
    })

    ipcMain.on('tray:update-menu', (_event, count) => {
        if (typeof updateTrayMenu === 'function') {
            updateTrayMenu(Math.max(0, Number(count) || 0))
        }
    })

    ipcMain.on('notification-clicked', () => {
        focusWindow(getMainWindow)
    })
}

module.exports = registerBadgeIpc