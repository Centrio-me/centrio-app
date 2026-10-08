// Is this a laptop? A desktop PC reports a "battery" of 100% that is always charging in the web API, so the answer
// comes from the operating system: Windows lists batteries (Win32_Battery), macOS prints an InternalBattery line,
// Linux has BAT* entries under /sys/class/power_supply. The result never changes while the app runs, so it is cached.
const { execFile } = require('child_process')
const fs = require('fs')

const CHECK_TIMEOUT_MS = 8000
let cached = null

function run(command, args) {
    return new Promise((resolve) => {
        execFile(command, args, { timeout: CHECK_TIMEOUT_MS, windowsHide: true }, (error, stdout) => resolve(error ? '' : String(stdout)))
    })
}

async function detect() {
    if (process.platform === 'win32') {
        const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '@(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count'])
        return parseInt(out.trim(), 10) > 0
    }
    if (process.platform === 'darwin') {
        return /InternalBattery/i.test(await run('pmset', ['-g', 'batt']))
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
