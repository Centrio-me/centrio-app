// IPC for the personal password manager. See main/services/passwordManager.js for the security model.
const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const manager = require('../services/passwordManager')

const FAILED = { success: false, error: 'FAILED' }
const MAX_IMPORT_BYTES = 8 * 1024 * 1024
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
    handle('pm:recovery-create', () => manager.createRecoveryCode())
    handle('pm:recover', (code, newMaster) => manager.recover(str(code), str(newMaster)))
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

    // Import: the file is picked, read and parsed here; the renderer only gets counts and a few site names.
    handle('pm:import-pick', async () => {
        const win = typeof getMainWindow === 'function' ? getMainWindow() : null
        const picked = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
            properties: ['openFile'],
            filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }, { name: '*', extensions: ['*'] }]
        })
        if (picked.canceled || !picked.filePaths.length) return { success: false, error: 'CANCELED' }
        const filePath = picked.filePaths[0]
        if (fs.statSync(filePath).size > MAX_IMPORT_BYTES) return { success: false, error: 'TOO_BIG' }
        const text = fs.readFileSync(filePath, 'utf8')
        const result = manager.importPrepare(text, filePath)
        return result.success ? { ...result, fileName: path.basename(filePath) } : result
    })
    handle('pm:import-commit', (token, deleteFile) => manager.importCommit(str(token), deleteFile === true))
    handle('pm:import-cancel', (token) => manager.importCancel(str(token)))
}

module.exports = registerPasswordManagerIpc
