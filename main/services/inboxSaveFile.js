'use strict'
// «Все мессенджеры»: a file taken from a conversation by the messenger's own downloader arrives as a data address and
// is saved where the person chooses. This checks what arrives; the dialog and the writing are in main/ipc/allInbox.js.

const FILE_DATA = /^data:[\w.+/-]+(;[\w=.+-]+)*;base64,([A-Za-z0-9+/=]*)$/
const MAX_FILE_BYTES = 100 * 1024 * 1024
// what a file name must not hold on Windows, and control characters
const BAD_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g

function safeName(raw) {
    const cleaned = String(raw || '')
        .replace(BAD_NAME_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+/, '')
        .trim()
        .slice(0, 120)
    return cleaned || 'Файл'
}

/** @returns {{ bytes: Buffer, name: string } | null} */
function parseFilePayload(payload) {
    const data = payload && typeof payload.data === 'string' ? payload.data : ''
    const m = FILE_DATA.exec(data)
    if (!m) return null
    // the size is known from the text before anything big is built
    if (Math.floor((m[2].length * 3) / 4) > MAX_FILE_BYTES) return null
    const bytes = Buffer.from(m[2], 'base64')
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) return null
    return { bytes, name: safeName(payload.name) }
}

const PICTURE_DATA = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/
const MAX_PICTURE_BYTES = 30 * 1024 * 1024

/** A picture taken out of a note to be sent on: only a plain picture type, within a sane size. */
function parsePicturePayload(payload) {
    const m = PICTURE_DATA.exec(String((payload && payload.src) || ''))
    if (!m) return null
    if (Math.floor((m[2].length * 3) / 4) > MAX_PICTURE_BYTES) return null
    const bytes = Buffer.from(m[2], 'base64')
    if (!bytes.length || bytes.length > MAX_PICTURE_BYTES) return null
    return { bytes, ext: m[1] === 'jpeg' ? 'jpg' : m[1], name: safeName(payload.name) }
}

module.exports = { parseFilePayload, parsePicturePayload, safeName, MAX_FILE_BYTES }
