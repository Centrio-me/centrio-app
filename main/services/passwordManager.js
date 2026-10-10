// Personal password manager — the main-process side (2026-10-05, reworked 2026-10-06 around a master password).
//
// Everything is stored as ONE encrypted vault (see pmVault.js) under the store key 'pmVault'. Without the master
// password the vault is unreadable, which is also what makes it safe to sync through the cloud for PRO accounts.
// While unlocked the data key lives only in this process' memory and is dropped after the idle timeout.
//
// The renderer never receives a password except through `reveal` (the "show" button). Copying and typing into a page
// happen here; the clipboard is wiped after 30 seconds.
const crypto = require('crypto')
const fs = require('fs')
const { clipboard } = require('electron')
const store = require('./store')
const vault = require('./vault')
const pmVault = require('./pmVault')
const pmImport = require('./pmImport')

const VAULT_KEY = 'pmVault'
const BACKUP_KEY = 'pmVaultBackup' // the vault as it was before the last cloud merge, so a bad merge can be undone by hand
const SETTINGS_KEY = 'pmSettings'
const LEGACY_KEY = 'passwordManager' // pre-master-password builds: entries encrypted with the OS storage only
const CLIPBOARD_CLEAR_MS = 30 * 1000
const CAPTURE_TTL_MS = 5 * 60 * 1000
const AUTO_LOCK_CHOICES = [5, 15, 30, 60, 0] // minutes, 0 = only when the app closes
const DEFAULT_AUTO_LOCK_MIN = 15
const MAX_FAILED_BEFORE_DELAY = 3
const MAX_CAPTURES = 5
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

let current = null // { vault, dek } — dek is null while locked
let clipboardTimer = null
let lastCopied = null
let gate = Promise.resolve() // every master-password check runs one after another and shares one failure counter
let powerWatched = false
let setupBusy = false
let lockTimer = null
let failedAttempts = 0
let pendingRemote = null // a cloud vault with another key, waiting for the user's decision
let emit = () => {}
const captures = new Map() // id -> { messengerId, url, title, login, password, at }

const hostOfUrl = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function setEmitter(fn) { emit = typeof fn === 'function' ? fn : () => {} }

function settings() {
    const raw = store.get(SETTINGS_KEY, {}) || {}
    const autoLockMin = AUTO_LOCK_CHOICES.includes(raw.autoLockMin) ? raw.autoLockMin : DEFAULT_AUTO_LOCK_MIN
    return { autoLockMin, never: Array.isArray(raw.never) ? raw.never.filter((h) => typeof h === 'string').slice(0, 500) : [] }
}

function loadVault() {
    if (current) return current
    const stored = store.get(VAULT_KEY, null)
    if (stored && pmVault.isValidVault(stored)) current = { vault: stored, dek: null }
    return current
}

function persist() {
    store.set(VAULT_KEY, current.vault)
}

// ── lock / unlock ────────────────────────────────────────────────────────────────────────────────────────
function wipeClipboardIfOurs() {
    clearTimeout(clipboardTimer)
    try { if (lastCopied && clipboard.readText() === lastCopied) clipboard.clear() } catch { /* clipboard busy */ }
    lastCopied = null
}

function watchPower() {
    if (powerWatched) return
    powerWatched = true
    try {
        const { powerMonitor } = require('electron')
        powerMonitor.on('lock-screen', () => lock('power'))
        powerMonitor.on('suspend', () => lock('power'))
    } catch { /* not available before the app is ready */ }
}

function lock(reason) {
    clearTimeout(lockTimer)
    lockTimer = null
    wipeClipboardIfOurs()
    if (current && current.dek) current.dek.fill(0)
    if (current) current.dek = null
    captures.forEach((c) => { c.password = '' })
    captures.clear()
    if (reason) emit({ type: 'locked' })
}

function touch() {
    watchPower()
    clearTimeout(lockTimer)
    const minutes = settings().autoLockMin
    if (!current || !current.dek || minutes === 0) return
    lockTimer = setTimeout(() => lock('idle'), minutes * 60 * 1000)
    if (lockTimer.unref) lockTimer.unref()
}

const isUnlocked = () => !!(current && current.dek)

function liveRecords() {
    return current ? current.vault.entries.filter((r) => !r.deleted) : []
}

function status() {
    const loaded = loadVault()
    const legacy = store.get(LEGACY_KEY, [])
    return {
        success: true,
        state: !loaded ? 'none' : (loaded.dek ? 'unlocked' : 'locked'),
        count: liveRecords().length,
        autoLockMin: settings().autoLockMin,
        autoLockChoices: AUTO_LOCK_CHOICES,
        hasLegacy: Array.isArray(legacy) && legacy.length > 0,
        mismatch: !!pendingRemote,
        hasRecovery: !!(loaded && loaded.vault.recovery)
    }
}

async function migrateLegacy() {
    const legacy = store.get(LEGACY_KEY, [])
    if (!Array.isArray(legacy) || !legacy.length) return
    let safeStorage = null
    try { safeStorage = require('electron').safeStorage } catch { return }
    for (const item of legacy) {
        try {
            const dec = (b64) => safeStorage.decryptString(Buffer.from(String(b64), 'base64'))
            addEntry({ title: item.title, url: item.url, login: item.loginEnc ? dec(item.loginEnc) : '', password: dec(item.passEnc) })
        } catch { /* an entry of another machine/user: cannot be read here */ }
    }
    store.set(LEGACY_KEY, [])
}

async function setup(master) {
    if (loadVault() || setupBusy) return { success: false, error: 'EXISTS' }
    const bad = pmVault.checkMaster(master)
    if (bad) return { success: false, error: bad }
    setupBusy = true
    try {
        const created = await pmVault.createVault(master)
        const withCode = pmVault.withRecovery(created.vault, created.dek)
        current = { vault: withCode.vault, dek: created.dek }
        await migrateLegacy()
        persist()
        touch()
        // The recovery code is returned this once; it is not stored anywhere.
        return { success: true, recoveryCode: withCode.code }
    } finally {
        setupBusy = false
    }
}

// One queue for every master-password check (unlock, change, join the cloud vault): parallel calls cannot skip the
// delay, and a wrong master counts the same wherever it was typed.
function serial(fn) {
    const run = gate.then(fn, fn)
    gate = run.then(() => undefined, () => undefined)
    return run
}

async function throttleWrongMaster() {
    if (failedAttempts >= MAX_FAILED_BEFORE_DELAY) await sleep(Math.min(5000, 500 * 2 ** (failedAttempts - MAX_FAILED_BEFORE_DELAY)))
}

function unlock(master) {
    return serial(async () => {
        const loaded = loadVault()
        if (!loaded) return { success: false, error: 'NO_VAULT' }
        await throttleWrongMaster()
        const dek = await pmVault.unlock(loaded.vault, master)
        if (!dek) { failedAttempts += 1; return { success: false, error: 'WRONG_MASTER' } }
        failedAttempts = 0
        loaded.dek = dek
        touch()
        return { success: true }
    })
}

function changeMaster(oldMaster, newMaster) {
    return serial(async () => {
        const loaded = loadVault()
        if (!loaded) return { success: false, error: 'NO_VAULT' }
        const bad = pmVault.checkMaster(newMaster)
        if (bad) return { success: false, error: bad }
        await throttleWrongMaster()
        const dek = await pmVault.unlock(loaded.vault, oldMaster)
        if (!dek) { failedAttempts += 1; return { success: false, error: 'WRONG_MASTER' } }
        failedAttempts = 0
        loaded.vault = await pmVault.rewrap(loaded.vault, dek, newMaster)
        loaded.dek = dek
        persist()
        touch()
        return { success: true }
    })
}

// A new recovery code for an unlocked vault (vaults made before the recovery code existed, or a lost code).
function createRecoveryCode() {
    const loaded = loadVault()
    if (!loaded || !loaded.dek) return { success: false, error: 'LOCKED' }
    const withCode = pmVault.withRecovery(loaded.vault, loaded.dek)
    loaded.vault = withCode.vault
    persist()
    touch()
    return { success: true, recoveryCode: withCode.code }
}

// Forgotten master password: the recovery code opens the vault, the user sets a new master password, and the
// used code is replaced by a new one (shown once, like at creation).
function recover(code, newMaster) {
    return serial(async () => {
        const loaded = loadVault()
        if (!loaded) return { success: false, error: 'NO_VAULT' }
        const bad = pmVault.checkMaster(newMaster)
        if (bad) return { success: false, error: bad }
        await throttleWrongMaster()
        const dek = pmVault.unlockWithRecovery(loaded.vault, code)
        if (!dek) { failedAttempts += 1; return { success: false, error: loaded.vault.recovery ? 'WRONG_CODE' : 'NO_RECOVERY' } }
        failedAttempts = 0
        const rewrapped = await pmVault.rewrap(loaded.vault, dek, newMaster)
        const withCode = pmVault.withRecovery(rewrapped, dek)
        loaded.vault = withCode.vault
        loaded.dek = dek
        persist()
        touch()
        return { success: true, recoveryCode: withCode.code }
    })
}

function reset() {
    lock()
    current = null
    pendingRemote = null
    store.set(VAULT_KEY, null)
    store.set(LEGACY_KEY, [])
    return { success: true }
}

function setAutoLock(minutes) {
    const value = AUTO_LOCK_CHOICES.includes(Number(minutes)) ? Number(minutes) : DEFAULT_AUTO_LOCK_MIN
    store.set(SETTINGS_KEY, { ...settings(), autoLockMin: value })
    touch()
    return { success: true, autoLockMin: value }
}

// ── entries ──────────────────────────────────────────────────────────────────────────────────────────────
// A site address typed without a scheme ("avito.ru") still has to work for matching and autofill.
function normalizeUrl(input) {
    const text = String(input || '').trim().slice(0, pmVault.LIMITS.url)
    if (!text) return ''
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
    try {
        const url = new URL(withScheme)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
        return url.toString()
    } catch {
        return ''
    }
}

function readEntries() {
    const out = []
    for (const record of liveRecords()) {
        try { out.push(pmVault.decryptEntry(current.dek, current.vault.vaultId, record)) } catch { /* corrupt record: skipped */ }
    }
    return out
}

const publicView = (e) => ({ id: e.id, title: e.title, url: e.url, host: hostOfUrl(e.url), login: e.login, updatedAt: e.updatedAt })

function requireUnlocked() {
    if (!current) return { success: false, error: 'NO_VAULT' }
    if (!current.dek) return { success: false, error: 'LOCKED' }
    touch()
    return null
}

function list() {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    return { success: true, entries: readEntries().map(publicView) }
}

// One entry per site + login: "letyshops.com/us" and "letyshops.com" are the same site, so saving the same login
// again updates the existing entry instead of adding a duplicate.
function addEntry(input) {
    const title = String(input.title || '').trim().slice(0, pmVault.LIMITS.title)
    const url = normalizeUrl(input.url)
    const login = String(input.login || '').slice(0, pmVault.LIMITS.login)
    const password = typeof input.password === 'string' ? input.password.slice(0, pmVault.LIMITS.password) : ''
    if (!title) return { success: false, error: 'TITLE_REQUIRED' }
    if (!url) return { success: false, error: 'URL_INVALID' }

    const entries = readEntries()
    const existing = (input.id && entries.find((e) => e.id === input.id))
        || entries.find((e) => hostOfUrl(e.url) === hostOfUrl(url) && e.login.toLowerCase() === login.toLowerCase())
    if (!existing && !password) return { success: false, error: 'PASSWORD_REQUIRED' }
    if (!existing && entries.length >= pmVault.MAX_ENTRIES) return { success: false, error: 'LIMIT' }

    const id = existing ? existing.id : crypto.randomUUID()
    const record = pmVault.encryptEntry(current.dek, current.vault.vaultId, {
        id, title, url, login, password: password || (existing ? existing.password : ''), updatedAt: Date.now()
    })
    const rest = current.vault.entries.filter((r) => r.id !== id)
    current.vault = { ...current.vault, entries: [...rest, record], updatedAt: record.updatedAt }
    return { success: true, id }
}

function save(input) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const result = addEntry(input || {})
    if (result.success) persist()
    return result
}

function remove(id) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    if (!current.vault.entries.some((r) => r.id === id && !r.deleted)) return { success: false, error: 'NOT_FOUND' }
    const rest = current.vault.entries.filter((r) => r.id !== id)
    const now = Date.now()
    current.vault = { ...current.vault, entries: [...rest, pmVault.tombstone(id, now)], updatedAt: now }
    persist()
    return { success: true }
}

function findEntry(id) {
    return readEntries().find((e) => e.id === id) || null
}

// The only call that hands a password to the renderer: the "show" button.
function reveal(id) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const entry = findEntry(id)
    return entry ? { success: true, password: entry.password } : { success: false, error: 'NOT_FOUND' }
}

function copy(id, what) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const entry = findEntry(id)
    if (!entry) return { success: false, error: 'NOT_FOUND' }
    let value = what === 'login' ? entry.login : entry.password
    clipboard.writeText(value)
    if (what !== 'login') {
        lastCopied = value
        clearTimeout(clipboardTimer)
        clipboardTimer = setTimeout(wipeClipboardIfOurs, CLIPBOARD_CLEAR_MS)
    }
    value = null
    return { success: true, clearsInSeconds: what === 'login' ? 0 : CLIPBOARD_CLEAR_MS / 1000 }
}

/** Saved entries that belong to the site of `pageUrl` (same site, sign-in provider included). */
function matches(pageUrl) {
    const loaded = loadVault()
    if (!loaded) return { success: true, state: 'none', entries: [] }
    if (!loaded.dek) return { success: true, state: 'locked', entries: [] }
    // no touch(): the app polls this, and polling must not keep the vault unlocked
    const found = readEntries().filter((e) => vault.hostIsAllowed(pageUrl, e.url)).map(publicView)
    return { success: true, state: 'unlocked', entries: found }
}

// Types the saved login into the open messenger tab. Only while the page belongs to the entry's own site.
async function autofill(id, messengerId) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const entry = findEntry(id)
    if (!entry || !messengerId) return { success: false, error: 'NOT_FOUND' }
    let secret = { u: entry.login, p: entry.password }
    const result = await vault.fillSecretIntoMessenger({ messengerId: String(messengerId), assignedUrl: entry.url, secret })
    secret = null
    return result
}

// ── "save this password?" ────────────────────────────────────────────────────────────────────────────────
/**
 * A sign-in the user just submitted on a page. Returns what to offer, or null when there is nothing to offer
 * (already saved with this very password, or the user said "never for this site").
 */
function registerCapture({ messengerId, url, title, login, password }) {
    const host = hostOfUrl(url)
    if (!host || !password || settings().never.includes(host)) return null
    if (password.length > pmVault.LIMITS.password) return null
    let pageUrl = url
    try { const u = new URL(url); pageUrl = u.origin + u.pathname } catch { /* keep as is */ } // no query/fragment: OAuth codes do not belong in a vault
    let kind = 'new'
    if (!current) kind = 'no-vault'
    else if (!current.dek) kind = 'locked'
    else {
        const known = readEntries().find((e) => hostOfUrl(e.url) === host && e.login.toLowerCase() === String(login || '').toLowerCase())
        if (known && known.password === password) return null
        if (known) kind = 'update'
    }
    const now = Date.now()
    captures.forEach((c, key) => { if (now - c.at > CAPTURE_TTL_MS) captures.delete(key) })
    while (captures.size >= MAX_CAPTURES) captures.delete(captures.keys().next().value) // a page cannot flood memory with offers
    const captureId = crypto.randomUUID()
    captures.set(captureId, { messengerId, url: pageUrl, title: String(title || host).slice(0, pmVault.LIMITS.title), login: String(login || ''), password, at: now })
    return { captureId, kind, host, login: String(login || '') }
}

async function saveCapture(captureId, master) {
    const pending = captures.get(captureId)
    if (!pending) return { success: false, error: 'EXPIRED' }
    if (!current) return { success: false, error: 'NO_VAULT' }
    if (!current.dek) {
        const unlocked = await unlock(master)
        if (!unlocked.success) return unlocked
    }
    const result = save({ title: pending.title, url: pending.url, login: pending.login, password: pending.password })
    if (result.success) captures.delete(captureId)
    return result
}

function dismissCapture(captureId, never) {
    const pending = captures.get(captureId)
    captures.delete(captureId)
    if (pending && never) {
        const host = hostOfUrl(pending.url)
        const current_ = settings()
        if (host && !current_.never.includes(host)) store.set(SETTINGS_KEY, { ...current_, never: [...current_.never, host] })
    }
    return { success: true }
}

// ── cloud sync (PRO): only the encrypted vault ever leaves the device ───────────────────────────────────────
function exportBlob() {
    const loaded = loadVault()
    return loaded ? loaded.vault : null
}

/** Merges the cloud copy into the local one. Resolves { success, changed } or { success:false, error:'VAULT_MISMATCH' }. */
function mergeRemote(remoteBlob) {
    if (!pmVault.isValidVault(remoteBlob)) return { success: false, error: 'INVALID' }
    // timestamps from the cloud are plain data: a far-future value must not win every merge forever
    const limit = Date.now() + MAX_CLOCK_SKEW_MS
    const remote = {
        ...remoteBlob,
        keyUpdatedAt: Math.min(Number(remoteBlob.keyUpdatedAt) || 0, limit),
        updatedAt: Math.min(Number(remoteBlob.updatedAt) || 0, limit),
        entries: remoteBlob.entries.map((r) => ({ ...r, updatedAt: Math.min(Number(r.updatedAt) || 0, limit) }))
    }
    const loaded = loadVault()
    if (!loaded) {
        current = { vault: remote, dek: null }
        persist()
        return { success: true, changed: true }
    }
    if (loaded.vault.vaultId === remote.vaultId) {
        const merged = pmVault.mergeSameVault(loaded.vault, remote)
        const changed = JSON.stringify(merged) !== JSON.stringify(loaded.vault)
        if (changed) { store.set(BACKUP_KEY, loaded.vault); loaded.vault = merged; persist() }
        pendingRemote = null
        return { success: true, changed }
    }
    if (!liveRecords().length) { // nothing to lose locally: the cloud vault replaces the empty one
        lock()
        current = { vault: remote, dek: null }
        persist()
        pendingRemote = null
        return { success: true, changed: true, replaced: true }
    }
    pendingRemote = remote
    return { success: false, error: 'VAULT_MISMATCH' }
}

/** The user chose the cloud vault: opens it with ITS master password and carries the local entries over. */
function adoptRemote(remoteMaster) {
    return serial(async () => {
        if (!pendingRemote) return { success: false, error: 'NOTHING_PENDING' }
        await throttleWrongMaster()
        const remoteDek = await pmVault.unlock(pendingRemote, remoteMaster)
        if (!remoteDek) { failedAttempts += 1; return { success: false, error: 'WRONG_MASTER' } }
        failedAttempts = 0
        if (current) store.set(BACKUP_KEY, current.vault) // keep the local copy until the user is sure about the merge
        let merged = pendingRemote
        if (isUnlocked()) merged = pmVault.importForeign(pendingRemote, remoteDek, current.vault, current.dek, hostOfUrl)
        current = { vault: merged, dek: remoteDek }
        pendingRemote = null
        persist()
        touch()
        return { success: true }
    })
}

function discardRemote() {
    pendingRemote = null
    return { success: true }
}

// ── import from a browser / another password manager ─────────────────────────────────────────────────────
const IMPORT_TTL_MS = 10 * 60 * 1000
const imports = new Map() // token -> { rows, filePath, at }

const entryKey = (url, login) => hostOfUrl(url) + '|' + String(login || '').toLowerCase()

/** Reads the exported text (already read by the IPC layer) and says what an import would do. No passwords leave. */
function importPrepare(text, filePath) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const parsed = pmImport.parseImport(text, normalizeUrl)
    if (parsed.error) return { success: false, error: parsed.error }
    const existing = new Map(readEntries().map((e) => [entryKey(e.url, e.login), e]))
    let add = 0
    let update = 0
    let same = 0
    const rows = []
    const seen = new Set()
    for (const row of parsed.entries) {
        const key = entryKey(row.url, row.login)
        if (seen.has(key)) { same += 1; continue } // the file lists the same site+login twice
        seen.add(key)
        const known = existing.get(key)
        if (!known) { add += 1; rows.push({ ...row, kind: 'add' }) } else if (known.password !== row.password) { update += 1; rows.push({ ...row, kind: 'update', id: known.id }) } else same += 1
    }
    const now = Date.now()
    imports.forEach((v, k) => { if (now - v.at > IMPORT_TTL_MS) imports.delete(k) })
    const token = crypto.randomUUID()
    imports.set(token, { rows, filePath, at: now })
    const sample = rows.slice(0, 5).map((r) => ({ title: r.title, host: hostOfUrl(r.url), login: r.login }))
    return { success: true, token, found: parsed.entries.length, add, update, same, skipped: parsed.skipped, sample }
}

/** Overwrites the file with zeros, then deletes it: the export holds every password in plain text. */
function eraseFile(filePath) {
    try {
        const size = fs.statSync(filePath).size
        fs.writeFileSync(filePath, Buffer.alloc(size))
        fs.unlinkSync(filePath)
        return true
    } catch {
        return false
    }
}

function importCommit(token, deleteFile) {
    const blocked = requireUnlocked()
    if (blocked) return blocked
    const job = imports.get(token)
    if (!job) return { success: false, error: 'EXPIRED' }
    imports.delete(token)
    const records = new Map(current.vault.entries.map((r) => [r.id, r]))
    const now = Date.now()
    let added = 0
    let updated = 0
    const room = pmVault.MAX_ENTRIES - liveRecords().length
    for (const row of job.rows) {
        if (row.kind === 'add' && added >= room) continue
        const id = row.kind === 'update' ? row.id : crypto.randomUUID()
        records.set(id, pmVault.encryptEntry(current.dek, current.vault.vaultId, { id, title: row.title, url: row.url, login: row.login, password: row.password, updatedAt: now }))
        if (row.kind === 'update') updated += 1; else added += 1
    }
    job.rows.length = 0
    current.vault = { ...current.vault, entries: [...records.values()], updatedAt: now }
    persist()
    const erased = deleteFile ? eraseFile(job.filePath) : null
    return { success: true, added, updated, erased }
}

function importCancel(token) {
    const job = imports.get(token)
    if (job) job.rows.length = 0
    imports.delete(token)
    return { success: true }
}

module.exports = {
    importPrepare, importCommit, importCancel,
    setEmitter, status, setup, unlock, lock, changeMaster, createRecoveryCode, recover, reset, setAutoLock,
    list, save, remove, reveal, copy, matches, autofill,
    registerCapture, saveCapture, dismissCapture,
    exportBlob, mergeRemote, adoptRemote, discardRemote, normalizeUrl, hostOfUrl
}
