'use strict'
// Why an update did not install (3.7.1). Sent with the 'update-failed-to-apply' report so the cause stops being a guess:
// where the app lives, whether that folder can be written to, whether the downloaded installer is still there, and the
// last error of the updater. No personal data: user folders in paths are replaced by %LOCALAPPDATA% / %USERPROFILE%.
const path = require('path')

const MAX_ERROR = 300

const lower = (p) => String(p || '').toLowerCase()

function installKind(execPath, env) {
    const exe = lower(execPath)
    const under = (dir) => !!dir && exe.startsWith(lower(dir).replace(/\\+$/, '') + '\\')
    if (under(env.PROGRAMFILES) || under(env['PROGRAMFILES(X86)']) || under(env.ProgramW6432)) return 'program-files'
    if (under(env.LOCALAPPDATA) && exe.includes('\\programs\\')) return 'per-user'
    return 'custom'
}

function scrubPaths(text, env) {
    let out = String(text || '')
    const pairs = [['LOCALAPPDATA', env.LOCALAPPDATA], ['APPDATA', env.APPDATA], ['USERPROFILE', env.USERPROFILE]]
    for (const [name, value] of pairs) {
        if (!value) continue
        out = out.split(value).join(`%${name}%`)
        out = out.split(value.replace(/\\/g, '/')).join(`%${name}%`)
    }
    // Any other user folder that slipped through
    out = out.replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/'"\s]+/g, '$1<user>')
    return out.slice(0, MAX_ERROR)
}

function collectInstallDiagnostics({ execPath, env = process.env, fs = require('fs'), updaterCacheDirName, lastError }) {
    const dir = path.win32.dirname(String(execPath || ''))
    let installDirWritable = false
    let installDirError = null
    const probe = path.win32.join(dir, `.centrio-write-test-${process.pid}`)
    try {
        fs.writeFileSync(probe, 'x')
        installDirWritable = true
        try { fs.unlinkSync(probe) } catch { /* left behind is harmless */ }
    } catch (e) {
        installDirError = String(e && e.code ? e.code : 'ERROR').slice(0, 30)
    }

    let installerCached = null
    if (updaterCacheDirName && env.LOCALAPPDATA) {
        const pending = path.win32.join(env.LOCALAPPDATA, updaterCacheDirName, 'pending')
        try { installerCached = fs.readdirSync(pending).some((name) => /\.exe$/i.test(name)) } catch { installerCached = false }
    }

    const result = { installKind: installKind(execPath, env), installDirWritable }
    if (installDirError) result.installDirError = installDirError
    result.installerCached = installerCached
    if (lastError) result.lastError = scrubPaths(lastError, env)
    return result
}

module.exports = { installKind, scrubPaths, collectInstallDiagnostics }
