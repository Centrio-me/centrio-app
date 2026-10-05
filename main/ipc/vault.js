// IPC for the team password vault (2026-10-05). See main/services/vault.js for the security model.
const { ipcMain } = require('electron')
const vault = require('../services/vault')

function registerVaultIpc() {
    // Public key of THIS device for the signed-in user (created on first call). Safe to send to the server.
    ipcMain.handle('vault:get-public-key', async (_event, userId) => {
        try {
            return await vault.getPublicKey(String(userId || ''))
        } catch {
            return { success: false, error: 'FAILED' }
        }
    })

    // Decrypt the saved login and type it into the messenger's login form. Resolves with a status word only.
    ipcMain.handle('vault:autofill', async (_event, payload) => {
        try {
            const { userId, messengerId, blob, aad, assignedUrl } = payload || {}
            if (!userId || !messengerId || !blob || !aad || !assignedUrl) return { success: false, error: 'BAD_REQUEST' }
            return await vault.autofill({ userId: String(userId), messengerId: String(messengerId), blob, aad: String(aad), assignedUrl: String(assignedUrl) })
        } catch {
            return { success: false, error: 'FAILED' }
        }
    })
}

module.exports = registerVaultIpc
