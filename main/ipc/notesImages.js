const { ipcMain, app, nativeImage } = require('electron')
const path = require('path')
const { createNotesImages } = require('../services/notesImages')

// a note's list shows small copies (about twice the 96 px they are drawn at); the full picture is read on opening
const THUMB_PX = 200

function smallCopy(buffer, ext) {
    try {
        const img = nativeImage.createFromBuffer(buffer)
        if (img.isEmpty()) return ''
        const { width, height } = img.getSize()
        const k = THUMB_PX / Math.max(1, Math.min(width, height))
        const small = k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'good' }) : img
        return `data:image/jpeg;base64,${small.toJPEG(82).toString('base64')}`
    } catch {
        return ''
    }
}

// Pictures in notes, kept on this computer only (main/services/notesImages.js)
function registerNotesImagesIpc() {
    const images = createNotesImages(path.join(app.getPath('userData'), 'note-images'), { thumb: smallCopy })
    const handle = (channel, fn) => { try { ipcMain.removeHandler(channel) } catch {} ipcMain.handle(channel, fn) }
    handle('notes-images:list', (_e, noteId) => images.list(noteId).catch(() => []))
    handle('notes-images:full', (_e, noteId, imageId) => images.full(noteId, imageId).catch(() => ''))
    handle('notes-images:save', (_e, noteId, dataUrl) => images.save(noteId, dataUrl).catch((e) => ({ success: false, error: e.message })))
    handle('notes-images:delete', (_e, noteId, imageId) => images.remove(noteId, imageId).catch(() => ({ success: false })))
    handle('notes-images:delete-note', (_e, noteId) => images.removeNote(noteId).catch(() => ({ success: false })))
}

module.exports = { registerNotesImagesIpc }
