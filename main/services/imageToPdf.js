// A picture (JPG, PNG, WebP...) → PDF bytes, so it opens in Centrio's own reader with zoom, print and save like any document.
// The picture is drawn in a window nobody sees (no Node, a sandbox, no navigation, no new windows) and printed by Chromium on a page
// of its own shape (shared/image-page.js).
'use strict'

const { BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { fitPageInches } = require('../../shared/image-page')

const MAX_IMAGE_BYTES = 60 * 1024 * 1024
const RENDER_TIMEOUT_MS = 30 * 1000

function withTimeout(promise, ms, what) {
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms) })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** @param {string} imagePath a picture on disk (one we saved ourselves) → Promise<Buffer> the PDF */
async function convertImageToPdf(imagePath) {
    const stat = await fs.promises.stat(imagePath)
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error('image too large')
    const page = path.join(path.dirname(imagePath), 'centrio-image-view.html')
    const csp = "default-src 'none'; img-src file:; style-src 'unsafe-inline'"
    await fs.promises.writeFile(page, `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
        '<style>html,body{margin:0;padding:0;background:#fff}img{display:block}</style>' +
        `<img id="pic" src="${escapeHtml(encodeURIComponent(path.basename(imagePath)))}">`)

    const win = new BrowserWindow({
        show: false,
        width: 1000,
        height: 1000,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, javascript: true, spellcheck: false }
    })
    try {
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.webContents.on('will-navigate', (e) => e.preventDefault())
        await withTimeout(win.loadFile(page), RENDER_TIMEOUT_MS, 'loading the picture')
        const size = await withTimeout(win.webContents.executeJavaScript(
            'new Promise((res, rej) => { const i = document.getElementById("pic"); const done = () => i.naturalWidth ? res([i.naturalWidth, i.naturalHeight]) : rej(new Error("not a picture")); i.complete ? done() : (i.onload = done, i.onerror = done) })'
        ), RENDER_TIMEOUT_MS, 'reading the picture')
        const sheet = fitPageInches(size[0], size[1])
        await win.webContents.executeJavaScript(`(() => { const i = document.getElementById("pic"); i.style.width = "${sheet.width}in"; i.style.height = "${sheet.height}in"; return true })()`)
        return await withTimeout(win.webContents.printToPDF({
            printBackground: true,
            pageSize: sheet,
            margins: { marginType: 'none' },
            preferCSSPageSize: false
        }), RENDER_TIMEOUT_MS, 'printing')
    } finally {
        if (!win.isDestroyed()) win.destroy()
        fs.promises.rm(page, { force: true }).catch(() => {})
    }
}

module.exports = { convertImageToPdf }
