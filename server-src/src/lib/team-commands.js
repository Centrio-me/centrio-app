// Commands from the owner to an employee's devices (TEAM control, 2026-11-08).
// One row per device; a device confirms each one. A device whose person was removed from the team
// still fetches its pending wipe, signing a short proof with its own P-256 device key.
const crypto = require('crypto')

const KINDS_WITH_MESSENGER = new Set(['pause', 'resume', 'reload', 'relogin'])
// refresh (2026-11-11): the app reads the account and the team again at once
const KINDS = new Set([...KINDS_WITH_MESSENGER, 'wipe', 'refresh'])
const PROOF_WINDOW_MIN = 2

function planCommands(kind, { orgId, userId, deviceKeyIds, payload, createdById }) {
    const targets = deviceKeyIds.length > 0 ? deviceKeyIds : [`user:${userId}`]
    return targets.map((deviceKeyId) => ({ orgId, userId, deviceKeyId, kind, payload, createdById }))
}

function parseCommandBody(body, ownAssignmentIds) {
    const kind = String(body?.kind || '')
    if (!KINDS.has(kind)) return { error: 'Неизвестная команда' }
    if (kind === 'wipe') return { kind, payload: { assignmentIds: 'all' } }
    if (kind === 'refresh') return { kind, payload: {} }
    const assignmentId = String(body?.assignmentId || '')
    if (!assignmentId || !ownAssignmentIds.has(assignmentId)) return { error: 'Мессенджер не найден у этого сотрудника' }
    return { kind, payload: { assignmentId } }
}

function proofMessage(deviceKeyId, at) {
    return `centrio-device|${deviceKeyId}|${Math.floor(at.getTime() / 60000)}`
}

function verifyDeviceProof({ publicKey, deviceKeyId, proof, now }) {
    try {
        const key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' })
        const signature = Buffer.from(String(proof), 'base64')
        for (let back = 0; back <= PROOF_WINDOW_MIN - 1; back++) {
            const msg = Buffer.from(proofMessage(deviceKeyId, new Date(now.getTime() - back * 60000)))
            if (crypto.verify('sha256', msg, key, signature)) return true
        }
        return false
    } catch {
        return false
    }
}

function isAllowedAssignmentUrl(value) {
    try {
        const url = new URL(String(value))
        return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
        return false
    }
}

// A saved password belongs to one site: it may stay only when the address keeps the same scheme and host
// (TEAM review I1, 2026-11-08), otherwise an edited address would receive a password set for another site.
function passwordSurvivesUrlChange(oldUrl, newUrl) {
    try {
        const a = new URL(String(oldUrl))
        const b = new URL(String(newUrl))
        return a.protocol === b.protocol && a.host === b.host
    } catch {
        return false
    }
}

// «выполнено на N из M устройств» for the newest batch of a kind.
function deliverySummary(rows, kind) {
    const ofKind = rows.filter((r) => r.kind === kind)
    if (ofKind.length === 0) return { done: 0, total: 0 }
    const newest = Math.max(...ofKind.map((r) => new Date(r.createdAt).getTime()))
    const batch = ofKind.filter((r) => new Date(r.createdAt).getTime() === newest)
    return { done: batch.filter((r) => r.doneAt).length, total: batch.length }
}

module.exports = { passwordSurvivesUrlChange, planCommands, parseCommandBody, proofMessage, verifyDeviceProof, isAllowedAssignmentUrl, deliverySummary, KINDS }
