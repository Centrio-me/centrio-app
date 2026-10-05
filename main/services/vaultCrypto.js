// Team password vault — shared crypto (2026-10-05). The same code runs in the browser (the owner encrypts, see
// the website's team page) and here in the main process (this device decrypts). WebCrypto only.
//
//   ECIES: ephemeral ECDH P-256  ->  HKDF-SHA256 (salt = ephemeralPub || recipientPub, info = "centrio-vault-v1")
//          ->  AES-256-GCM with a random 96-bit IV; the context "orgId|assignmentId|deviceKeyId" is the AAD, so a
//          blob cannot be moved to another messenger, org or device.
//
// Blob format: { v: 1, epk: <raw uncompressed P-256 point, base64>, iv: <base64>, ct: <ciphertext+tag, base64> }
const subtle = globalThis.crypto.subtle
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const INFO = textEncoder.encode('centrio-vault-v1')
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }

function toB64(bytes) {
    let binary = ''
    const view = new Uint8Array(bytes)
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i])
    return btoa(binary)
}

function fromB64(text) {
    const binary = atob(text)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
}

function concat(a, b) {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
}

async function deriveAesKey(sharedBits, ephemeralRaw, recipientRaw, usage) {
    const base = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
    return subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: concat(ephemeralRaw, recipientRaw), info: INFO },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage]
    )
}

/** A fresh device key pair: { publicKey: SPKI base64 (sent to the server), privateKey: PKCS8 base64 (stays on the device) }. */
async function generateDeviceKeyPair() {
    const pair = await subtle.generateKey(ECDH, true, ['deriveBits'])
    return {
        publicKey: toB64(await subtle.exportKey('spki', pair.publicKey)),
        privateKey: toB64(await subtle.exportKey('pkcs8', pair.privateKey))
    }
}

/** Encrypts { u, p } for one device. recipientSpkiB64 comes from the server, aad = "orgId|assignmentId|deviceKeyId". */
async function encryptForDevice(secret, recipientSpkiB64, aad) {
    const recipientPublic = await subtle.importKey('spki', fromB64(recipientSpkiB64), ECDH, true, [])
    const recipientRaw = new Uint8Array(await subtle.exportKey('raw', recipientPublic))
    const ephemeral = await subtle.generateKey(ECDH, true, ['deriveBits'])
    const ephemeralRaw = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey))
    const shared = await subtle.deriveBits({ name: 'ECDH', public: recipientPublic }, ephemeral.privateKey, 256)
    const key = await deriveAesKey(shared, ephemeralRaw, recipientRaw, 'encrypt')
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: textEncoder.encode(aad) },
        key,
        textEncoder.encode(JSON.stringify(secret))
    )
    return { v: 1, epk: toB64(ephemeralRaw), iv: toB64(iv), ct: toB64(ciphertext) }
}

/** Decrypts a blob with this device's private key. Throws if the key, the context (aad) or the data do not match. */
async function decryptWithDeviceKey(blob, privatePkcs8B64, ownSpkiB64, aad) {
    if (!blob || blob.v !== 1) throw new Error('Unsupported blob')
    const privateKey = await subtle.importKey('pkcs8', fromB64(privatePkcs8B64), ECDH, false, ['deriveBits'])
    const ownPublic = await subtle.importKey('spki', fromB64(ownSpkiB64), ECDH, true, [])
    const recipientRaw = new Uint8Array(await subtle.exportKey('raw', ownPublic))
    const ephemeralRaw = fromB64(blob.epk)
    const ephemeralPublic = await subtle.importKey('raw', ephemeralRaw, ECDH, false, [])
    const shared = await subtle.deriveBits({ name: 'ECDH', public: ephemeralPublic }, privateKey, 256)
    const key = await deriveAesKey(shared, ephemeralRaw, recipientRaw, 'decrypt')
    const plaintext = await subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: textEncoder.encode(aad) },
        key,
        fromB64(blob.ct)
    )
    return JSON.parse(textDecoder.decode(plaintext))
}

module.exports = { generateDeviceKeyPair, encryptForDevice, decryptWithDeviceKey, toB64, fromB64 }
