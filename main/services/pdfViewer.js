// Centrio's own PDF reader: a PDF that a messenger downloads (or a link to one) opens in a window of its own, drawn by
// pdf.js inside our page (pdf-viewer/): pages, thumbnails, outline, zoom, search, print, "save as", signature.
// Turned on by settings.pdfViewer (default on). This file is the main-process side: windows, reading the file,
// the save and print dialogs. The page only gets the narrow API of pdf-viewer/preload.js.
'use strict'

const { BrowserWindow, app, ipcMain, dialog, net } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store')
const { isPdfDownload, isPdfUrl } = require('../../shared/pdf-detect')

const TEMP_DIR_NAME = 'centrio-pdf'
const MAX_WINDOWS = 8
const MAX_BYTES = 300 * 1024 * 1024
const PAGE = path.join(__dirname, '..', '..', 'pdf-viewer', 'viewer.html')
const PRELOAD = path.join(__dirname, '..', '..', 'pdf-viewer', 'preload.js')

// webContents.id → { win, source: { file } | { url }, title }
const viewers = new Map()
let ipcReady = false

function isEnabled() {
    return store.get('settings.pdfViewer', true) !== false
}

function tempRoot() {
    return path.join(app.getPath('temp'), TEMP_DIR_NAME)
}

// A fresh folder per download so two files with one name never collide; swept at start (see sweepTemp).
function tempPathFor(filename) {
    const safe = path.basename(String(filename || 'document.pdf')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'document.pdf'
    const dir = path.join(tempRoot(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, safe)
}

function sweepTemp() {
    try { fs.rmSync(tempRoot(), { recursive: true, force: true }) } catch {}
}

async function readSource(source) {
    if (source.bytes) return source.bytes
    if (source.file) {
        const stat = await fs.promises.stat(source.file)
        if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('too large')
        return new Uint8Array(await fs.promises.readFile(source.file))
    }
    const res = await net.fetch(source.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const length = Number(res.headers.get('content-length') || 0)
    if (length > MAX_BYTES) throw new Error('too large')
    return new Uint8Array(await res.arrayBuffer())
}

function titleOf(source) {
    if (source.file) return path.basename(source.file)
    try { return decodeURIComponent(path.basename(new URL(source.url).pathname)) || 'PDF' } catch { return 'PDF' }
}

function ownerWindow(event) {
    const entry = viewers.get(event.sender.id)
    return entry && !entry.win.isDestroyed() ? entry : null
}

function registerIpc() {
    if (ipcReady) return
    ipcReady = true

    ipcMain.handle('pdfv:init', async (event) => {
        const entry = ownerWindow(event)
        if (!entry) return { ok: false, error: 'no window' }
        try {
            const bytes = await readSource(entry.source)
            return { ok: true, title: entry.title, bytes, canSaveCopy: !!entry.source.file || !!entry.source.url }
        } catch (err) {
            return { ok: false, error: String((err && err.message) || err), title: entry.title }
        }
    })

    ipcMain.handle('pdfv:save-as', async (event, bytes, suggestedName) => {
        const entry = ownerWindow(event)
        if (!entry || !(bytes instanceof Uint8Array || Buffer.isBuffer(bytes))) return { ok: false }
        const base = path.basename(String(suggestedName || entry.title || 'document.pdf')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        const result = await dialog.showSaveDialog(entry.win, {
            defaultPath: path.join(app.getPath('downloads'), /\.pdf$/i.test(base) ? base : `${base}.pdf`),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return { ok: false, canceled: true }
        try {
            await fs.promises.writeFile(result.filePath, Buffer.from(bytes))
            return { ok: true, path: result.filePath }
        } catch (err) {
            return { ok: false, error: String((err && err.message) || err) }
        }
    })

    ipcMain.handle('pdfv:print', (event) => new Promise((resolve) => {
        const entry = ownerWindow(event)
        if (!entry) return resolve({ ok: false })
        entry.win.webContents.print({ printBackground: true }, (success, reason) => resolve({ ok: success, reason }))
    }))

    ipcMain.handle('pdfv:open-dialog', async (event) => {
        const entry = ownerWindow(event)
        if (!entry) return { ok: false }
        const result = await dialog.showOpenDialog(entry.win, { properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
        if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
        try {
            const source = { file: result.filePaths[0] }
            const bytes = await readSource(source)
            entry.source = source
            entry.title = titleOf(source)
            entry.win.setTitle(entry.title)
            return { ok: true, title: entry.title, bytes }
        } catch (err) {
            return { ok: false, error: String((err && err.message) || err) }
        }
    })

    ipcMain.on('pdfv:title', (event, title) => {
        const entry = ownerWindow(event)
        if (entry) entry.win.setTitle(String(title || entry.title).slice(0, 200))
    })
}

function openWindow(source) {
    registerIpc()
    if (viewers.size >= MAX_WINDOWS) {
        const oldest = viewers.values().next().value
        try { oldest.win.close() } catch {}
    }
    const title = titleOf(source)
    const win = new BrowserWindow({
        width: 1080,
        height: 860,
        minWidth: 560,
        minHeight: 420,
        show: false,
        title,
        icon: path.join(__dirname, '..', '..', 'assets', 'logo.ico'),
        backgroundColor: '#0b0a08',
        autoHideMenuBar: true,
        webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    })
    win.setMenuBarVisibility(false)
    const id = win.webContents.id
    viewers.set(id, { win, source, title })
    win.once('closed', () => viewers.delete(id))
    // Our own page only: it may not open other windows or leave itself.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show() })
    win.on('page-title-updated', (e) => e.preventDefault())
    win.loadFile(PAGE).catch(() => {})
    return win
}

// A downloaded file on disk (a path we wrote ourselves).
function openFile(filePath, title) {
    if (!filePath || !fs.existsSync(filePath)) return false
    openWindow({ file: filePath, name: title })
    return true
}

// A link to a PDF: fetched here; when it cannot be fetched (needs a sign-in, blocked...) the caller falls back to the browser.
async function openUrl(url) {
    if (!isPdfUrl(url)) return false
    try {
        const bytes = await readSource({ url })
        openWindow({ url, bytes })
        return true
    } catch {
        return false
    }
}

// Called from a session's will-download. Returns true when the reader takes the file over (the caller then skips the
// "where to save" dialog and the default save path); the reader opens as soon as the file is complete.
function takeDownload(item) {
    if (!isEnabled() || !isPdfDownload(item.getFilename(), item.getMimeType())) return false
    const savePath = tempPathFor(item.getFilename())
    try { item.setSavePath(savePath) } catch { return false }
    item.once('done', (_e, state) => { if (state === 'completed') openFile(savePath, item.getFilename()) })
    return true
}

module.exports = { isEnabled, takeDownload, openFile, openUrl, sweepTemp }
