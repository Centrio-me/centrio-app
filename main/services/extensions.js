const { session, app } = require('electron')
const path = require('path')
const fs   = require('fs')
const http  = require('http')
const https = require('https')
const store = require('./store')

const EXTENSIONS_DIR = path.join(app.getPath('userData'), 'centrio-extensions')

// extension id → Set of partitions already loaded
const loadedMap = new Map()

// ── Download CRX from Chrome Web Store ───────────────────────────────────────
function downloadCrx(id) {
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0.0.0&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`
    return fetchFollow(url)
}

function fetchFollow(url, depth = 0) {
    if (depth > 5) return Promise.reject(new Error('Too many redirects'))
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http
        mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Electron/36' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchFollow(res.headers.location, depth + 1).then(resolve).catch(reject)
            }
            if (res.statusCode !== 200) {
                res.resume()
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            }
            const chunks = []
            res.on('data', c => chunks.push(c))
            res.on('end',  () => resolve(Buffer.concat(chunks)))
            res.on('error', reject)
        }).on('error', reject)
    })
}

// ── Unpack CRX3 = 12-byte header + protobuf(headerSize) + ZIP ────────────────
function unpackCrx3(buf, destDir) {
    if (buf.slice(0, 4).toString() !== 'Cr24') throw new Error('Not a CRX file (bad magic)')
    const version = buf.readUInt32LE(4)
    if (version !== 3) throw new Error(`CRX version ${version} unsupported`)
    const headerSize = buf.readUInt32LE(8)
    const zipBuf = buf.slice(12 + headerSize)
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(zipBuf)
    fs.mkdirSync(destDir, { recursive: true })
    zip.extractAllTo(destDir, true)
}

// ── Read manifest after unpack ────────────────────────────────────────────────
function readManifest(extDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'))
    } catch {
        return {}
    }
}

// ── Sessions helper ───────────────────────────────────────────────────────────
function getActiveSessions() {
    const sessions = [{ key: 'default', sess: session.defaultSession }]
    const messengers = store.get('messengers', [])
    for (const m of messengers) {
        try {
            sessions.push({ key: `persist:${m.id}`, sess: session.fromPartition(`persist:${m.id}`) })
        } catch {}
    }
    return sessions
}

async function loadExtIntoSession(id, extDir, sessEntry) {
    const { key, sess } = sessEntry
    const loaded = loadedMap.get(id) || new Set()
    if (loaded.has(key)) return
    try {
        await sess.loadExtension(extDir, { allowFileAccess: true })
        loaded.add(key)
        loadedMap.set(id, loaded)
    } catch (e) {
        if (!e.message.includes('already loaded')) {
            console.warn(`[ext] ${id} → ${key}:`, e.message)
        } else {
            loaded.add(key)
            loadedMap.set(id, loaded)
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function installExtension(id) {
    const extDir = path.join(EXTENSIONS_DIR, id)

    if (!fs.existsSync(path.join(extDir, 'manifest.json'))) {
        const crxBuf = await downloadCrx(id)
        unpackCrx3(crxBuf, extDir)
    }

    const installed = store.get('extensions.installed', [])
    if (!installed.includes(id)) {
        store.set('extensions.installed', [...installed, id])
    }

    for (const entry of getActiveSessions()) {
        await loadExtIntoSession(id, extDir, entry)
    }

    return readManifest(extDir)
}

async function loadIntoPartition(partition) {
    const enabled = getEnabled()
    const key = partition || 'default'
    const sess = partition ? session.fromPartition(partition) : session.defaultSession
    for (const id of enabled) {
        const extDir = path.join(EXTENSIONS_DIR, id)
        if (!fs.existsSync(path.join(extDir, 'manifest.json'))) continue
        await loadExtIntoSession(id, extDir, { key, sess })
    }
}

function uninstallExtension(id) {
    const extDir = path.join(EXTENSIONS_DIR, id)
    if (fs.existsSync(extDir)) {
        try { fs.rmSync(extDir, { recursive: true, force: true }) } catch {}
    }
    store.set('extensions.installed', store.get('extensions.installed', []).filter(x => x !== id))
    store.set('extensions.disabled', store.get('extensions.disabled', []).filter(x => x !== id))
    loadedMap.delete(id)
}

function toggleExtension(id, enabled) {
    const disabled = store.get('extensions.disabled', [])
    if (enabled) {
        store.set('extensions.disabled', disabled.filter(x => x !== id))
    } else {
        if (!disabled.includes(id)) store.set('extensions.disabled', [...disabled, id])
    }
}

function getEnabled() {
    const installed = store.get('extensions.installed', [])
    const disabled  = store.get('extensions.disabled',  [])
    return installed.filter(id => !disabled.includes(id))
}

function getInstalledList() {
    const installed = store.get('extensions.installed', [])
    const disabled  = store.get('extensions.disabled',  [])
    return installed.map(id => {
        const extDir = path.join(EXTENSIONS_DIR, id)
        const manifest = readManifest(extDir)
        const rawOptions = manifest.options_page || manifest.options_ui?.page || null
        const rawPopup   = manifest.action?.default_popup || manifest.browser_action?.default_popup || null
        const base = `chrome-extension://${id}/`
        return {
            id,
            name:        manifest.name    || id,
            version:     manifest.version || '?',
            enabled:     !disabled.includes(id),
            optionsPage: rawOptions ? base + rawOptions.replace(/^\//, '') : null,
            popupPage:   rawPopup   ? base + rawPopup.replace(/^\//, '')   : null,
        }
    })
}

async function loadSavedOnStart() {
    const enabled = getEnabled()
    const sessions = getActiveSessions()
    for (const id of enabled) {
        const extDir = path.join(EXTENSIONS_DIR, id)
        if (!fs.existsSync(path.join(extDir, 'manifest.json'))) continue
        for (const entry of sessions) {
            await loadExtIntoSession(id, extDir, entry)
        }
    }
}

module.exports = {
    installExtension,
    uninstallExtension,
    toggleExtension,
    loadIntoPartition,
    loadSavedOnStart,
    getInstalledList,
    EXTENSIONS_DIR
}
