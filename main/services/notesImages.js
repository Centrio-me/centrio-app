'use strict'
// Pictures in notes (2026-11-11): kept only on this computer, next to the app's data, one folder per note. The notes
// themselves sync through the server; their pictures do not (the owner's choice — they would fill the cloud).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGES_PER_NOTE = 40
const KINDS = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' }
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** A picture given as a data: address → its file kind and bytes; anything else, or too big, → null. */
function parseImageDataUrl(value) {
    if (typeof value !== 'string') return null
    const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(value)
    if (!m) return null
    if (Math.floor(m[2].length * 3 / 4) > MAX_IMAGE_BYTES) return null
    const buffer = Buffer.from(m[2], 'base64')
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null
    return { ext: KINDS[m[1]], buffer }
}

/** An id that may name a folder or a file: letters, digits, «-» and «_» only. */
function safeId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : ''
}

function createNotesImages(rootDir) {
    const dirOf = (noteId) => path.join(rootDir, noteId)

    function list(noteId) {
        const id = safeId(noteId)
        if (!id) return []
        let names = []
        try { names = fs.readdirSync(dirOf(id)) } catch { return [] }
        return names
            .map((name) => {
                const m = /^([A-Za-z0-9_-]{1,64})\.(png|jpg|webp|gif)$/.exec(name)
                if (!m) return null
                const file = path.join(dirOf(id), name)
                let stat = null
                try { stat = fs.statSync(file) } catch { return null }
                return { id: m[1], ext: m[2], file, at: stat.mtimeMs }
            })
            .filter(Boolean)
            .sort((a, b) => a.at - b.at)
            .map((x) => ({ id: x.id, dataUrl: `data:${MIME[x.ext]};base64,${fs.readFileSync(x.file).toString('base64')}` }))
    }

    function save(noteId, dataUrl) {
        const id = safeId(noteId)
        const picture = parseImageDataUrl(dataUrl)
        if (!id || !picture) return { success: false, error: 'bad_image' }
        fs.mkdirSync(dirOf(id), { recursive: true })
        if (fs.readdirSync(dirOf(id)).length >= MAX_IMAGES_PER_NOTE) return { success: false, error: 'too_many' }
        const imageId = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        fs.writeFileSync(path.join(dirOf(id), `${imageId}.${picture.ext}`), picture.buffer)
        return { success: true, id: imageId, dataUrl: `data:${MIME[picture.ext]};base64,${picture.buffer.toString('base64')}` }
    }

    function remove(noteId, imageId) {
        const id = safeId(noteId)
        const img = safeId(imageId)
        if (!id || !img) return { success: false }
        for (const ext of ['png', 'jpg', 'webp', 'gif']) {
            try { fs.unlinkSync(path.join(dirOf(id), `${img}.${ext}`)) } catch {}
        }
        return { success: true }
    }

    return { list, save, remove }
}

module.exports = { parseImageDataUrl, safeId, createNotesImages, MAX_IMAGE_BYTES }
