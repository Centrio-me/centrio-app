// VK documents inside Centrio. A click on a document in VK would take the person to VK's «Скачать файл» page, a window of its own or the
// outside browser. Here the page is read in the background (with the tab's own session, so private documents work), the real file
// address is taken from it and the file comes down through the tab like any download: PDF and Word open in the reader (pdfViewer.js),
// a picture sent as a file opens there too, anything else is saved with the usual progress line.
'use strict'

const { isVkPage, isVkDocLanding, isVkDocFile, parseDocPage, kindOfExt } = require('../../shared/vk-doc')

const MAX_PAGE_BYTES = 3 * 1024 * 1024
const READER_IMAGE_TTL_MS = 2 * 60 * 1000

// file address → time it was asked for: only a picture the person opened from a VK document goes to the reader,
// never every image a messenger saves
const readerImages = new Map()

function markReaderImage(url) {
    const now = Date.now()
    for (const [key, at] of readerImages) if (now - at > READER_IMAGE_TTL_MS) readerImages.delete(key)
    readerImages.set(url, now)
}

/** True once for a file address that was opened from a VK document and is a picture. */
function takesImage(url) {
    const at = readerImages.get(url)
    if (at === undefined) return false
    readerImages.delete(url)
    return Date.now() - at <= READER_IMAGE_TTL_MS
}

function extOfUrl(raw) {
    try { return (/\.([a-z0-9]{1,8})$/i.exec(new URL(raw).pathname) || [])[1] || '' } catch { return '' }
}

function charsetOf(contentType) {
    const found = /charset=["']?([\w-]+)/i.exec(String(contentType || ''))
    return found ? found[1] : 'utf-8'
}

function decode(bytes, contentType) {
    try { return new TextDecoder(charsetOf(contentType)).decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

/** Is this a VK document link opened from a VK tab (the only place we take over)? */
function handles(guest, url) {
    if (!guest || !(isVkDocLanding(url) || isVkDocFile(url))) return false
    let pageUrl = ''
    try { pageUrl = guest.getURL() } catch { return false }
    return isVkPage(pageUrl)
}

async function readLanding(guest, url) {
    const res = await guest.session.fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_PAGE_BYTES) return null
    return parseDocPage(decode(bytes, res.headers.get('content-type')))
}

/** @returns {Promise<boolean>} true when the file is coming down; false when the caller should do what it did before */
async function open(guest, url) {
    try {
        let fileUrl = url
        let ext = extOfUrl(url)
        if (!isVkDocFile(url)) {
            const doc = await readLanding(guest, url)
            if (!doc) return false
            fileUrl = doc.url
            ext = doc.ext || extOfUrl(doc.url)
        }
        if (kindOfExt(ext) === 'image') markReaderImage(fileUrl)
        guest.downloadURL(fileUrl)
        return true
    } catch {
        return false
    }
}

module.exports = { handles, open, takesImage }
