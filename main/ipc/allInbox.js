'use strict'
// «Все мессенджеры» (3.8): files for our conversation window — picked, pasted or dragged in — and their hand-over to
// the messenger tab behind it.
const { ipcMain, dialog, clipboard, nativeImage, webContents, app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { checkFiles, dropFiles, startDrag, finishDrag } = require('../services/inboxFiles')

const THUMB_PX = 96
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic)$/i
const PASTE_DIR = () => path.join(app.getPath('temp'), 'centrio-inbox')
const PASTE_KEEP_MS = 24 * 60 * 60 * 1000

async function describe(paths) {
    const files = checkFiles(paths, (p) => fs.statSync(p))
    return Promise.all(files.map(async (f) => {
        let thumb = ''
        if (IMAGE_EXT.test(f.name)) {
            try {
                const img = await nativeImage.createThumbnailFromPath(f.path, { width: THUMB_PX, height: THUMB_PX })
                if (!img.isEmpty()) thumb = img.toDataURL()
            } catch {
                try { const img = nativeImage.createFromPath(f.path); if (!img.isEmpty()) thumb = img.resize({ height: THUMB_PX }).toDataURL() } catch {}
            }
        }
        return { ...f, thumb }
    }))
}

// pasted pictures live a day in the app's temp folder
function sweepPasted() {
    try {
        const dir = PASTE_DIR()
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name)
            try { if (Date.now() - fs.statSync(p).mtimeMs > PASTE_KEEP_MS) fs.unlinkSync(p) } catch {}
        }
    } catch {}
}

/**
 * The picture on the clipboard as PNG bytes, or null. Electron 44 reads the clipboard asynchronously as
 * ClipboardItems (read() → getType('image/png')); older ones had readImage().
 */
async function readClipboardPng() {
    try {
        if (typeof clipboard.readImage === 'function') {
            const img = clipboard.readImage()
            return img.isEmpty() ? null : img.toPNG()
        }
        const items = await clipboard.read()
        const item = (items || []).find((it) => Array.isArray(it.types) && it.types.includes('image/png'))
        if (!item) return null
        const blob = await item.getType('image/png')
        return Buffer.from(await blob.arrayBuffer())
    } catch {
        return null
    }
}

/** The tab must be a webview of the window asking — never someone else's contents. */
function guestOf(event, guestId) {
    const wc = webContents.fromId(Number(guestId))
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== event.sender) return null
    return wc
}

function registerAllInboxIpc({ getMainWindow }) {
    ipcMain.handle('all-inbox:pick-files', async () => {
        const win = getMainWindow()
        const r = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
            title: 'Прикрепить файлы',
            properties: ['openFile', 'multiSelections']
        })
        return r.canceled ? [] : describe(r.filePaths)
    })

    ipcMain.handle('all-inbox:describe-files', (_e, paths) => describe(paths))

    ipcMain.handle('all-inbox:paste-image', async () => {
        const png = await readClipboardPng()
        if (!png || !png.length) return null
        sweepPasted()
        const dir = PASTE_DIR()
        fs.mkdirSync(dir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        const file = path.join(dir, `Изображение_${stamp}.png`)
        fs.writeFileSync(file, png)
        const [one] = await describe([file])
        return one || null
    })

    ipcMain.handle('all-inbox:drop-files', async (event, payload) => {
        const { guestId, point, paths } = payload || {}
        const wc = guestOf(event, guestId)
        if (!wc || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
        const files = checkFiles(paths, (p) => fs.statSync(p))
        if (!files.length) return false
        return dropFiles(wc, point, files)
    })

    // «Сохранить картинку» from the conversation (3.8.3): only a picture given as a data address, within a sane size,
    // saved where the person chooses (the Downloads folder is offered)
    const PICTURE_DATA = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/
    const MAX_PICTURE_BYTES = 30 * 1024 * 1024
    ipcMain.handle('all-inbox:save-picture', async (event, payload) => {
        const m = PICTURE_DATA.exec(String((payload && payload.src) || ''))
        if (!m) return false
        const bytes = Buffer.from(m[2], 'base64')
        if (!bytes.length || bytes.length > MAX_PICTURE_BYTES) return false
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
        const base = String((payload && payload.name) || 'Изображение').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Изображение'
        const name = IMAGE_EXT.test(base) ? base : `${base}.${ext}`
        const win = BrowserWindow.fromWebContents(event.sender)
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
            defaultPath: path.join(app.getPath('downloads'), name),
            filters: [{ name: 'Изображение', extensions: [ext] }]
        })
        if (canceled || !filePath) return false
        try { fs.writeFileSync(filePath, bytes); return true } catch { return false }
    })

    // «Файл» in WhatsApp (3.8.3): its own document sending needs the files' bytes — only files that pass the usual
    // check (checkFiles), at most 64 MB in all, handed to our own window only
    const MAX_DOC_BYTES = 64 * 1024 * 1024
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic', pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime', txt: 'text/plain', zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    ipcMain.handle('all-inbox:read-files', async (event, paths) => {
        const files = checkFiles(paths, (p) => fs.statSync(p))
        if (!files.length || files.reduce((n, f) => n + f.size, 0) > MAX_DOC_BYTES) return []
        try {
            return files.map((f) => {
                const ext = path.extname(f.name).slice(1).toLowerCase()
                return { name: f.name, mime: MIME[ext] || 'application/octet-stream', data: fs.readFileSync(f.path).toString('base64') }
            })
        } catch { return [] }
    })

    // a drop in two steps: start over the chat, finish over the zone the window found (3.8.3, «Фото» / «Файл»)
    const validPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ipcMain.handle('all-inbox:drag-start', async (event, payload) => {
        const { guestId, point, paths } = payload || {}
        const wc = guestOf(event, guestId)
        if (!wc || !validPoint(point)) return false
        const files = checkFiles(paths, (p) => fs.statSync(p))
        if (!files.length) return false
        return startDrag(wc, point, files)
    })
    ipcMain.handle('all-inbox:drag-finish', async (event, payload) => {
        const { guestId, point } = payload || {}
        const wc = guestOf(event, guestId)
        if (!wc || !validPoint(point)) return false
        return finishDrag(wc, point)
    })
}

module.exports = { registerAllInboxIpc }
