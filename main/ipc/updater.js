const { ipcMain } = require('electron')
const { installUpdate, checkForUpdates, takeJustUpdated } = require('../services/updater')

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

function registerUpdaterIpc() {
    safeHandle('install-update', async () => {
        try {
            installUpdate()
            return { success: true }
        } catch (error) {
            console.error('install-update error:', error)
            return { success: false, error: error.message }
        }
    })

    safeHandle('update:just-updated', async () => takeJustUpdated())

    safeHandle('check-for-updates', async () => {
        try {
            const result = await checkForUpdates()
            return {
                success: true,
                updateInfo: result?.updateInfo || null
            }
        } catch (error) {
            console.error('check-for-updates error:', error)
            return { success: false, error: error.message }
        }
    })

    safeHandle('app:checkForUpdates', async () => {
        try {
            const result = await checkForUpdates()
            return {
                success: true,
                updateInfo: result?.updateInfo || null
            }
        } catch (error) {
            console.error('app:checkForUpdates error:', error)
            return { success: false, error: error.message }
        }
    })
}

module.exports = registerUpdaterIpc