// VK documents (PDF, Word, a picture sent «as a file», ...) — what their addresses look like and how to find the real file.
//
// A click on a document in VK opens vk.ru/s/v1/doc/<token>: a page with a «Скачать файл» button. Its script holds the real file in
// Docs.initDoc({"docUrl": "https://psv4.vkuserphoto.ru/s/v1/d2/.../name.pdf", "docTitle": ..., "docExt": ...}). Centrio reads that address
// itself, so the person is never taken to VK's page or to a browser: the file comes down like any other and opens in the reader.
'use strict'

const VK_PAGE_HOST_RE = /^([a-z0-9-]+\.)*vk\.(ru|com)$/i
const VK_FILE_HOST_RE = /^psv\d+\.(vkuserphoto\.ru|userapi\.com)$/i
// where the file named on a document page may live: VK's own servers only (the page itself is VK's, but the address is still checked)
const VK_ALLOWED_FILE_HOST_RE = /(^|\.)(vkuserphoto\.ru|userapi\.com|vk\.ru|vk\.com|vk-cdn\.net|vk\.me)$/i
const LANDING_PATH_RE = /^\/(s\/v1\/doc\/[\w-]+|doc-?\d+_\d+(_\w+)?)\/?$/i
const FILE_PATH_RE = /^\/s\/v1\/d\d*\//i
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])

function parseHttps(raw) {
    try {
        const url = new URL(String(raw))
        return url.protocol === 'https:' ? url : null
    } catch { return null }
}

function isVkPage(raw) {
    const url = parseHttps(raw)
    return !!url && VK_PAGE_HOST_RE.test(url.hostname)
}

function isVkDocLanding(raw) {
    const url = parseHttps(raw)
    return !!url && VK_PAGE_HOST_RE.test(url.hostname) && LANDING_PATH_RE.test(url.pathname)
}

function isVkDocFile(raw) {
    const url = parseHttps(raw)
    return !!url && VK_FILE_HOST_RE.test(url.hostname) && FILE_PATH_RE.test(url.pathname)
}

// The JSON object that follows «Docs.initDoc(» (braces counted outside of strings; a damaged one gives nothing).
function extractInitDoc(html) {
    const start = html.indexOf('Docs.initDoc(')
    if (start < 0) return null
    const open = html.indexOf('{', start)
    if (open < 0) return null
    let depth = 0
    let inString = false
    for (let i = open; i < html.length; i++) {
        const ch = html[i]
        if (inString) {
            if (ch === '\\') i++
            else if (ch === '"') inString = false
        } else if (ch === '"') inString = true
        else if (ch === '{') depth++
        else if (ch === '}' && --depth === 0) return html.slice(open, i + 1)
    }
    return null
}

/** @param {string} html a VK document page → {url, title, ext} of the real file, or null */
function parseDocPage(html) {
    if (typeof html !== 'string' || !html) return null
    let doc
    try { doc = JSON.parse(extractInitDoc(html)) } catch { return null }
    if (!doc || typeof doc.docUrl !== 'string') return null
    const file = parseHttps(doc.docUrl)
    if (!file || !VK_ALLOWED_FILE_HOST_RE.test(file.hostname)) return null
    const title = typeof doc.docTitle === 'string' ? doc.docTitle.slice(0, 200) : ''
    const ext = typeof doc.docExt === 'string' ? doc.docExt.slice(0, 12).toLowerCase() : ''
    return { url: file.toString(), title, ext }
}

/** @returns {'pdf'|'word'|'image'|'other'} how a document of this type is shown */
function kindOfExt(ext) {
    const e = String(ext || '').toLowerCase()
    if (e === 'pdf') return 'pdf'
    if (e === 'docx') return 'word'
    if (IMAGE_EXT.has(e)) return 'image'
    return 'other'
}

module.exports = { isVkPage, isVkDocLanding, isVkDocFile, parseDocPage, kindOfExt }
