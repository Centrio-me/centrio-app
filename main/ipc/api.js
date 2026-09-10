const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { ipcMain, app } = require('electron')
const api = require('../services/api')
const tracker = require('../services/tracker')
const entitlement = require('../services/entitlement')

function normalizeError(error) {
    const status = error?.response?.status
    const data = error?.response?.data || {}
    const message =
        data?.error ||
        data?.message ||
        error?.message ||
        'Unknown error'

    let code = data?.code || null

    if (!code) {
        if (status === 401) code = 'unauthorized'
        else if (status === 403) code = 'forbidden'
        else if (status === 400) code = 'bad_request'
        else if (status === 404) code = 'not_found'
        else if (status >= 500) code = 'server_error'
    }

    return {
        success: false,
        error: message,
        code,
        status
    }
}

async function wrapApi(call) {
    try {
        const response = await call()
        return {
            success: true,
            data: response?.data
        }
    } catch (error) {
        return normalizeError(error)
    }
}

// SECURITY: called after every auth-ish endpoint that returns a fresh `user`
// object, so main.js persists `cloud.user` itself — the ONLY code path
// allowed to, since the generic store:set IPC channel now blocks that key
// (see PROTECTED_SET_KEYS in main.js). The renderer never gets a chance to
// substitute its own `plan` field: this only ever runs with data this
// process itself just received over TLS from the real backend.
async function wrapApiAndPersistUser(call) {
    const result = await wrapApi(call)
    if (result.success && result.data?.user) {
        entitlement.persistCloudUser(result.data.user)
    }
    return result
}

function getWebviewPreloadPath() {
    const candidates = [
        path.join(app.getAppPath(), 'webview-preload.js'),
        path.join(process.resourcesPath, 'app.asar', 'webview-preload.js'),
        path.join(process.resourcesPath, 'app', 'webview-preload.js'),
        path.resolve(__dirname, '..', '..', 'webview-preload.js')
    ]

    const found = candidates.find((filePath) => fs.existsSync(filePath))

    if (!found) {
        throw new Error(
            `webview-preload.js not found. Checked: ${candidates.join(' | ')}`
        )
    }

    return pathToFileURL(found).toString()
}

// BUGFIX ("сайдбар не сохраняется" / "возвращает старый сайдбар" after a
// full quit): renderer's cloudSyncPush() (see renderer/sidebar-dnd-bind.js,
// renderer/split.js) is fire-and-forget — it kicks off this IPC call but
// nothing on the renderer side waits for it. With closeBehavior:"quit", the
// window's 'close' handler lets Electron proceed straight into 'before-quit'.
// Before this fix, before-quit only awaited tracker.flush() — an in-flight
// api-sync-push HTTP request could get killed mid-flight when the process
// exits. The local store.set() already wrote the correct order to disk
// synchronously, but the STALE cloud copy survives; the very next launch's
// cloudSyncPull() (renderer.js loadData()) then overwrites local with that
// stale cloud data, which looks exactly like "reverted to the old sidebar".
// Track the in-flight push promise here so before-quit (registerAppEvents.js)
// can await it before actually exiting.
let pendingSyncPush = null

function waitForPendingSyncPush() {
    return pendingSyncPush || Promise.resolve()
}

function registerApiIpc() {
    ipcMain.handle('get-webview-preload-path', () => {
        return getWebviewPreloadPath()
    })

    ipcMain.handle('api-login', async (event, email, password) => {
        return wrapApiAndPersistUser(() => api.login(email, password))
    })

    ipcMain.handle('api-register', async (event, email, password, name) => {
        return wrapApiAndPersistUser(() => api.register(email, password, name))
    })

    ipcMain.handle('api-me', async (event, token) => {
        return wrapApiAndPersistUser(() => api.me(token))
    })

    ipcMain.handle('api-refresh', async (event, refreshToken) => {
        return wrapApiAndPersistUser(() => api.refresh(refreshToken))
    })

    ipcMain.handle('api-sync-push', async (event, token, arg1, arg2, arg3) => {
        const pushPromise = wrapApi(() => {
            if (
                arg1 &&
                typeof arg1 === 'object' &&
                !Array.isArray(arg1) &&
                ('messengers' in arg1 || 'folders' in arg1 || 'settings' in arg1)
            ) {
                return api.syncPush(token, arg1.messengers || [], arg1.folders || [], arg1.settings || {})
            }

            return api.syncPush(token, arg1 || [], arg2 || [], arg3 || {})
        })

        // See waitForPendingSyncPush() BUGFIX comment above.
        pendingSyncPush = pushPromise
        const result = await pushPromise
        if (pendingSyncPush === pushPromise) pendingSyncPush = null
        return result
    })

    ipcMain.handle('api-sync-pull', async (event, token) => {
        return wrapApi(() => api.syncPull(token))
    })

    ipcMain.handle('api-notes-list', async (event, token, opts) => {
        return wrapApi(() => api.notesList(token, opts))
    })

    ipcMain.handle('api-notes-create', async (event, token, note) => {
        return wrapApi(() => api.notesCreate(token, note))
    })

    ipcMain.handle('api-notes-update', async (event, token, id, patch) => {
        return wrapApi(() => api.notesUpdate(token, id, patch))
    })

    ipcMain.handle('api-notes-delete', async (event, token, id) => {
        return wrapApi(() => api.notesDelete(token, id))
    })

    ipcMain.handle('api-notes-reorder', async (event, token, order) => {
        return wrapApi(() => api.notesReorder(token, order))
    })

    ipcMain.handle('api-update-profile', async (event, token, data) => {
        return wrapApiAndPersistUser(() => api.updateProfile(token, data))
    })

    ipcMain.handle('api-get-stats', async (event, token) => {
        return wrapApi(() => api.getStats(token))
    })

    ipcMain.handle('api-assistant-usage', async (event, token) => {
        return wrapApi(() => api.getAssistantUsage(token))
    })

    ipcMain.handle('api-logout', async (event, token) => {
        return wrapApi(() => api.logout(token))
    })

    ipcMain.handle('api-get-notifications', async (event, token) => {
        return wrapApi(() => api.getNotifications(token))
    })

    // FEATURE (2026-09-10, TEAM owner-control epic) — desktop-side reads for
    // shared VPN, forced settings, and assigned messengers; the one write is
    // read-status stats (counts/timestamps only, never message content).
    ipcMain.handle('api-org-get-vpn', async (event, token, orgId) => {
        return wrapApi(() => api.orgGetVpn(token, orgId))
    })

    ipcMain.handle('api-org-get-settings', async (event, token, orgId) => {
        return wrapApi(() => api.orgGetSettings(token, orgId))
    })

    ipcMain.handle('api-org-get-messenger-assignments', async (event, token, orgId) => {
        return wrapApi(() => api.orgGetMessengerAssignments(token, orgId))
    })

    ipcMain.handle('api-org-push-messenger-stats', async (event, token, orgId, stats) => {
        return wrapApi(() => api.orgPushMessengerStats(token, orgId, stats))
    })

    ipcMain.handle('api-read-all-notifications', async (event, token) => {
        return wrapApi(() => api.readAllNotifications(token))
    })

    // SECURITY (trial-farming fix): compute hardwareId here in main — exactly
    // like api-device-trial-redeem below — and send it along with every promo
    // redemption. The renderer never supplies this value itself (nothing to
    // spoof); the server uses it to refuse a second free trial-style grant
    // on the same machine regardless of which of the two paths (anonymous
    // device trial vs. promo code on a freshly created account) was used
    // first. See landing/payments-server.js's /promo/redeem for the other
    // half of this fix.
    ipcMain.handle('api-redeem-promo', async (event, token, code) => {
        try {
            const { machineIdSync } = require('node-machine-id')
            const hardwareId = machineIdSync()
            return await wrapApi(() => api.redeemPromo(token, code, hardwareId))
        } catch (error) {
            return normalizeError(error)
        }
    })

    // Onboarding trial for users without an account — machineIdSync() with
    // no args returns node-machine-id's own SHA-256 hash of the platform
    // identifier (not the raw hardware id), so nothing identifying actually
    // leaves the device. Renders "one trial per machine" server-side by
    // that hash instead of "one trial per userId" like PRO14 above.
    ipcMain.handle('api-device-trial-redeem', async () => {
        try {
            const { machineIdSync } = require('node-machine-id')
            const hardwareId = machineIdSync()
            const result = await wrapApi(() => api.deviceTrialRedeem(hardwareId))
            // SECURITY: main persists the trial expiry itself (same rationale as
            // wrapApiAndPersistUser above) — localProTrialExpiresAt is blocked
            // on the generic store:set channel, see PROTECTED_SET_KEYS in main.js.
            if (result.success && typeof result.data?.expiresAt === 'string') {
                entitlement.persistTrialExpiry(result.data.expiresAt)
            }
            return result
        } catch (error) {
            return normalizeError(error)
        }
    })

    ipcMain.handle('api-yandex-desktop', async (event, accessToken) => {
        return wrapApiAndPersistUser(() => api.yandexDesktop(accessToken))
    })

    ipcMain.handle('api-vk-desktop', async (event, accessToken, userId) => {
        return wrapApiAndPersistUser(() => api.vkDesktop(accessToken, userId))
    })

    // ── Tracker IPC ──────────────────────────────────────────────
    // Renderer reports active-tab time every 5 min or on tab switch
    ipcMain.handle('tracker:service-time', async (event, { service, serviceTime }) => {
        try {
            tracker.addServiceTime(service, serviceTime)
            return { success: true }
        } catch {
            return { success: false }
        }
    })

    // Renderer reports message sent
    ipcMain.handle('tracker:msg-sent', async () => {
        tracker.addMsgSent(1)
        return { success: true }
    })

    // Renderer reports notification received (optionally tied to a service
    // name, e.g. 'Telegram', so the dashboard's per-service breakdown works)
    ipcMain.handle('tracker:notif', async (event, count = 1, service = null) => {
        tracker.addNotif(count, service)
        return { success: true }
    })

    // Renderer reports a message received (inferred from a site notification
    // firing — the closest reliable, source-agnostic signal we have across
    // arbitrary messenger web content)
    ipcMain.handle('tracker:msg-received', async (event, count = 1) => {
        tracker.addMsgReceived(count)
        return { success: true }
    })

    ipcMain.on('update-adblock-state', () => {
        const { updateAllSessions } = require('../services/adblock')
        updateAllSessions()
    })
}

module.exports = registerApiIpc
// SECURITY: exported so main/bootstrap/registerAppEvents.js can pin the
// expected <webview> preload path in its will-attach-webview validation
// (see that file for why this matters) without duplicating the candidate-path
// resolution logic here.
module.exports.getWebviewPreloadPath = getWebviewPreloadPath
// Exported so main/bootstrap/registerAppEvents.js's before-quit handler can
// await any in-flight cloud sync push (sidebar reorder / split presets)
// before the process actually exits — see waitForPendingSyncPush() BUGFIX
// comment above.
module.exports.waitForPendingSyncPush = waitForPendingSyncPush