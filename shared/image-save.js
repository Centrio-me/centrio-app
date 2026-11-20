// Saving a picture from a page: what the file really is, what to call it, and the order of ways to get the picture.
// Pure functions (no Electron), so they are tested; main/services/imageSave.js does the real work with them.
'use strict'

const MAX_BYTES = 60 * 1024 * 1024
const NAME_MAX = 90

// Failure codes the person gets a message for (renderer: imageSave.fail.<code>).
const CODES = ['network', 'denied', 'notImage', 'tooBig', 'folder', 'gone', 'generic']

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico' }

/** What the bytes are, by their first bytes (never by the address or what the server says): { ext, mime } or null. */
function sniffImage(buffer) {
    if (!buffer || buffer.length < 12) return null
    const b = buffer
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', mime: 'image/png' }
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
    if (b.slice(0, 4).toString('latin1') === 'GIF8') return { ext: 'gif', mime: 'image/gif' }
    if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
    if (b[0] === 0x42 && b[1] === 0x4d) return { ext: 'bmp', mime: 'image/bmp' }
    if (b.slice(4, 8).toString('latin1') === 'ftyp' && /avif|avis/.test(b.slice(8, 16).toString('latin1'))) return { ext: 'avif', mime: 'image/avif' }
    const head = b.slice(0, 256).toString('utf8').trimStart().toLowerCase()
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { ext: 'svg', mime: 'image/svg+xml' }
    return null
}

/** The extension a server's content type stands for, or ''. */
function extFromMime(mime) {
    return MIME_EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || ''
}

function cleanName(raw) {
    return String(raw || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^[. ]+|[. ]+$/g, '')
        .slice(0, NAME_MAX)
}

function fromContentDisposition(header) {
    const text = String(header || '')
    const star = text.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/)
    if (star) { try { return cleanName(decodeURIComponent(star[1])) } catch { /* fall through */ } }
    const plain = text.match(/filename\s*=\s*"?([^";]+)"?/)
    return plain ? cleanName(plain[1]) : ''
}

function pad(n) { return String(n).padStart(2, '0') }

/**
 * A file name with the REAL extension: the name the server or the address gives (when it looks like a name), else
 * «image_2026-11-20_14-05-09». The extension always comes from the bytes (a .jpg that holds a WebP is saved as .webp).
 */
function pickFileName({ contentDisposition, url, ext, now = new Date() }) {
    let base = fromContentDisposition(contentDisposition)
    if (!base) {
        try {
            const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
            if (/\.[A-Za-z0-9]{2,5}$/.test(last)) base = cleanName(last)
        } catch { /* a data: or odd address: no name in it */ }
    }
    base = base.replace(/\.[A-Za-z0-9]{2,5}$/, '')
    if (!base) base = `image_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    return `${base}.${ext || 'png'}`
}

/** «name.png» → «name (1).png» … the first one that does not exist yet. */
function uniqueName(name, exists) {
    if (!exists(name)) return name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let i = 1; i < 1000; i++) { const next = `${stem} (${i})${ext}`; if (!exists(next)) return next }
    return `${stem}_${Date.now()}${ext}`
}

/**
 * Tries the ways to get the picture one after another and returns the first that gives a real picture.
 * Each way: async () => ({ buffer, contentType?, contentDisposition?, via }) or throws an Error with `code`.
 * When all fail, the code of the most telling failure (denied > network > notImage > tooBig > gone > generic) comes back.
 */
async function obtainFirst(ways) {
    const failures = []
    for (const way of ways) {
        try {
            const got = await way()
            if (!got || !got.buffer) { failures.push('generic'); continue }
            if (got.buffer.length > MAX_BYTES) { failures.push('tooBig'); continue }
            const kind = sniffImage(got.buffer)
            if (!kind) { failures.push('notImage'); continue }
            return { ok: true, ...got, ext: kind.ext, mime: kind.mime }
        } catch (err) {
            failures.push(err && CODES.includes(err.code) ? err.code : 'generic')
        }
    }
    const order = ['denied', 'tooBig', 'network', 'notImage', 'gone', 'generic']
    const code = order.find((c) => failures.includes(c)) || 'generic'
    return { ok: false, code, tried: failures }
}

function failure(code) { const e = new Error(code); e.code = code; return e }

/** The network code for an HTTP status. */
function codeForStatus(status) { return status === 401 || status === 403 ? 'denied' : (status === 404 || status === 410 ? 'gone' : 'network') }

module.exports = { MAX_BYTES, CODES, sniffImage, extFromMime, cleanName, fromContentDisposition, pickFileName, uniqueName, obtainFirst, failure, codeForStatus }
