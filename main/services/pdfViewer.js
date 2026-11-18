// Centrio's own PDF reader: a PDF that a messenger downloads (or a link to one) opens in a window of its own with
// Chromium's built-in viewer (zoom, search, pages, print, save) instead of the file manager or the outside browser.
// A reader only: nothing here edits the document. Turned on by settings.pdfViewer (default on).
'use strict'

const { BrowserWindow, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const store = require('./store')
const { isPdfDownload, isPdfUrl } = require('../../shared/pdf-detect')

const TEMP_DIR_NAME = 'centrio-pdf'
const MAX_WINDOWS = 8
const windows = new Set()

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

function openWindow(target, title) {
    if (windows.size >= MAX_WINDOWS) {
        const oldest = windows.values().next().value
        try { oldest.close() } catch {}
    }
    const win = new BrowserWindow({
        width: 1000,
        height: 820,
        minWidth: 480,
        minHeight: 360,
        show: false,
        title: title || 'PDF',
        icon: path.join(__dirname, '..', '..', 'assets', 'logo.ico'),
        backgroundColor: '#0b0a08',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true, spellcheck: false }
    })
    win.setMenuBarVisibility(false)
    windows.add(win)
    win.once('closed', () => windows.delete(win))
    // The reader only shows the document: it may not open other windows or leave it.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e, url) => { if (url !== target) e.preventDefault() })
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show() })
    win.on('page-title-updated', (e) => e.preventDefault())
    win.loadURL(target).catch(() => {})
    return win
}

// A downloaded file on disk (a path we wrote ourselves).
function openFile(filePath, title) {
    if (!filePath || !fs.existsSync(filePath)) return false
    openWindow(pathToFileURL(filePath).href, title || path.basename(filePath))
    return true
}

function openUrl(url) {
    if (!isPdfUrl(url)) return false
    let name = 'PDF'
    try { name = decodeURIComponent(path.basename(new URL(url).pathname)) || name } catch {}
    openWindow(url, name)
    return true
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
