const { app } = require('electron')
const { safeSendToWindow } = require('../utils/window')
const { IPC_CHANNELS } = require('../config/constants')
const { t } = require('./i18n')
const store = require('./store')

let autoUpdater = null
let log = null
let updaterInitialized = false

try {
    autoUpdater = require('electron-updater').autoUpdater
    log = require('electron-log')

    log.transports.file.level = 'info'
    log.transports.console.level = 'info'

    autoUpdater.logger = log
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.disableWebInstaller = true
} catch (error) {
    console.error('[updater] Failed to initialize electron-updater:', error)
    autoUpdater = null
    log = null
}

function writeLog(...args) {
    console.log('[updater]', ...args)
    if (log) {
        log.info('[updater]', ...args)
    }
}

function writeError(...args) {
    console.error('[updater]', ...args)
    if (log) {
        log.error('[updater]', ...args)
    }
}

function sendUpdateStatus(getMainWindow, payload) {
    writeLog('sendUpdateStatus:', JSON.stringify(payload))
    safeSendToWindow(getMainWindow, IPC_CHANNELS.UPDATE_STATUS, payload)
}

function initUpdater(getMainWindow) {
    if (!autoUpdater) {
        writeError('autoUpdater is not available')
        return
    }

    if (updaterInitialized) {
        writeLog('initUpdater skipped: already initialized')
        return
    }

    updaterInitialized = true

    writeLog('initUpdater called')
    writeLog('app.isPackaged =', app.isPackaged)
    writeLog('app version =', app.getVersion())

    autoUpdater.on('checking-for-update', () => {
        writeLog('Event: checking-for-update')
        sendUpdateStatus(getMainWindow, {
            status: 'checking',
            label: t('updater.checking'),
            message: 'Checking for updates...'
        })
    })

    autoUpdater.on('update-available', (info) => {
        writeLog('Event: update-available', JSON.stringify(info))
        sendUpdateStatus(getMainWindow, {
            status: 'available',
            version: info.version,
            label: t('updater.available'),
            message: `Доступна новая версия ${info.version}. Обновление скачивается автоматически.`
        })
    })

    autoUpdater.on('update-not-available', (info) => {
        writeLog('Event: update-not-available', JSON.stringify(info))
        sendUpdateStatus(getMainWindow, {
            status: 'not-available',
            label: t('updater.notAvailable'),
            message: 'No updates found.'
        })
    })

    autoUpdater.on('download-progress', (progress) => {
        const percent = Math.round(progress.percent || 0)

        writeLog(
            'Event: download-progress',
            `percent=${percent}`,
            `transferred=${progress.transferred}`,
            `total=${progress.total}`
        )

        sendUpdateStatus(getMainWindow, {
            status: 'downloading',
            percent,
            label: t('updater.downloading'),
            message: `Скачивание обновления: ${percent}%`
        })
    })

    autoUpdater.on('update-downloaded', async (info) => {
        writeLog('Event: update-downloaded', JSON.stringify(info))

        // electron-updater already verifies the downloaded package's checksum
        // against the published latest.yml before firing this event (it emits
        // 'error' instead on a hash mismatch) — that part of "integrity check"
        // is handled upstream. What wasn't covered at all: whether the app
        // actually ends up running the new version after quitAndInstall
        // relaunches it. Recording the intended target version here lets
        // checkPendingUpdateOutcome() (called on next startup, see initApp.js)
        // detect a relaunch that silently stayed on the old version — e.g. the
        // installer failing partway, or the new binary crashing on launch
        // before Electron's app.getVersion() would even be observable.
        try {
            store.set('pendingUpdate', {
                fromVersion: app.getVersion(),
                toVersion: info.version,
                at: Date.now()
            })
        } catch {}

        sendUpdateStatus(getMainWindow, {
            status: 'downloaded',
            version: info.version,
            label: t('updater.downloaded'),
            message: `Обновление ${info.version} скачано и готово к установке.`
        })
    })

    autoUpdater.on('error', (err) => {
        writeError('Event: error', err && err.stack ? err.stack : err)

        sendUpdateStatus(getMainWindow, {
            status: 'error',
            error: err?.message || String(err),
            label: t('updater.error'),
            message: 'Failed to check or download update.'
        })
    })
}

async function checkForUpdates() {
    if (!autoUpdater) {
        writeError('checkForUpdates aborted: autoUpdater is not available')
        return null
    }

    if (!app.isPackaged) {
        writeLog('checkForUpdates aborted: app is not packaged')
        return null
    }

    try {
        writeLog('checkForUpdates called')
        writeLog('Current version:', app.getVersion())

        const result = await autoUpdater.checkForUpdates()

        writeLog('checkForUpdates result received')

        if (result?.updateInfo) {
            writeLog('updateInfo:', JSON.stringify(result.updateInfo))
        } else {
            writeLog('No updateInfo returned from checkForUpdates')
        }

        return result
    } catch (err) {
        writeError('checkForUpdates failed:', err && err.stack ? err.stack : err)
        throw err
    }
}

function installUpdate() {
    if (!autoUpdater) {
        writeError('installUpdate aborted: autoUpdater is not available')
        return
    }

    writeLog('quitAndInstall called')
    autoUpdater.quitAndInstall()
}

// Called once at startup (see initApp.js). Detects an auto-update that was
// attempted (quitAndInstall was called after a verified download) but that
// the app apparently didn't end up running after relaunch — the strongest
// available signal, from inside this process, that an update silently
// failed to apply. This is detection only, not a true rollback: Electron
// gives no supported way to revert an in-place NSIS/Squirrel install from
// JS post-relaunch, and attempting one blind (e.g. hunting for a previous
// installer executable) would risk making a bad situation worse. Surfacing
// it to crash.log + the server crash-report endpoint at least makes a
// silently-stuck-on-old-version fleet visible instead of invisible.
function checkPendingUpdateOutcome({ appendCrashLog, reportCrashToServer } = {}) {
    try {
        const pending = store.get('pendingUpdate', null)
        if (!pending) return

        const currentVersion = app.getVersion()

        // Give the install+relaunch cycle a grace window — comparing
        // immediately at startup would also fire this for a normal, still
        // in-flight update that just hasn't reached quitAndInstall yet.
        const GRACE_MS = 2 * 60 * 1000
        if (Date.now() - pending.at < GRACE_MS) return

        if (currentVersion === pending.toVersion) {
            writeLog('update applied successfully:', pending.fromVersion, '->', currentVersion)
        } else {
            writeError(
                'update did not apply as expected — still on', currentVersion,
                'expected', pending.toVersion, '(from', pending.fromVersion + ')'
            )
            const detail = { fromVersion: pending.fromVersion, toVersion: pending.toVersion, actualVersion: currentVersion }
            appendCrashLog && appendCrashLog('update-failed-to-apply', detail)
            reportCrashToServer && reportCrashToServer('update-failed-to-apply', detail)
        }

        store.delete('pendingUpdate')
    } catch (err) {
        writeError('checkPendingUpdateOutcome failed:', err?.message || err)
    }
}

module.exports = {
    initUpdater,
    checkForUpdates,
    installUpdate,
    checkPendingUpdateOutcome
}