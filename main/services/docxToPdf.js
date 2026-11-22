// A Word file (.docx) → PDF bytes, so it opens in Centrio's own reader like a PDF does. The file is drawn by docx-preview in a
// window nobody sees (docx-render/), then printed to PDF by Chromium. No office program and no network are involved;
// the window has no Node, a sandbox and a content policy that only lets our two scripts run.
'use strict'

const { BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { pageSizeInches } = require('../../shared/docx-page')

const PAGE = path.join(__dirname, '..', '..', 'docx-render', 'render.html')
const MAX_DOCX_BYTES = 60 * 1024 * 1024
const RENDER_TIMEOUT_MS = 45 * 1000

function withTimeout(promise, ms, what) {
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms) })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** @param {string} docxPath a .docx file on disk (one we saved ourselves) → Promise<Buffer> the PDF */
async function convertDocxToPdf(docxPath) {
    const stat = await fs.promises.stat(docxPath)
    if (!stat.isFile() || stat.size > MAX_DOCX_BYTES) throw new Error('docx too large')
    const base64 = (await fs.promises.readFile(docxPath)).toString('base64')

    const win = new BrowserWindow({
        show: false,
        width: 1000,
        height: 1000,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, javascript: true, spellcheck: false }
    })
    try {
        // nothing leaves this window: no new windows, no navigation away from our page
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.webContents.on('will-navigate', (e) => e.preventDefault())
        await withTimeout(win.loadFile(PAGE), RENDER_TIMEOUT_MS, 'loading the renderer')
        const info = await withTimeout(win.webContents.executeJavaScript(`window.renderDocx(${JSON.stringify(base64)})`), RENDER_TIMEOUT_MS, 'rendering')
        if (!info || !info.pages) throw new Error('empty document')
        const pageSize = pageSizeInches(info.widthPx, info.heightPx)
        return await withTimeout(win.webContents.printToPDF({
            printBackground: true,
            pageSize,
            margins: { marginType: 'none' },
            preferCSSPageSize: false
        }), RENDER_TIMEOUT_MS, 'printing')
    } finally {
        if (!win.isDestroyed()) win.destroy()
    }
}

module.exports = { convertDocxToPdf }
