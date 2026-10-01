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

// ── Установка при запуске ───────────────────────────────────────────────
// Обновление скачивается само, но ставится только при настоящем выходе из
// приложения (autoInstallOnAppQuit) или по кнопке в карточке. По умолчанию
// крестик прячет Centrio в трей, а при выключении/перезагрузке Windows
// Electron вообще не присылает before-quit/quit — поэтому у тех, кто просто
// выключает компьютер, скачанное обновление не устанавливалось неделями.
// Теперь уже скачанное обновление ставится при ближайшем запуске, пока
// пользователь ещё ничего не начал делать. Защита от цикла: не больше
// AUTO_INSTALL_MAX_ATTEMPTS попыток на одну версию — дальше остаётся кнопка.
const AUTO_INSTALL_STARTUP_WINDOW_S = 120
const AUTO_INSTALL_MAX_ATTEMPTS = 2
const AUTO_INSTALL_DELAY_MS = 5000
let autoInstallScheduled = false

function getAutoInstallAttempts(version) {
    const rec = store.get('autoInstall', null)
    return rec && rec.version === version ? (rec.attempts || 0) : 0
}

function shouldAutoInstallOnLaunch(version) {
    if (process.platform !== 'win32') return false
    if (autoInstallScheduled) return false
    if (process.uptime() > AUTO_INSTALL_STARTUP_WINDOW_S) return false
    return getAutoInstallAttempts(version) < AUTO_INSTALL_MAX_ATTEMPTS
}

function scheduleAutoInstall(getMainWindow, version) {
    autoInstallScheduled = true
    const attempts = getAutoInstallAttempts(version) + 1
    try { store.set('autoInstall', { version, attempts, at: Date.now() }) } catch {}
    writeLog('auto-install on launch scheduled for', version, '(attempt', attempts + '/' + AUTO_INSTALL_MAX_ATTEMPTS + ')')
    sendUpdateStatus(getMainWindow, {
        status: 'installing',
        version,
        label: t('updater.installing'),
        message: 'Installing update, the app will restart...'
    })
    setTimeout(() => installUpdate({ auto: true }), AUTO_INSTALL_DELAY_MS)
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

        if (shouldAutoInstallOnLaunch(info.version)) {
            scheduleAutoInstall(getMainWindow, info.version)
        }
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

function installUpdate({ auto = false } = {}) {
    if (!autoUpdater) {
        writeError('installUpdate aborted: autoUpdater is not available')
        return
    }

    // Отмечаем, что установку действительно запускали: только тогда «версия не
    // сменилась» — это сбой установки, а не просто «пользователь ещё не ставил».
    try {
        const pending = store.get('pendingUpdate', null)
        if (pending) store.set('pendingUpdate', { ...pending, installTriggeredAt: Date.now(), auto })
    } catch {}

    writeLog('quitAndInstall called', auto ? '(automatic, on launch)' : '(by user)')
    autoUpdater.quitAndInstall()
}

// Called once at startup (see initApp.js). Compares the version the app is
// running with the update it downloaded last time.
//   • version matches            → applied successfully;
//   • install was triggered, version unchanged → 'update-failed-to-apply'
//     (the installer ran or was requested and the old version came back);
//   • install never triggered    → 'update-not-installed' (downloaded but the
//     app was never quit through the normal path, e.g. Windows shutdown with
//     the app in the tray). Reported once per version: before this split every
//     such restart was counted as a failed install (345 reports from 57
//     installs), which hid the real cause.
// Detection only, not a rollback — Electron has no supported way to revert an
// in-place NSIS install from JS.
function checkPendingUpdateOutcome({ appendCrashLog, reportCrashToServer } = {}) {
    try {
        const pending = store.get('pendingUpdate', null)
        if (!pending) return

        const currentVersion = app.getVersion()

        // Grace window: an install+relaunch cycle (or a download that just
        // finished) must not be judged before it had time to complete.
        const GRACE_MS = 2 * 60 * 1000
        const reference = pending.installTriggeredAt || pending.at
        if (Date.now() - reference < GRACE_MS) return

        if (currentVersion === pending.toVersion) {
            writeLog('update applied successfully:', pending.fromVersion, '->', currentVersion)
            store.delete('autoInstall')
        } else if (pending.installTriggeredAt) {
            writeError(
                'update install was triggered but the app is still on', currentVersion,
                'expected', pending.toVersion, '(from', pending.fromVersion + ')'
            )
            const detail = { fromVersion: pending.fromVersion, toVersion: pending.toVersion, actualVersion: currentVersion, auto: !!pending.auto }
            appendCrashLog && appendCrashLog('update-failed-to-apply', detail)
            reportCrashToServer && reportCrashToServer('update-failed-to-apply', detail)
        } else {
            writeLog('update', pending.toVersion, 'was downloaded but not installed yet (still on', currentVersion + ')')
            if (store.get('notInstalledReported', null) !== pending.toVersion) {
                const detail = { fromVersion: pending.fromVersion, toVersion: pending.toVersion, actualVersion: currentVersion }
                appendCrashLog && appendCrashLog('update-not-installed', detail)
                reportCrashToServer && reportCrashToServer('update-not-installed', detail)
                store.set('notInstalledReported', pending.toVersion)
            }
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