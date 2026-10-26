// Is this a laptop? A desktop PC reports a "battery" of 100% that is always charging in the web API, so the answer
// comes from the operating system: Windows lists batteries (Win32_Battery), macOS prints an InternalBattery line,
// Linux has BAT* entries under /sys/class/power_supply. The result never changes while the app runs, so it is cached.
// On Windows PowerShell is only the first try: on PCs where it is restricted (company policy) or broken it fails, and a
// laptop was then taken for a desktop, so the battery never showed. The next tries need no PowerShell.
const { execFile } = require('child_process')
const fs = require('fs')

const CHECK_TIMEOUT_MS = 8000
let cached = null

// The output, or null when the command could not run (missing, blocked, timed out, exited with an error).
function run(command, args) {
    return new Promise((resolve) => {
        execFile(command, args, { timeout: CHECK_TIMEOUT_MS, windowsHide: true }, (error, stdout) => resolve(error ? null : String(stdout)))
    })
}

async function detectWindows() {
    const ps = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '@(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count'])
    if (ps !== null && /^\d+$/.test(ps.trim())) return parseInt(ps.trim(), 10) > 0
    // WMI command line tool (older Windows, and Windows 11 until it was removed)
    const wmic = await run('wmic', ['path', 'Win32_Battery', 'get', 'BatteryStatus'])
    if (wmic !== null && /\d/.test(wmic)) return true
    // A battery is a device with the ACPI id PNP0C0A in the device registry: no PowerShell, no WMI
    const reg = await run('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\ACPI', '/s', '/f', 'PNP0C0A', '/k'])
    return reg !== null && /PNP0C0A/i.test(reg)
}

async function detect() {
    if (process.platform === 'win32') return detectWindows()
    if (process.platform === 'darwin') {
        return /InternalBattery/i.test((await run('pmset', ['-g', 'batt'])) || '')
    }
    try {
        return fs.readdirSync('/sys/class/power_supply').some((name) => {
            if (!/^BAT/i.test(name)) return false
            try { return fs.readFileSync('/sys/class/power_supply/' + name + '/type', 'utf8').trim() === 'Battery' } catch { return false }
        })
    } catch {
        return false
    }
}

async function hasBattery() {
    if (cached === null) cached = await detect()
    return cached
}

module.exports = { hasBattery }
