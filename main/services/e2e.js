'use strict'
// End-to-end encryption between this computer and the user's phones (the message feed and replies typed on the phone).
//
// Nothing here is ever sent to the server in readable form. The computer and each phone have an X25519 key pair; the key
// of a phone is trusted only after the phone proves it scanned THIS computer's QR code (an HMAC with the secret in the QR,
// which the server never sees), so the server cannot slip in a key of its own. Every message is sealed with AES-256-GCM
// under a key derived from the two long-term keys (HKDF-SHA256, fresh salt per message), and the sealed text is bound to
// the message reference, the direction and both key ids (GCM additional data), so a packet cannot be replayed elsewhere.
//
// The same scheme is implemented on the phone in lib/core/crypto/e2e_crypto.dart; test vectors keep the two in step.
const crypto = require('crypto')

const VERSION = 1
const SALT_LEN = 16
const IV_LEN = 12
const PAIRING_TTL_MS = 10 * 60 * 1000
const D2P = 'd2p' // desktop -> phone (the message feed)
const P2D = 'p2d' // phone -> desktop (a reply)

const b64 = (buf) => Buffer.from(buf).toString('base64')
const fromB64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
    return {
        pub: fromB64(publicKey.export({ format: 'jwk' }).x),
        priv: fromB64(privateKey.export({ format: 'jwk' }).d)
    }
}

function importPrivate(priv, pub) {
    return crypto.createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: b64url(priv), x: b64url(pub) }, format: 'jwk' })
}
function importPublic(pub) {
    return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64url(pub) }, format: 'jwk' })
}

/** Short stable id of a public key: how a message says which computer sealed it. */
function keyIdOf(pub) {
    return b64url(crypto.createHash('sha256').update(pub).digest()).slice(0, 12)
}

function deriveKey(myPriv, myPub, theirPub, salt, direction) {
    const shared = crypto.diffieHellman({ privateKey: importPrivate(myPriv, myPub), publicKey: importPublic(theirPub) })
    return Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.from('centrio-e2e-v1|' + direction), 32))
}

function aadFor(ref, direction, desktopKeyId, phoneDeviceId) {
    return Buffer.from(`${ref}|${direction}|${desktopKeyId}|${phoneDeviceId}`, 'utf8')
}

/** Seals `plain` (a string) with the two long-term keys. Returns base64: version, salt, iv, ciphertext and tag. */
function seal({ myPriv, myPub, theirPub, direction, ref, desktopKeyId, phoneDeviceId, plain, salt = crypto.randomBytes(SALT_LEN), iv = crypto.randomBytes(IV_LEN) }) {
    const key = deriveKey(myPriv, myPub, theirPub, salt, direction)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(aadFor(ref, direction, desktopKeyId, phoneDeviceId))
    const body = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final(), cipher.getAuthTag()])
    return b64(Buffer.concat([Buffer.from([VERSION]), salt, iv, body]))
}

/** Opens a packet made by seal(). Returns the string, or null when it was not made for these keys and this context. */
function open({ myPriv, myPub, theirPub, direction, ref, desktopKeyId, phoneDeviceId, enc }) {
    try {
        const raw = fromB64(enc)
        if (raw.length < 1 + SALT_LEN + IV_LEN + 16 || raw[0] !== VERSION) return null
        const salt = raw.subarray(1, 1 + SALT_LEN)
        const iv = raw.subarray(1 + SALT_LEN, 1 + SALT_LEN + IV_LEN)
        const body = raw.subarray(1 + SALT_LEN + IV_LEN)
        const key = deriveKey(myPriv, myPub, theirPub, salt, direction)
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAAD(aadFor(ref, direction, desktopKeyId, phoneDeviceId))
        decipher.setAuthTag(body.subarray(body.length - 16))
        return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8')
    } catch {
        return null
    }
}

/** What the phone sends to prove it scanned the QR: HMAC-SHA256 under the QR secret over its key and device id. */
function pairingProof(secret, phonePubB64, deviceId) {
    return b64(crypto.createHmac('sha256', fromB64(secret)).update(`pair|${phonePubB64}|${deviceId}`).digest())
}

function safeEqual(a, b) {
    const x = Buffer.from(String(a)); const y = Buffer.from(String(b))
    return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/**
 * The computer's side. `persist` keeps three values between runs: identity (the key pair, kept encrypted by the caller),
 * phones (the trusted phone keys) and pending (the current QR secret).
 */
function createE2e({ load, save, now = () => Date.now() }) {
    function identity() {
        let id = load('identity')
        if (!id || !id.pub || !id.priv) {
            const pair = generateKeyPair()
            id = { pub: b64(pair.pub), priv: b64(pair.priv) }
            save('identity', id)
        }
        return { pub: fromB64(id.pub), priv: fromB64(id.priv), pubB64: id.pub, keyId: keyIdOf(fromB64(id.pub)) }
    }

    function phones() {
        const list = load('phones')
        return Array.isArray(list) ? list : []
    }

    /** Starts pairing: returns the text to put into the QR code. The secret lives here for ten minutes. */
    function beginPairing({ userId }) {
        const me = identity()
        const secret = b64(crypto.randomBytes(32))
        const expiresAt = now() + PAIRING_TTL_MS
        save('pending', { secret, expiresAt })
        const payload = { v: 1, uid: userId, dpub: me.pubB64, did: me.keyId, sec: secret }
        return { qr: 'centrio-pair:' + b64url(Buffer.from(JSON.stringify(payload), 'utf8')), expiresAt, keyId: me.keyId }
    }

    /** A phone key from the server is trusted only with a valid proof for the secret of the current pairing. */
    function trustIfProven(phone) {
        const pending = load('pending')
        if (!pending || !pending.secret || pending.expiresAt < now()) return false
        const expected = pairingProof(pending.secret, phone.pub, phone.deviceId)
        if (!safeEqual(expected, phone.proof)) return false
        const list = phones().filter(p => p.deviceId !== phone.deviceId)
        list.push({ deviceId: phone.deviceId, name: phone.name || 'Телефон', pub: phone.pub })
        save('phones', list)
        return true
    }

    /** Keeps only the phones that still exist on the server (one removed on the phone disappears here too). */
    function keepOnly(deviceIds) {
        const keep = new Set(deviceIds)
        const list = phones()
        const next = list.filter(p => keep.has(p.deviceId))
        if (next.length !== list.length) save('phones', next)
        return next
    }

    function forgetPhone(deviceId) {
        save('phones', phones().filter(p => p.deviceId !== deviceId))
    }

    /** One sealed copy of `plain` for every trusted phone. */
    function sealForPhones(ref, plain) {
        const me = identity()
        return phones().map(p => ({
            phoneDeviceId: p.deviceId,
            enc: seal({ myPriv: me.priv, myPub: me.pub, theirPub: fromB64(p.pub), direction: D2P, ref, desktopKeyId: me.keyId, phoneDeviceId: p.deviceId, plain })
        }))
    }

    /** Opens a reply from one of the trusted phones. Returns the reply text, or null if it is not genuine. */
    function openReply({ phoneDeviceId, ref, desktopKeyId, enc }) {
        const me = identity()
        if (desktopKeyId !== me.keyId) return null
        const phone = phones().find(p => p.deviceId === phoneDeviceId)
        if (!phone) return null
        return open({ myPriv: me.priv, myPub: me.pub, theirPub: fromB64(phone.pub), direction: P2D, ref, desktopKeyId: me.keyId, phoneDeviceId, enc })
    }

    return { identity, phones, beginPairing, trustIfProven, keepOnly, forgetPhone, sealForPhones, openReply }
}

module.exports = { createE2e, generateKeyPair, seal, open, keyIdOf, pairingProof, D2P, P2D, PAIRING_TTL_MS }
