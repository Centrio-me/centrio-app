'use strict'
// «Удалил программу» (3.7.4, Windows only). The Windows uninstaller (build/installer.nsh) cannot reach the app's
// store, so the app leaves its anonymous install id in a tiny file next to the profile; the uninstaller posts it to
// POST /api/visitors/uninstalled. While the person is signed in, the app links that install id to the account once
// per launch (POST /api/visitors/link), so the removal lands in the right profile in the admin. Only the random
// install id and the version leave the computer — no names, no content.
const fs = require('fs')
const path = require('path')

const UNINSTALL_FILE = 'uninstall-id.json' // keep in sync with build/installer.nsh
const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** @returns {{ visitorId: string, appVersion: string } | null} */
function uninstallFilePayload(visitorId, appVersion) {
    if (typeof visitorId !== 'string' || !VISITOR_ID_RE.test(visitorId)) return null
    return { visitorId, appVersion: String(appVersion || '') }
}

/** @param {{ platform: string, countsAsVisitor: boolean }} env */
function shouldWriteUninstallFile(env) {
    return env.platform === 'win32' && env.countsAsVisitor === true
}

/** Writes the file when its content changed. @returns {boolean} whether it wrote */
function writeUninstallFile(dir, visitorId, appVersion) {
    const payload = uninstallFilePayload(visitorId, appVersion)
    if (!payload) return false
    const file = path.join(dir, UNINSTALL_FILE)
    const next = JSON.stringify(payload)
    try {
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return false
        fs.writeFileSync(file, next, 'utf8')
        return true
    } catch {
        return false
    }
}

/**
 * @param {(token: string, body: object) => Promise<unknown>} send
 * @returns {(token: string, visitorId: string, appVersion: string) => Promise<void>}
 */
function createLinker(send) {
    let done = false
    let inFlight = null
    return async function link(token, visitorId, appVersion) {
        if (done || !token || !uninstallFilePayload(visitorId, appVersion)) return
        if (inFlight) return inFlight
        inFlight = send(token, { visitorId, appVersion: String(appVersion || ''), platform: process.platform })
            .then(() => { done = true })
            .catch(() => {})
            .finally(() => { inFlight = null })
        return inFlight
    }
}

module.exports = { UNINSTALL_FILE, uninstallFilePayload, shouldWriteUninstallFile, writeUninstallFile, createLinker }
