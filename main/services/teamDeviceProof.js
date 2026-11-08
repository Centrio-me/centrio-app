// Proof that a request comes from this device (TEAM control, 2026-11-08): an ECDSA P-256 signature
// over "centrio-device|<deviceKeyId>|<minute>" with the vault device key. The API checks it against
// the public key the device registered (server lib/team-commands.js verifyDeviceProof).
const crypto = require('crypto')

function signProof(privateKeyPkcs8B64, deviceKeyId, now = new Date()) {
    const key = crypto.createPrivateKey({ key: Buffer.from(privateKeyPkcs8B64, 'base64'), format: 'der', type: 'pkcs8' })
    const message = `centrio-device|${deviceKeyId}|${Math.floor(now.getTime() / 60000)}`
    return crypto.sign('sha256', Buffer.from(message), key).toString('base64')
}

module.exports = { signProof }
