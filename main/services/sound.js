const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let sound = null
try {
    sound = require('sound-play')
} catch {
    sound = null
}

// BUGFIX ("свои звуки уведомлений не воспроизводятся, вообще без ошибки"):
// every early-exit below used to be a bare `return` — playSound() looked
// like it succeeded from the caller's perspective (main/ipc/sound.js awaits
// it inside a try/catch that only logs actual thrown errors), so a bad path
// coming from the renderer (e.g. the old file.path-is-undefined bug in
// renderer/sounds.js) failed completely silently with zero trace anywhere.
// Log a warning for every no-op path so future breakage is diagnosable from
// the main-process console instead of just "sound doesn't play, no idea why".
async function playSound(soundPath) {
    if (!sound) {
        console.warn('[sound] play-sound requested but the sound-play module is unavailable')
        return
    }
    if (!soundPath) {
        console.warn('[sound] play-sound requested with an empty path')
        return
    }

    let absolutePath
    if (path.isAbsolute(soundPath)) {
        absolutePath = soundPath
    } else {
        // В packaged-сборке файлы звуков распакованы из .asar в app.asar.unpacked
        // (требует asarUnpack в package.json). Пробуем unpacked-путь первым.
        const unpackedPath = path.join(
            process.resourcesPath || app.getAppPath(),
            'app.asar.unpacked',
            soundPath
        )
        if (fs.existsSync(unpackedPath)) {
            absolutePath = unpackedPath
        } else {
            // Dev-режим: файлы рядом с исходниками
            absolutePath = path.join(app.getAppPath(), soundPath)
        }
    }

    if (!fs.existsSync(absolutePath)) {
        console.warn(`[sound] play-sound: resolved path does not exist, skipping: ${absolutePath}`)
        return
    }

    await sound.play(absolutePath)
}

module.exports = {
    playSound
}