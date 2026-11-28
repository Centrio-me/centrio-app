// Centrio's own PDF reader: a PDF that a messenger downloads (or a link to one) opens in a window of its own, drawn by
// pdf.js inside our page (pdf-viewer/): pages, thumbnails, outline, zoom, search, print, "save as", signature.
// All documents share ONE window: the first one opens it, every next one becomes a tab (a strip with a plus on top, see
// pdf-viewer/tabs.*). Each tab is its own view with its own reader page.
// Turned on by settings.pdfViewer (default on). This file is the main-process side: windows, reading the file,
// the save and print dialogs. The page only gets the narrow API of pdf-viewer/preload.js.
'use strict'

const { BrowserWindow, WebContentsView, app, ipcMain, dialog, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store')
const { isPdfDownload, isPdfUrl } = require('../../shared/pdf-detect')
const { isWordDownload } = require('../../shared/doc-detect')
const { saveChoices, saveKind } = require('../../shared/reader-save')
const { printOptions, isDuplexOn } = require('../../shared/pdf-print')

// a top-level key: the renderer saves the whole 'settings' object from its own copy and would wipe a key kept inside it
const DUPLEX_KEY = 'pdfDuplex'

const TEMP_DIR_NAME = 'centrio-pdf'
const MAX_TABS = 12
const TAB_BAR_H = 40
const MAX_BYTES = 300 * 1024 * 1024
const PAGE = path.join(__dirname, '..', '..', 'pdf-viewer', 'viewer.html')
const PRELOAD = path.join(__dirname, '..', '..', 'pdf-viewer', 'preload.js')
const TABS_PAGE = path.join(__dirname, '..', '..', 'pdf-viewer', 'tabs.html')
const TABS_PRELOAD = path.join(__dirname, '..', '..', 'pdf-viewer', 'tabs-preload.js')
const VIEW_PREFERENCES = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }

// webContents.id of a tab's view → { win, view, source: { file } | { url }, title }
const viewers = new Map()
// the one reader window: { win, bar: WebContentsView (the tab strip), tabs: entry[], active: entry }
let reader = null
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
    return entry && !entry.win.isDestroyed() && !entry.view.webContents.isDestroyed() ? entry : null
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
        const original = entry.source.original && fs.existsSync(entry.source.original) ? entry.source.original : ''
        const choices = saveChoices(base, !!original)
        const result = await dialog.showSaveDialog(entry.win, {
            defaultPath: path.join(app.getPath('downloads'), choices.defaultName),
            filters: choices.filters
        })
        if (result.canceled || !result.filePath) return { ok: false, canceled: true }
        try {
            if (saveKind(result.filePath, !!original) === 'original') await fs.promises.copyFile(original, result.filePath)
            else await fs.promises.writeFile(result.filePath, Buffer.from(bytes))
            return { ok: true, path: result.filePath }
        } catch (err) {
            return { ok: false, error: String((err && err.message) || err) }
        }
    })

    ipcMain.handle('pdfv:print', (event) => new Promise((resolve) => {
        const entry = ownerWindow(event)
        if (!entry) return resolve({ ok: false })
        entry.view.webContents.print(printOptions(isDuplexOn(store.get(DUPLEX_KEY, false))), (success, reason) => resolve({ ok: success, reason }))
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
            retitle(entry)
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
        if (entry) closeTab(entry)
    })

    ipcMain.on('pdfv:title', (event, title) => {
        const entry = ownerWindow(event)
        if (!entry) return
        entry.title = String(title || entry.title).slice(0, 200)
        retitle(entry)
    })

    // the tab strip
    const fromBar = (event) => reader && !reader.win.isDestroyed() && event.sender.id === reader.bar.webContents.id
    ipcMain.handle('pdftabs:get', (event) => (fromBar(event) ? tabState() : { tabs: [], active: 0 }))
    ipcMain.on('pdftabs:activate', (event, id) => {
        if (!fromBar(event)) return
        const entry = reader.tabs.find((e) => e.view.webContents.id === id)
        if (entry) activate(entry)
    })
    ipcMain.on('pdftabs:close', (event, id) => {
        if (!fromBar(event)) return
        const entry = reader.tabs.find((e) => e.view.webContents.id === id)
        if (entry) closeTab(entry)
    })
    ipcMain.on('pdftabs:new', (event) => { if (fromBar(event)) addFromDialog() })
}

function tabState() {
    if (!reader) return { tabs: [], active: 0 }
    return { tabs: reader.tabs.map((e) => ({ id: e.view.webContents.id, title: e.title })), active: reader.active ? reader.active.view.webContents.id : 0 }
}

function pushTabs() {
    if (!reader || reader.win.isDestroyed() || reader.bar.webContents.isDestroyed()) return
    reader.bar.webContents.send('pdftabs:state', tabState())
}

// the tab and the window title follow the document
function retitle(entry) {
    pushTabs()
    if (reader && reader.active === entry && !entry.win.isDestroyed()) entry.win.setTitle(entry.title)
}

function layout() {
    if (!reader || reader.win.isDestroyed()) return
    const [width, height] = reader.win.getContentSize()
    reader.bar.setBounds({ x: 0, y: 0, width, height: TAB_BAR_H })
    for (const entry of reader.tabs) entry.view.setBounds({ x: 0, y: TAB_BAR_H, width, height: Math.max(0, height - TAB_BAR_H) })
}

function activate(entry) {
    if (!reader || !reader.tabs.includes(entry)) return
    reader.active = entry
    for (const e of reader.tabs) e.view.setVisible(e === entry)
    layout()
    if (!reader.win.isDestroyed()) reader.win.setTitle(entry.title)
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.focus()
    pushTabs()
}

function closeTab(entry) {
    if (!reader || !reader.tabs.includes(entry)) return
    const index = reader.tabs.indexOf(entry)
    reader.tabs.splice(index, 1)
    viewers.delete(entry.view.webContents.id)
    try { reader.win.contentView.removeChildView(entry.view) } catch {}
    try { if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close() } catch {}
    if (!reader.tabs.length) {
        try { reader.win.close() } catch {}
        return
    }
    if (reader.active === entry) activate(reader.tabs[Math.min(index, reader.tabs.length - 1)])
    else pushTabs()
}

function cycle(step) {
    if (!reader || reader.tabs.length < 2) return
    const index = reader.tabs.indexOf(reader.active)
    activate(reader.tabs[(index + step + reader.tabs.length) % reader.tabs.length])
}

async function addFromDialog() {
    if (!reader || reader.win.isDestroyed()) return
    const result = await dialog.showOpenDialog(reader.win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (result.canceled) return
    for (const file of result.filePaths) openWindow({ file })
}

function createReaderWindow() {
    const win = new BrowserWindow({
        width: 1080,
        height: 860,
        minWidth: 560,
        minHeight: 420,
        show: false,
        title: 'PDF',
        icon: path.join(__dirname, '..', '..', 'assets', 'logo.ico'),
        backgroundColor: '#0b0a08',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    })
    win.setMenuBarVisibility(false)
    const bar = new WebContentsView({ webPreferences: { preload: TABS_PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
    bar.setBackgroundColor('#131210')
    win.contentView.addChildView(bar)
    bar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    bar.webContents.on('will-navigate', (e) => e.preventDefault())
    bar.webContents.on('did-finish-load', pushTabs)
    bar.webContents.loadFile(TABS_PAGE).catch(() => {})
    reader = { win, bar, tabs: [], active: null }
    win.on('resize', layout)
    win.on('page-title-updated', (e) => e.preventDefault())
    win.once('closed', () => {
        const gone = reader
        reader = null
        for (const entry of (gone ? gone.tabs : [])) {
            viewers.delete(entry.view.webContents.id)
            try { if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close() } catch {}
        }
        try { if (gone && !gone.bar.webContents.isDestroyed()) gone.bar.webContents.close() } catch {}
    })
    return reader
}

// The first document opens the window, every next one becomes a tab of it. Returns the tab (an entry) of the document.
function openWindow(source) {
    registerIpc()
    const fresh = !reader || reader.win.isDestroyed()
    const current = fresh ? createReaderWindow() : reader
    if (current.tabs.length >= MAX_TABS) closeTab(current.tabs[0])
    const title = titleOf(source)
    const view = new WebContentsView({ webPreferences: VIEW_PREFERENCES })
    view.setBackgroundColor('#0b0a08')
    const entry = { win: current.win, view, source, title }
    current.tabs.push(entry)
    viewers.set(view.webContents.id, entry)
    current.win.contentView.addChildView(view)
    // Our own page only: it may not open other windows or leave itself.
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (e) => e.preventDefault())
    view.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !(input.control || input.meta)) return
        const key = String(input.key || '').toLowerCase()
        if (key === 'w') { event.preventDefault(); closeTab(entry) }
        else if (key === 't') { event.preventDefault(); addFromDialog() }
        else if (key === 'tab') { event.preventDefault(); cycle(input.shift ? -1 : 1) }
    })
    view.webContents.once('did-finish-load', () => { if (!current.win.isDestroyed() && !current.win.isVisible()) current.win.show() })
    view.webContents.loadFile(PAGE).catch(() => {})
    activate(entry)
    return entry
}

function isLiveTab(entry) {
    return !!(entry && reader && !reader.win.isDestroyed() && reader.tabs.includes(entry))
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
        return openWindow({ file: pdfPath, name, original: docxPath })
    } catch (err) {
        try { console.warn('[reader] Word file not shown, opening it outside:', err && err.message) } catch {}
        shell.openPath(docxPath).catch(() => {})
        return null
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
        return openWindow({ file: pdfPath, name: base + '.pdf' })
    } catch (err) {
        try { console.warn('[reader] picture not shown, opening it outside:', err && err.message) } catch {}
        shell.openPath(imagePath).catch(() => {})
        return null
    }
}

// A file taken out of a conversation («Все мессенджеры»): opened in the reader without a dialog and without an entry in the
// downloads list. Clicking the same file again brings its window forward instead of opening another one (Oleg, 2026-11-22).
const openedByHash = new Map()
async function openBytes(bytes, name) {
    const { readerKindForName } = require('../../shared/reader-kind')
    const kind = readerKindForName(name)
    if (!kind || !bytes || !bytes.length) return null
    const hash = require('crypto').createHash('sha1').update(bytes).digest('hex')
    const known = openedByHash.get(hash)
    if (isLiveTab(known)) {
        activate(known)
        if (known.win.isMinimized()) known.win.restore()
        known.win.focus()
        return kind
    }
    const savePath = tempPathFor(name)
    await fs.promises.writeFile(savePath, bytes)
    const tab = kind === 'pdf' ? openWindow({ file: savePath, name }) : kind === 'image' ? await openImage(savePath, name) : await openWord(savePath, name)
    if (isLiveTab(tab)) openedByHash.set(hash, tab)
    return kind
}

module.exports = { isEnabled, takeDownload, openFile, openWord, openImage, openBytes, openUrl, sweepTemp }
