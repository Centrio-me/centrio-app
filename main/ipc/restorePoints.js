'use strict'
// Restore points IPC (3.7.1). The daily point is made a little after start, when the profile has settled.
const path = require('path')
const { app, ipcMain } = require('electron')
const log = require('electron-log')
const store = require('../services/store')
const { createRestorePoints } = require('../services/restorePoints')
const { isProfileBeingReplaced } = require('./profile')

const DAILY_DELAY_MS = 45 * 1000
const RESTART_DELAY_MS = 200

function registerRestorePointsIpc() {
    const points = createRestorePoints({
        store,
        dir: path.join(app.getPath('userData'), 'restore-points'),
        log: (line) => log.warn(line)
    })

    setTimeout(() => {
        if (isProfileBeingReplaced()) return
        try {
            const made = points.ensureDaily()
            if (made) log.info(`[restore-points] daily point ${made.id}`)
        } catch (e) { log.warn(`[restore-points] daily: ${e.message}`) }
    }, DAILY_DELAY_MS)

    ipcMain.handle('restore-points:list', () => ({ success: true, data: points.list() }))

    ipcMain.handle('restore-points:create', () => {
        try {
            const made = points.create('manual')
            return made ? { success: true, data: made } : { success: false, error: 'empty' }
        } catch (e) {
            log.warn(`[restore-points] create: ${e.message}`)
            return { success: false, error: 'write_failed' }
        }
    })

    ipcMain.handle('restore-points:remove', (_event, id) => ({ success: points.remove(id) }))

    // Puts the point back and restarts: every part of the app (main and page) reads the restored setup from scratch.
    ipcMain.handle('restore-points:restore', (_event, id) => {
        try {
            if (!points.restore(id)) return { success: false, error: 'not_found' }
        } catch (e) {
            log.warn(`[restore-points] restore: ${e.message}`)
            return { success: false, error: 'write_failed' }
        }
        log.info(`[restore-points] restored ${id}, restarting`)
        setTimeout(() => { app.relaunch(); app.quit() }, RESTART_DELAY_MS)
        return { success: true }
    })
}

module.exports = { registerRestorePointsIpc }
