'use strict'
// Pictures in notes (2026-11-11): kept only on this computer, next to the app's data, one folder per note. The notes
// themselves sync through the server; their pictures do not (the owner's choice — they would fill the cloud).
// A note's list gives small copies; the full picture is read only when it is opened.

const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGES_PER_NOTE = 40
const KINDS = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' }
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const FILE = /^([A-Za-z0-9_-]{1,64})\.(png|jpg|webp|gif)$/

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

const asDataUrl = (buffer, ext) => `data:${MIME[ext]};base64,${buffer.toString('base64')}`

/**
 * @param {string} rootDir
 * @param {{ thumb?: (buffer: Buffer, ext: string) => string }} [opts] thumb: a small copy as a data: address
 */
function createNotesImages(rootDir, { thumb = asDataUrl } = {}) {
    const dirOf = (noteId) => path.join(rootDir, noteId)

    async function files(id) {
        let names = []
        try { names = await fsp.readdir(dirOf(id)) } catch { return [] }
        const out = []
        for (const name of names) {
            const m = FILE.exec(name)
            if (!m) continue
            try { out.push({ id: m[1], ext: m[2], file: path.join(dirOf(id), name), at: (await fsp.stat(path.join(dirOf(id), name))).mtimeMs }) } catch {}
        }
        return out.sort((a, b) => a.at - b.at)
    }

    async function list(noteId) {
        const id = safeId(noteId)
        if (!id) return []
        const out = []
        for (const f of await files(id)) {
            try { out.push({ id: f.id, thumb: thumb(await fsp.readFile(f.file), f.ext) }) } catch {}
        }
        return out
    }

    async function full(noteId, imageId) {
        const id = safeId(noteId)
        const img = safeId(imageId)
        if (!id || !img) return ''
        const f = (await files(id)).find((x) => x.id === img)
        if (!f) return ''
        try { return asDataUrl(await fsp.readFile(f.file), f.ext) } catch { return '' }
    }

    async function save(noteId, dataUrl) {
        const id = safeId(noteId)
        const picture = parseImageDataUrl(dataUrl)
        if (!id) return { success: false, error: 'bad_note' }
        if (!picture) return { success: false, error: 'bad_image' }
        await fsp.mkdir(dirOf(id), { recursive: true })
        if ((await files(id)).length >= MAX_IMAGES_PER_NOTE) return { success: false, error: 'too_many' }
        const imageId = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        await fsp.writeFile(path.join(dirOf(id), `${imageId}.${picture.ext}`), picture.buffer)
        return { success: true, id: imageId, thumb: thumb(picture.buffer, picture.ext) }
    }

    async function remove(noteId, imageId) {
        const id = safeId(noteId)
        const img = safeId(imageId)
        if (!id || !img) return { success: false }
        for (const ext of ['png', 'jpg', 'webp', 'gif']) {
            try { await fsp.unlink(path.join(dirOf(id), `${img}.${ext}`)) } catch {}
        }
        return { success: true }
    }

    // a deleted note: its folder of pictures goes too
    async function removeNote(noteId) {
        const id = safeId(noteId)
        if (!id) return { success: false }
        try { await fsp.rm(dirOf(id), { recursive: true, force: true }) } catch {}
        return { success: true }
    }

    return { list, full, save, remove, removeNote }
}

module.exports = { parseImageDataUrl, safeId, createNotesImages, MAX_IMAGE_BYTES }
