// TEAM control IPC (2026-11-08): strict mode for the main process, idle time for presence beats,
// wiping team sessions, and the device proof that lets a removed device fetch its pending wipe.
const { ipcMain, powerMonitor } = require('electron')
const orgNavigationPolicy = require('../services/orgNavigationPolicy')
const teamWipe = require('../services/teamWipe')
const teamDevice = require('../services/teamDevice')
const teamEvents = require('../services/teamEvents')

function safeHandle(channel, handler) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (...args) => {
        try {
            return await handler(...args)
        } catch (error) {
            console.error(`[team] ${channel} failed:`, error.message)
            return { success: false, error: error.message }
        }
    })
}

function registerTeamIpc({ getMainWindow } = {}) {
    // { strict, assigned: { 'org:<id>': url } }
    safeHandle('team:set-strict', (_e, payload) => {
        const strict = typeof payload === 'object' && payload ? payload.strict === true : payload === true
        const assigned = typeof payload === 'object' && payload ? payload.assigned : undefined
        orgNavigationPolicy.setState({ strict, assigned })
        return { success: true }
    })
    // 'allow' | 'external' | 'block' for a link a team tab wants to open in a new window (review I2)
    ipcMain.removeHandler('team:decide-nav')
    ipcMain.handle('team:decide-nav', (_e, messengerId, url) => orgNavigationPolicy.decideNavigation({ messengerId: String(messengerId || ''), targetUrl: String(url || '') }))
    safeHandle('team:idle-seconds', () => ({ success: true, idleSec: powerMonitor.getSystemIdleTime() }))
    safeHandle('team:wipe-sessions', async (_e, assignmentIds) => ({ success: true, ...(await teamWipe.wipe(assignmentIds)) }))
    // authorizedInvoke passes the token first, so an expired one is refreshed and retried by the renderer.
    safeHandle('team-events:start', (_e, token, orgId) => teamEvents.start({ token, orgId, getMainWindow }))
    safeHandle('team-events:stop', () => { teamEvents.stop(); return { success: true } })
    safeHandle('team:device-proof', async (_e, userId, deviceKeyId) => teamDevice.proofHeaders(userId, deviceKeyId))
}

module.exports = registerTeamIpc
