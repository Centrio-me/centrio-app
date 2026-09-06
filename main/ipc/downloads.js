const { ipcMain, dialog, app, clipboard, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('../services/store')
const { t } = require('../services/i18n')

let downloadDir = store.get('settings.downloadDir', '')
let askDownload = store.get('settings.askDownload', true)

// ── История загрузок (менеджер загрузок) ─────────────────────────────────
// Отслеживаем загрузки не только в сессии главного окна, но и в каждой
// персистентной сессии мессенджера (persist:<id>) — именно там происходит
// подавляющее большинство реальных загрузок (файлы из WhatsApp/Telegram и
// т.д.), а раньше 'will-download' был подключён только к сессии главного
// окна и вообще не видел эти загрузки.
const MAX_DOWNLOADS_HISTORY = 200
let downloadsHistory = store.get('downloadsHistory', []) || []
let mainWindowGetter = null
const wiredDownloadSessions = new WeakSet()

function persistDownloadsHistory() {
    if (downloadsHistory.length > MAX_DOWNLOADS_HISTORY) {
        downloadsHistory = downloadsHistory.slice(0, MAX_DOWNLOADS_HISTORY)
    }
    store.set('downloadsHistory', downloadsHistory)
}

function broadcastDownloadUpdate(record) {
    const win = mainWindowGetter && mainWindowGetter()
    if (win && !win.isDestroyed()) {
        win.webContents.send('downloads:item-update', record)
    }
}

function wireSessionDownloads(ses, getMainWindow) {
    if (!ses || wiredDownloadSessions.has(ses)) return
    wiredDownloadSessions.add(ses)
    if (typeof getMainWindow === 'function') mainWindowGetter = getMainWindow

    ses.on('will-download', (_event, item) => {
        if (!askDownload && downloadDir) {
            try { item.setSavePath(path.join(downloadDir, item.getFilename())) } catch {}
        }

        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            filename: item.getFilename(),
            url: item.getURL(),
            savePath: item.getSavePath() || '',
            totalBytes: item.getTotalBytes(),
            receivedBytes: 0,
            state: 'progressing',
            startTime: Date.now(),
            endTime: null
        }

        downloadsHistory.unshift(record)
        persistDownloadsHistory()
        broadcastDownloadUpdate(record)

        let lastBroadcast = 0
        item.on('updated', (_e, state) => {
            record.receivedBytes = item.getReceivedBytes()
            record.totalBytes = item.getTotalBytes()
            record.savePath = item.getSavePath() || record.savePath
            record.state = state === 'interrupted' ? 'interrupted' : 'progressing'

            const now = Date.now()
            if (state === 'interrupted' || now - lastBroadcast > 250) {
                lastBroadcast = now
                broadcastDownloadUpdate(record)
            }
        })

        item.once('done', (_e, state) => {
            record.state = state // 'completed' | 'cancelled' | 'interrupted'
            record.receivedBytes = item.getReceivedBytes()
            record.savePath = item.getSavePath() || record.savePath
            record.endTime = Date.now()
            persistDownloadsHistory()
            broadcastDownloadUpdate(record)
        })
    })
}

// Small extension→MIME lookup for the drag-into-messenger feature below —
// only needs to be "good enough" for the guest page's File constructor
// (browsers don't strictly require an accurate MIME type for drop handling),
// not an exhaustive registry.
const MIME_BY_EXT = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
    json: 'application/json', zip: 'application/zip', rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm'
}

function mimeTypeFor(nameOrPath) {
    const ext = String(nameOrPath || '').split('.').pop().toLowerCase()
    return MIME_BY_EXT[ext] || 'application/octet-stream'
}

function safeOn(channel, listener) {
    ipcMain.removeAllListeners(channel)
    ipcMain.on(channel, listener)
}

function safeHandle(channel, handler) {
    try {
        ipcMain.removeHandler(channel)
    } catch {}
    ipcMain.handle(channel, handler)
}

// SECURITY: 'save-image-data' (below) used to fs.writeFileSync() to whatever
// filePath the renderer passed it, with no validation at all — an arbitrary
// file write primitive (attacker-controlled path + attacker-controlled base64
// content) reachable from any code able to call window.electronAPI.send in
// the main renderer context. Normal usage always passes back the exact path
// this process itself just handed out via 'get-save-image-path' (see
// renderer/webview-tabs-bind.js:560-567), so we track a short-lived,
// single-use allowlist of paths we actually issued and refuse to write
// anywhere else. This doesn't change behavior for the legitimate flow at all.
const pendingSaveImagePaths = new Set()
const PENDING_SAVE_PATH_TTL_MS = 5 * 60 * 1000

function registerPendingSaveImagePath(filePath) {
    if (!filePath) return
    pendingSaveImagePaths.add(filePath)
    setTimeout(() => pendingSaveImagePaths.delete(filePath), PENDING_SAVE_PATH_TTL_MS)
}

function updateDownloadHandler(getMainWindow) {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    wireSessionDownloads(win.webContents.session, getMainWindow)
}

function registerDownloadsIpc({ getMainWindow }) {
    mainWindowGetter = getMainWindow
    // Подключаем отслеживание сразу, а не только при первом изменении
    // askDownload/downloadDir — иначе загрузки в сессии главного окна не
    // отслеживались бы вовсе, пока пользователь ни разу не тронет настройки.
    updateDownloadHandler(getMainWindow)

    safeHandle('downloads:get-history', async () => downloadsHistory)

    safeOn('downloads:show-in-folder', (_event, id) => {
        const record = downloadsHistory.find(d => d.id === id)
        if (record?.savePath && fs.existsSync(record.savePath)) {
            shell.showItemInFolder(record.savePath)
        }
    })

    safeHandle('downloads:open-file', async (_event, id) => {
        const record = downloadsHistory.find(d => d.id === id)
        if (!record?.savePath || !fs.existsSync(record.savePath)) {
            return { success: false, error: 'File not found' }
        }
        const err = await shell.openPath(record.savePath)
        return err ? { success: false, error: err } : { success: true }
    })

    // FEATURE ("перетаскивание из менеджера загрузок сразу в мессенджер"):
    // renderer has no fs access (sandboxed), so the drag-and-drop gesture in
    // renderer/downloads-bind.js reads the file's raw bytes through here and
    // forwards them to the target <webview> via webview.send(), which then
    // reconstructs a File/DataTransfer inside the guest page and dispatches
    // synthetic drop events (see webview-preload.js). Only ever reads a path
    // we ourselves recorded for a *completed* download — never an arbitrary
    // renderer-supplied path — and caps size to avoid loading huge files
    // (e.g. multi-GB archives) fully into memory over a single IPC round-trip.
    const MAX_DRAG_FILE_BYTES = 100 * 1024 * 1024 // 100MB
    safeHandle('downloads:read-file-bytes', async (_event, id) => {
        const record = downloadsHistory.find(d => d.id === id)
        if (!record?.savePath || !fs.existsSync(record.savePath)) {
            return { success: false, error: 'File not found' }
        }
        if (record.state !== 'completed') {
            return { success: false, error: 'Download not completed' }
        }

        try {
            const stat = fs.statSync(record.savePath)
            if (!stat.isFile()) {
                return { success: false, error: 'Not a file' }
            }
            if (stat.size > MAX_DRAG_FILE_BYTES) {
                return { success: false, error: 'File too large' }
            }

            // Явно приводим Buffer к Uint8Array перед возвратом — Buffer технически
            // наследуется от Uint8Array, но чтобы избежать любой неоднозначности
            // сериализации через structured-clone границу IPC (main → renderer →
            // webview.send() → guest), отдаём чистый Uint8Array.
            const data = new Uint8Array(fs.readFileSync(record.savePath))
            return {
                success: true,
                data,
                filename: record.filename || path.basename(record.savePath),
                mimeType: mimeTypeFor(record.filename || record.savePath)
            }
        } catch (err) {
            return { success: false, error: String(err && err.message || err) }
        }
    })

    safeOn('downloads:remove', (_event, id) => {
        downloadsHistory = downloadsHistory.filter(d => d.id !== id)
        persistDownloadsHistory()
    })

    safeOn('downloads:clear', () => {
        downloadsHistory = []
        persistDownloadsHistory()
    })

    // BUGFIX ("папку выбираешь, а путь не прописывается"): renderer/downloads.js
    // has always read this as { success, data } (`if (!result.success) return`),
    // but this handler returned a bare string/null — `result.success` on a
    // string is undefined, so the renderer bailed out immediately on every
    // pick, before ever calling updateDownloadDirUI() or persisting the dir.
    // Also explains "не спрашивать куда сохранять" still prompting: with
    // downloadDir never actually saved, `!askDownload && downloadDir` in the
    // will-download handler above never held true regardless of the checkbox.
    safeHandle('choose-download-dir', async () => {
        const win = getMainWindow()

        const result = await dialog.showOpenDialog(win || undefined, {
            properties: ['openDirectory', 'createDirectory'],
            title: t('dialogs.chooseDownloadDir')
        })

        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, data: result.filePaths[0] }
        }

        return { success: false, data: null }
    })

    safeHandle('dialog:selectDirectory', async () => {
        const win = getMainWindow()

        const result = await dialog.showOpenDialog(win || undefined, {
            properties: ['openDirectory', 'createDirectory'],
            title: t('dialogs.chooseDownloadDir')
        })

        if (result.canceled || !result.filePaths?.length) {
            return {
                canceled: true,
                filePath: null
            }
        }

        return {
            canceled: false,
            filePath: result.filePaths[0]
        }
    })

    safeOn('set-download-dir', (_event, dir) => {
        downloadDir = dir || ''
        store.set('settings.downloadDir', downloadDir)
        updateDownloadHandler(getMainWindow)
    })

    safeOn('set-ask-download', (_event, ask) => {
        askDownload = Boolean(ask)
        store.set('settings.askDownload', askDownload)
        updateDownloadHandler(getMainWindow)
    })

    safeOn('save-page', async () => {
        const win = getMainWindow()

        await dialog.showSaveDialog(win || undefined, {
            title: t('dialogs.savePage'),
            defaultPath: t('dialogs.savePageDefault'),
            filters: [
                {
                    name: t('dialogs.savePageFilter'),
                    extensions: ['html']
                }
            ]
        })
    })

    safeHandle('get-save-image-path', async (_event, url) => {
        let ext = 'jpg'

        try {
            const cleanUrl = String(url || '').split('?')[0].split('#')[0]
            const parts = cleanUrl.split('.')

            if (parts.length > 1) {
                const candidate = parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '')
                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(candidate)) {
                    ext = candidate
                }
            }
        } catch {}

        const fileName = `image_${Date.now()}.${ext}`

        if (downloadDir && !askDownload) {
            const autoPath = path.join(downloadDir, fileName)
            registerPendingSaveImagePath(autoPath)
            return autoPath
        }

        const win = getMainWindow()
        const result = await dialog.showSaveDialog(win || undefined, {
            title: t('dialogs.saveImage'),
            defaultPath: path.join(downloadDir || app.getPath('downloads'), fileName),
            filters: [
                {
                    name: t('dialogs.saveImageFilter'),
                    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp']
                }
            ]
        })

        if (result.canceled) return null
        registerPendingSaveImagePath(result.filePath)
        return result.filePath
    })

    safeOn('save-image-data', (_event, dataUrl, filePath) => {
        if (!dataUrl || !filePath) return

        if (!pendingSaveImagePaths.has(filePath)) {
            console.warn('[security] save-image-data blocked — path was not issued by get-save-image-path:', filePath)
            return
        }
        pendingSaveImagePaths.delete(filePath)

        try {
            const base64 = String(dataUrl).split(',')[1]
            if (!base64) return

            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
        } catch (err) {
            console.error('save-image-data error:', err)
        }
    })

    // Копировать картинку в буфер обмена через native API
    safeHandle('copy-image-to-clipboard', (_event, dataUrl) => {
        try {
            const img = nativeImage.createFromDataURL(String(dataUrl || ''))
            if (!img.isEmpty()) {
                clipboard.writeImage(img)
            }
            return { success: true }
        } catch (err) {
            console.error('copy-image-to-clipboard error:', err)
            return { success: false, error: err.message }
        }
    })

    // Копировать текст в буфер обмена (fallback для renderer)
    safeHandle('copy-text-to-clipboard', (_event, text) => {
        try {
            clipboard.writeText(String(text || ''))
            return { success: true }
        } catch (err) {
            return { success: false, error: err.message }
        }
    })
}

module.exports = {
    registerDownloadsIpc,
    updateDownloadHandler,
    wireSessionDownloads
}