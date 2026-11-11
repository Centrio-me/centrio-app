const { ipcMain, app } = require('electron')
const path = require('path')
const { createNotesImages } = require('../services/notesImages')

// Pictures in notes, kept on this computer only (main/services/notesImages.js)
function registerNotesImagesIpc() {
    const images = createNotesImages(path.join(app.getPath('userData'), 'note-images'))
    const handle = (channel, fn) => { try { ipcMain.removeHandler(channel) } catch {} ipcMain.handle(channel, fn) }
    handle('notes-images:list', (_e, noteId) => { try { return images.list(noteId) } catch { return [] } })
    handle('notes-images:save', (_e, noteId, dataUrl) => { try { return images.save(noteId, dataUrl) } catch (e) { return { success: false, error: e.message } } })
    handle('notes-images:delete', (_e, noteId, imageId) => { try { return images.remove(noteId, imageId) } catch { return { success: false } } })
}

module.exports = { registerNotesImagesIpc }
