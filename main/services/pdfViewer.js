// Centrio's own PDF reader: a PDF that a messenger downloads (or a link to one) opens in a window of its own, drawn by
// pdf.js inside our page (pdf-viewer/): pages, thumbnails, outline, zoom, search, print, "save as", signature.
// Turned on by settings.pdfViewer (default on). This file is the main-process side: windows, reading the file,
// the save and print dialogs. The page only gets the narrow API of pdf-viewer/preload.js.
'use strict'

const { BrowserWindow, app, ipcMain, dialog, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store')
const { isPdfDownload, isPdfUrl } = require('../../shared/pdf-detect')
const { isWordDownload } = require('../../shared/doc-detect')
const { printOptions, isDuplexOn } = require('../../shared/pdf-print')

// a top-level key: the renderer saves the whole 'settings' object from its own copy and would wipe a key kept inside it
const DUPLEX_KEY = 'pdfDuplex'

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
            return { ok: true, title: entry.title, bytes, canSaveCopy: !!entry.source.file || !!entry.source.url, canOpenOriginal: !!entry.source.original }
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
        entry.win.webContents.print(printOptions(isDuplexOn(store.get(DUPLEX_KEY, false))), (success, reason) => resolve({ ok: success, reason }))
    }))

    // «Печать на обеих сторонах»: remembered between prints and between documents
    ipcMain.handle('pdfv:get-duplex', () => isDuplexOn(store.get(DUPLEX_KEY, false)))
    ipcMain.handle('pdfv:set-duplex', (_event, on) => { store.set(DUPLEX_KEY, isDuplexOn(on)); return isDuplexOn(on) })

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

    // A Word file shown here as a PDF: hand the original to the program that edits it (Word, LibreOffice…)
    ipcMain.handle('pdfv:open-original', async (event) => {
        const entry = ownerWindow(event)
        const original = entry && entry.source.original
        if (!original || !/\.docx$/i.test(original) || !fs.existsSync(original)) return { ok: false }
        const error = await shell.openPath(original)
        return { ok: !error, error }
    })

    ipcMain.on('pdfv:close', (event) => {
        const entry = ownerWindow(event)
        if (entry) entry.win.close()
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
// Returns 'pdf' | 'word' | 'image' when the reader takes the file, false when it does not.
// A picture goes to the reader only when it was opened from a VK document (see vkDocs.js), never every image a messenger saves.
function isVkReaderImage(item) {
    const { takesImage } = require('./vkDocs')
    const chain = typeof item.getURLChain === 'function' ? item.getURLChain() : [item.getURL()]
    return chain.some((url) => takesImage(url))
}

function takeDownload(item) {
    if (!isEnabled()) return false
    const filename = item.getFilename()
    const mime = item.getMimeType()
    const kind = isPdfDownload(filename, mime) ? 'pdf' : (isWordDownload(filename) ? 'word' : (isVkReaderImage(item) ? 'image' : null))
    if (!kind) return false
    const savePath = tempPathFor(filename)
    try { item.setSavePath(savePath) } catch { return false }
    item.once('done', (_e, state) => {
        if (state !== 'completed') return
        if (kind === 'pdf') openFile(savePath, filename)
        else if (kind === 'image') openImage(savePath, filename)
        else openWord(savePath, filename)
    })
    return kind
}

// A Word file that has come down: made into a PDF and opened in the reader (the original is kept beside it for «Открыть в Word»).
// When it cannot be drawn (damaged, protected, too big) it opens in whatever program the system has for it, so nothing is lost.
// One conversion at a time: each runs a hidden window, and a person who clicks the file again must not start a pile of them.
let conversionQueue = Promise.resolve()
function openWord(docxPath, name) {
    if (!/\.docx$/i.test(String(docxPath || ''))) return Promise.resolve()
    conversionQueue = conversionQueue.then(() => convertAndOpen(docxPath, name), () => convertAndOpen(docxPath, name))
    return conversionQueue
}

async function convertAndOpen(docxPath, name) {
    try {
        const { convertDocxToPdf } = require('./docxToPdf')
        const pdf = await convertDocxToPdf(docxPath)
        // the PDF goes to our own temp folder, never next to the person's file
        const pdfPath = tempPathFor(String(name || path.basename(docxPath)).replace(/\.docx$/i, '') + '.pdf')
        await fs.promises.writeFile(pdfPath, pdf)
        openWindow({ file: pdfPath, name, original: docxPath })
    } catch (err) {
        try { console.warn('[reader] Word file not shown, opening it outside:', err && err.message) } catch {}
        shell.openPath(docxPath).catch(() => {})
    }
}

// A picture that has come down (a VK document that is an image): made into a PDF page and opened in the reader; when it cannot be
// drawn it opens in the system's picture program, so nothing is lost.
async function openImage(imagePath, name) {
    try {
        const { convertImageToPdf } = require('./imageToPdf')
        const pdf = await convertImageToPdf(imagePath)
        const base = String(name || path.basename(imagePath)).replace(/.[a-z0-9]{1,5}$/i, '')
        const pdfPath = tempPathFor(base + '.pdf')
        await fs.promises.writeFile(pdfPath, pdf)
        openWindow({ file: pdfPath, name: base + '.pdf' })
    } catch (err) {
        try { console.warn('[reader] picture not shown, opening it outside:', err && err.message) } catch {}
        shell.openPath(imagePath).catch(() => {})
    }
}

module.exports = { isEnabled, takeDownload, openFile, openWord, openImage, openUrl, sweepTemp }
