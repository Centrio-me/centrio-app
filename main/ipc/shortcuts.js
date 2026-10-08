// Renderer -> main: read and change the rebindable keyboard shortcuts (see main/services/shortcutRegistry.js).
const { ipcMain } = require('electron')
const registry = require('../services/shortcutRegistry')
const { registerGlobalShortcuts } = require('../services/shortcuts')

function registerShortcutsIpc() {
    ipcMain.handle('shortcuts:list', () => ({ success: true, items: registry.list() }))

    ipcMain.handle('shortcuts:set', (_event, id, accel) => {
        const result = registry.set(String(id || ''), String(accel == null ? '' : accel))
        if (result.success) registerGlobalShortcuts()
        return { ...result, items: registry.list() }
    })

    ipcMain.handle('shortcuts:reset', (_event, id) => {
        const result = registry.reset(id ? String(id) : null)
        registerGlobalShortcuts()
        return { ...result, items: registry.list() }
    })
}

module.exports = registerShortcutsIpc
