const fs = require('fs')
const path = require('path')
const { app, ipcMain } = require('electron')
const { playSound } = require('../services/sound')

const CUSTOM_SOUNDS_DIR = 'custom-sounds'
const MAX_SOUND_BYTES = 20 * 1024 * 1024
const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'])

// The chosen file is copied into the app's own folder, so the sound survives if the original is moved or deleted.
async function importCustomSound(sourcePath) {
    if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) return { success: false, error: 'bad_path' }
    const extension = path.extname(sourcePath).toLowerCase()
    if (!SOUND_EXTENSIONS.has(extension)) return { success: false, error: 'bad_type' }
    const stat = await fs.promises.stat(sourcePath)
    if (!stat.isFile() || stat.size > MAX_SOUND_BYTES) return { success: false, error: 'too_large' }

    const dir = path.join(app.getPath('userData'), CUSTOM_SOUNDS_DIR)
    await fs.promises.mkdir(dir, { recursive: true })
    const target = path.join(dir, `custom-${Date.now()}${extension}`)
    await fs.promises.copyFile(sourcePath, target)
    for (const name of await fs.promises.readdir(dir)) {
        const old = path.join(dir, name)
        if (old !== target) await fs.promises.rm(old, { force: true })
    }
    return { success: true, path: target }
}

function registerSoundIpc() {
    ipcMain.on('play-sound', async (event, soundPath) => {
        try {
            await playSound(soundPath)
        } catch (e) {
            console.error('play-sound error:', e)
        }
    })

    ipcMain.removeHandler('sound:import-custom')
    ipcMain.handle('sound:import-custom', async (event, sourcePath) => {
        try {
            return await importCustomSound(sourcePath)
        } catch (e) {
            console.error('sound:import-custom error:', e)
            return { success: false, error: 'copy_failed' }
        }
    })
}

module.exports = registerSoundIpc
