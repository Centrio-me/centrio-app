// Password manager vault format and cryptography (2026-10-06). Pure Node, no Electron: unit-testable.
//
// Model: a random 256-bit data key (DEK) encrypts every entry (AES-256-GCM, AAD = vaultId|entryId). The DEK itself
// is stored wrapped by a key derived from the user's master password (scrypt). The master password and the DEK never
// leave the device unencrypted, so the whole blob — including titles, addresses and logins — is safe to keep on disk
// and to sync through the cloud: whoever holds only the blob cannot read anything without the master password.
const crypto = require('crypto')

const VERSION = 2
const KDF = { alg: 'scrypt', N: 1 << 15, r: 8, p: 1 }
const KDF_LIMITS = { maxN: 1 << 17, maxR: 16, maxP: 4 } // a blob from the cloud must not be able to exhaust memory
const SCRYPT_MAXMEM = 256 * 1024 * 1024
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const MAX_ENTRIES = 5000
const MAX_RECORD_BYTES = 16 * 1024
const MIN_MASTER_LENGTH = 8
const MAX_MASTER_LENGTH = 256
const LIMITS = { title: 120, url: 500, login: 200, password: 500 }

const b64 = (buffer) => Buffer.from(buffer).toString('base64')
const fromB64 = (text) => Buffer.from(String(text), 'base64')

function scrypt(master, salt, kdf) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(Buffer.from(String(master).normalize('NFKC'), 'utf8'), salt, KEY_BYTES, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: SCRYPT_MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)))
    })
}

function seal(key, plain, aad) {
    const iv = crypto.randomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(aad, 'utf8'))
    const body = Buffer.concat([cipher.update(plain), cipher.final()])
    return { iv: b64(iv), ct: b64(Buffer.concat([body, cipher.getAuthTag()])) }
}

function open(key, sealed, aad) {
    const iv = fromB64(sealed.iv)
    const data = fromB64(sealed.ct)
    if (iv.length !== IV_BYTES || data.length < TAG_BYTES) throw new Error('BAD_RECORD')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES))
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()])
}

function checkMaster(master) {
    const text = String(master == null ? '' : master)
    if (text.length < MIN_MASTER_LENGTH) return 'MASTER_TOO_SHORT'
    if (text.length > MAX_MASTER_LENGTH) return 'MASTER_TOO_LONG'
    return null
}

async function wrapNewKey(dek, master, vaultId) {
    const salt = crypto.randomBytes(16)
    const kek = await scrypt(master, salt, KDF)
    return { kdf: { ...KDF, salt: b64(salt) }, wrapped: seal(kek, dek, `${vaultId}|dek`) }
}

/** @returns {Promise<{ vault: object, dek: Buffer }>} */
async function createVault(master) {
    const vaultId = crypto.randomUUID()
    const dek = crypto.randomBytes(KEY_BYTES)
    const now = Date.now()
    const { kdf, wrapped } = await wrapNewKey(dek, master, vaultId)
    return { vault: { v: VERSION, vaultId, keyUpdatedAt: now, updatedAt: now, kdf, wrapped, entries: [] }, dek }
}

/** Returns the data key, or null when the master password is wrong. */
async function unlock(vault, master) {
    try {
        const kdf = vault.kdf
        const salt = fromB64(kdf.salt)
        const kek = await scrypt(master, salt, kdf)
        return open(kek, vault.wrapped, `${vault.vaultId}|dek`)
    } catch {
        return null
    }
}

/** Same data key, new master password (new salt). Entries stay untouched. */
async function rewrap(vault, dek, newMaster) {
    const { kdf, wrapped } = await wrapNewKey(dek, newMaster, vault.vaultId)
    const now = Date.now()
    return { ...vault, kdf, wrapped, keyUpdatedAt: now, updatedAt: now }
}

const clip = (value, max) => String(value == null ? '' : value).slice(0, max)

function encryptEntry(dek, vaultId, entry) {
    const payload = JSON.stringify({
        title: clip(entry.title, LIMITS.title), url: clip(entry.url, LIMITS.url),
        login: clip(entry.login, LIMITS.login), password: clip(entry.password, LIMITS.password)
    })
    const sealed = seal(dek, Buffer.from(payload, 'utf8'), `${vaultId}|${entry.id}`)
    return { id: entry.id, updatedAt: entry.updatedAt, iv: sealed.iv, ct: sealed.ct }
}

function decryptEntry(dek, vaultId, record) {
    const data = JSON.parse(open(dek, record, `${vaultId}|${record.id}`).toString('utf8'))
    return { id: record.id, updatedAt: record.updatedAt, title: data.title || '', url: data.url || '', login: data.login || '', password: data.password || '' }
}

function tombstone(id, updatedAt) {
    return { id, updatedAt, deleted: true }
}

/** Strict structural check of a vault blob that came from disk or from the cloud. */
function isValidVault(vault) {
    try {
        if (!vault || typeof vault !== 'object' || vault.v !== VERSION) return false
        if (typeof vault.vaultId !== 'string' || vault.vaultId.length > 64) return false
        const kdf = vault.kdf
        if (!kdf || kdf.alg !== 'scrypt' || !Number.isInteger(kdf.N) || !Number.isInteger(kdf.r) || !Number.isInteger(kdf.p)) return false
        if (kdf.N < 1 << 14 || kdf.N > KDF_LIMITS.maxN || (kdf.N & (kdf.N - 1)) !== 0 || kdf.r < 1 || kdf.r > KDF_LIMITS.maxR || kdf.p < 1 || kdf.p > KDF_LIMITS.maxP) return false
        if (typeof kdf.salt !== 'string' || fromB64(kdf.salt).length < 16) return false
        if (!vault.wrapped || typeof vault.wrapped.iv !== 'string' || typeof vault.wrapped.ct !== 'string') return false
        if (!Array.isArray(vault.entries) || vault.entries.length > MAX_ENTRIES) return false
        for (const record of vault.entries) {
            if (!record || typeof record.id !== 'string' || record.id.length > 64 || !Number.isFinite(record.updatedAt)) return false
            if (record.deleted === true) continue
            if (typeof record.iv !== 'string' || typeof record.ct !== 'string' || record.ct.length > MAX_RECORD_BYTES) return false
        }
        return true
    } catch {
        return false
    }
}

const newer = (a, b) => (!a ? b : !b ? a : (b.updatedAt > a.updatedAt ? b : a))

/** Two copies of the SAME vault (same vaultId): newest record per entry wins, newest key wrap wins. */
function mergeSameVault(local, remote) {
    const byId = new Map()
    for (const record of [...local.entries, ...remote.entries]) byId.set(record.id, newer(byId.get(record.id), record))
    const keySource = remote.keyUpdatedAt > local.keyUpdatedAt ? remote : local
    return {
        ...local,
        kdf: keySource.kdf, wrapped: keySource.wrapped, keyUpdatedAt: keySource.keyUpdatedAt,
        entries: [...byId.values()].slice(0, MAX_ENTRIES),
        updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0)
    }
}

/**
 * Brings the live entries of a FOREIGN vault (another data key, opened with `remoteDek`) into the local one.
 * Same address+login on both sides: the more recent one wins.
 */
function importForeign(local, localDek, remote, remoteDek, normalize) {
    const live = new Map()
    for (const record of local.entries) {
        if (record.deleted) continue
        try { const e = decryptEntry(localDek, local.vaultId, record); live.set(`${normalize(e.url)}|${e.login}`, e) } catch { /* unreadable: kept as is below */ }
    }
    const added = []
    for (const record of remote.entries) {
        if (record.deleted) continue
        let e
        try { e = decryptEntry(remoteDek, remote.vaultId, record) } catch { continue }
        const key = `${normalize(e.url)}|${e.login}`
        const mine = live.get(key)
        if (mine && mine.updatedAt >= e.updatedAt) continue
        const id = mine ? mine.id : crypto.randomUUID()
        added.push(encryptEntry(localDek, local.vaultId, { ...e, id, updatedAt: Math.max(e.updatedAt, Date.now()) }))
    }
    const replaced = new Set(added.map((r) => r.id))
    return { ...local, entries: [...local.entries.filter((r) => !replaced.has(r.id)), ...added], updatedAt: Date.now() }
}

module.exports = {
    VERSION, LIMITS, MAX_ENTRIES, MIN_MASTER_LENGTH,
    checkMaster, createVault, unlock, rewrap, encryptEntry, decryptEntry, tombstone, isValidVault, mergeSameVault, importForeign
}
