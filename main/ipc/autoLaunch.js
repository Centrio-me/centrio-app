const { ipcMain, app } = require('electron')

let log
try { log = require('electron-log') } catch { log = console }

// BUGFIX ("настройка 'запускать с системой' не работает"): this used to go
// through the third-party `auto-launch` package, which on Windows shells out
// to `reg.exe` via `winreg` and parses its text output. That's an extra,
// fragile moving part (locale-dependent stdout parsing, relies on `reg.exe`
// being reachable) for something Electron already does natively and more
// reliably — app.setLoginItemSettings()/getLoginItemSettings() write/read the
// same HKCU Run key directly through the OS APIs, with no subprocess and no
// text parsing to break. This also removes the failure mode entirely instead
// of just reporting it better.

// BUGFIX #2 ("автозапуск не срабатывает при включении компьютера"): the Run
// key above is only half the story on Windows. Task Manager's "Startup
// apps" tab (and, on first run of an unsigned/unrecognized app, Windows
// Defender/SmartScreen) can silently flip a SEPARATE enabled/disabled flag
// for the same entry under the StartupApproved registry key — WITHOUT
// touching the Run key at all. getLoginItemSettings().openAtLogin then keeps
// reporting true (the Run key still exists) forever, so our checkbox stays
// checked and set-auto-launch keeps reporting success, while the app simply
// never launches at boot. We can't flip that flag back programmatically (no
// public API — it's an explicit OS security gate), but Electron does expose
// the real state via launchItems[].enabled, so we can at least detect it and
// tell the user to re-enable it themselves in Task Manager instead of lying
// with a checked-but-non-functional toggle.
function isDisabledByWindows() {
    if (process.platform !== 'win32') return false
    try {
        const { openAtLogin, launchItems } = app.getLoginItemSettings()
        if (!openAtLogin || !Array.isArray(launchItems) || launchItems.length === 0) return false

        // BUGFIX ("Windows отключила автозапуск для Centrio" shown even
        // though Task Manager's Startup tab clearly says Enabled): Windows
        // paths are case-insensitive but the old `===` comparison here was
        // case-sensitive, so a harmless casing difference between
        // process.execPath and what Windows reports back made the match
        // fail — falling through to the `|| launchItems[0]` fallback, which
        // could be a COMPLETELY UNRELATED startup entry (any other app on
        // the system), reporting ITS enabled state as ours. Case-insensitive
        // compare, and no more guessing via launchItems[0] — if we can't
        // positively identify our own entry, don't claim anything about it.
        const ours = launchItems.find((item) =>
            typeof item.path === 'string' && item.path.toLowerCase() === process.execPath.toLowerCase()
        )
        return ours ? ours.enabled === false : false
    } catch (err) {
        log.warn('[autoLaunch] isDisabledByWindows check failed:', err.message)
        return false
    }
}

function registerAutoLaunchIpc() {
    ipcMain.on('set-auto-launch', async (event, enabled) => {
        try {
            app.setLoginItemSettings({ openAtLogin: !!enabled })
            event.reply('auto-launch-result', {
                success: true,
                enabled: !!enabled,
                disabledByOS: enabled ? isDisabledByWindows() : false
            })
        } catch (err) {
            log.error('[autoLaunch] set-auto-launch failed:', err)
            event.reply('auto-launch-result', { success: false, error: err.message })
        }
    })

    ipcMain.handle('get-auto-launch', async () => {
        try {
            const openAtLogin = !!app.getLoginItemSettings().openAtLogin
            return { openAtLogin, disabledByOS: openAtLogin && isDisabledByWindows() }
        } catch (err) {
            log.error('[autoLaunch] get-auto-launch failed:', err)
            return { openAtLogin: false, disabledByOS: false }
        }
    })
}

module.exports = registerAutoLaunchIpc