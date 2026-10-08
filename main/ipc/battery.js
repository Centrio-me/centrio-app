// Renderer -> main: does this computer have a battery (laptop) or not (desktop PC).
const { ipcMain } = require('electron')
const { hasBattery } = require('../services/battery')

function registerBatteryIpc() {
    ipcMain.handle('battery:has', async () => {
        try { return { success: true, hasBattery: await hasBattery() } } catch { return { success: true, hasBattery: false } }
    })
}

module.exports = registerBatteryIpc
