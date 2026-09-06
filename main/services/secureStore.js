/**
 * secureStore.js
 *
 * Wraps Electron's safeStorage API to encrypt sensitive values
 * (auth tokens, passwords) before writing to electron-store.
 *
 * Falls back to plain storage if safeStorage is unavailable
 * (e.g. on headless CI runners), preserving functionality.
 *
 * Format on disk:  "__enc__<base64(encrypted)>"
 * Plain values that don't start with __enc__ are treated as
 * unencrypted (migration compatibility).
 */
'use strict'

const { safeStorage } = require('electron')

const ENC_PREFIX = '__enc__'

function isAvailable() {
    try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

function encryptValue(plaintext) {
    if (!isAvailable()) return String(plaintext)
    try {
        const buf = safeStorage.encryptString(String(plaintext))
        return ENC_PREFIX + buf.toString('base64')
    } catch (e) {
        console.error('[secureStore] encrypt error:', e.message)
        return String(plaintext)
    }
}

function decryptValue(stored) {
    if (typeof stored !== 'string') return stored
    // Plain value (migration compat or safeStorage unavailable)
    if (!stored.startsWith(ENC_PREFIX)) return stored
    if (!isAvailable()) return stored
    try {
        const b64 = stored.slice(ENC_PREFIX.length)
        const buf = Buffer.from(b64, 'base64')
        return safeStorage.decryptString(buf)
    } catch (e) {
        console.error('[secureStore] decrypt error:', e.message)
        return null
    }
}

module.exports = { encryptValue, decryptValue, isAvailable }
