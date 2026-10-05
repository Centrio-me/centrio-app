// IPC for the personal password manager. See main/services/passwordManager.js for the security model.
const { ipcMain } = require('electron')
const manager = require('../services/passwordManager')

const FAILED = { success: false, error: 'FAILED' }
const str = (value) => String(value == null ? '' : value)

function registerPasswordManagerIpc({ getMainWindow } = {}) {
    manager.setEmitter((payload) => {
        const win = typeof getMainWindow === 'function' ? getMainWindow() : null
        if (win && !win.isDestroyed()) win.webContents.send('pm:event', payload)
    })
    const handle = (channel, fn) => ipcMain.handle(channel, async (_event, ...args) => {
        try { return await fn(...args) } catch { return FAILED }
    })

    handle('pm:status', () => manager.status())
    handle('pm:setup', (master) => manager.setup(str(master)))
    handle('pm:unlock', (master) => manager.unlock(str(master)))
    handle('pm:lock', () => { manager.lock(); return { success: true } })
    handle('pm:change-master', (oldMaster, newMaster) => manager.changeMaster(str(oldMaster), str(newMaster)))
    handle('pm:reset', () => manager.reset())
    handle('pm:set-autolock', (minutes) => manager.setAutoLock(minutes))
    handle('pm:list', () => manager.list())
    handle('pm:save', (entry) => manager.save(entry))
    handle('pm:delete', (id) => manager.remove(str(id)))
    handle('pm:reveal', (id) => manager.reveal(str(id)))
    handle('pm:copy', (id, what) => manager.copy(str(id), what === 'login' ? 'login' : 'password'))
    handle('pm:matches', (url) => manager.matches(str(url)))
    handle('pm:autofill', (id, messengerId) => manager.autofill(str(id), str(messengerId)))
    handle('pm:capture-save', (captureId, master) => manager.saveCapture(str(captureId), str(master)))
    handle('pm:capture-dismiss', (captureId, never) => manager.dismissCapture(str(captureId), never === true))
    handle('pm:export', () => ({ success: true, vault: manager.exportBlob() }))
    handle('pm:merge-remote', (remote) => manager.mergeRemote(remote))
    handle('pm:adopt-remote', (master) => manager.adoptRemote(str(master)))
    handle('pm:discard-remote', () => manager.discardRemote())
}

module.exports = registerPasswordManagerIpc
