// Headers a device sends to /api/org-device when it may no longer be in the team (2026-11-08).
const vault = require('./vault')

function proofHeaders(userId, deviceKeyId) {
    if (!userId || !deviceKeyId) return { success: false, error: 'NO_DEVICE' }
    const proof = vault.signDeviceProof(userId, deviceKeyId)
    if (!proof) return { success: false, error: 'NO_KEY' }
    return { success: true, headers: { 'X-Device-Key': deviceKeyId, 'X-Device-Proof': proof } }
}

module.exports = { proofHeaders }
