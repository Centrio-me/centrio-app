const { ipcMain, dialog, app } = require('electron')
const fs = require('fs')
const path = require('path')
const store = require('../services/store')
const { t } = require('../services/i18n')

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

// Only settings that are (a) plain, non-secret preference data and (b) portable
// across machines are eligible for export/import. Deliberately excluded:
//   - `cloud`            — holds live auth tokens (access/refresh); exporting these
//                           to a plain JSON file would leak a working session to
//                           whoever gets the file, and importing them on another
//                           machine would silently hijack that machine's session.
//   - `security`, `pinHash`, `pinEnabled`, `lockOnStartup` — PIN lock state. A
//                           hash without its app-lock context isn't safely
//                           transferable, and importing `lockOnStartup: true`
//                           without a matching `pinHash` would lock the user out
//                           on the new machine with no way to unlock.
//   - `vpnActiveLink`, `vpnSubUrl`, `vpnSubLinks` — encrypted at rest via
//                           `secureStore.js` (Electron `safeStorage`, tied to the
//                           OS user/machine keychain). The ciphertext is not
//                           portable: decrypting it on a different machine either
//                           fails outright or (on some platforms) returns garbage,
//                           which would leave VPN state broken silently on import.
// Everything else is inert UI/behavior preference data — safe to move as-is.
const PORTABLE_KEYS = [
    'settings', 'folders', 'messengers', 'mutedMessengers', 'globalMuteAll',
    'globalProxy', 'sidebarOrder', 'foldersEnabled', 'menuCollapsed',
    'tabZoomLevel', 'appZoomLevel', 'split', 'vpnAppModes', 'extensionsState'
]

function buildExportPayload() {
    const data = {}
    for (const key of PORTABLE_KEYS) {
        const value = store.get(key)
        if (value !== undefined) {
            data[key] = value
        }
    }

    return {
        __centrioSettingsExport: true,
        version: 1,
        appVersion: app.getVersion(),
        exportedAt: new Date().toISOString(),
        data
    }
}

function isValidImportPayload(payload) {
    return Boolean(
        payload &&
        typeof payload === 'object' &&
        payload.__centrioSettingsExport === true &&
        payload.data &&
        typeof payload.data === 'object'
    )
}

function applyImportPayload(payload) {
    const applied = []

    for (const key of PORTABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload.data, key)) {
            store.set(key, payload.data[key])
            applied.push(key)
        }
    }

    return applied
}

function registerSettingsPortabilityIpc({ getMainWindow }) {
    safeHandle('settings:export', async () => {
        const win = getMainWindow()

        const result = await dialog.showSaveDialog(win || undefined, {
            title: t('dialogs.exportSettings', 'Export settings'),
            defaultPath: path.join(
                app.getPath('documents'),
                `centrio-settings-${new Date().toISOString().slice(0, 10)}.json`
            ),
            filters: [
                { name: t('dialogs.jsonFilter', 'JSON file'), extensions: ['json'] }
            ]
        })

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true }
        }

        try {
            const payload = buildExportPayload()
            fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
            return { success: true, path: result.filePath, keys: Object.keys(payload.data) }
        } catch (err) {
            console.error('[settingsPortability] export failed:', err)
            return { success: false, error: err.message }
        }
    })

    safeHandle('settings:import', async () => {
        const win = getMainWindow()

        const result = await dialog.showOpenDialog(win || undefined, {
            title: t('dialogs.importSettings', 'Import settings'),
            properties: ['openFile'],
            filters: [
                { name: t('dialogs.jsonFilter', 'JSON file'), extensions: ['json'] }
            ]
        })

        if (result.canceled || !result.filePaths?.length) {
            return { success: false, canceled: true }
        }

        let payload
        try {
            const raw = fs.readFileSync(result.filePaths[0], 'utf8')
            payload = JSON.parse(raw)
        } catch (err) {
            return { success: false, error: 'invalid-json' }
        }

        if (!isValidImportPayload(payload)) {
            return { success: false, error: 'invalid-format' }
        }

        try {
            const applied = applyImportPayload(payload)
            return { success: true, appliedKeys: applied }
        } catch (err) {
            console.error('[settingsPortability] import failed:', err)
            return { success: false, error: err.message }
        }
    })
}

module.exports = { registerSettingsPortabilityIpc }
