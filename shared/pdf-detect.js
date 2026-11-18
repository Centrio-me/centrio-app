// Which downloads / links are PDF documents (opened in Centrio's own reader instead of the file manager or browser).
'use strict'

function isPdfDownload(filename, mimeType) {
    if (String(mimeType || '').toLowerCase().split(';')[0].trim() === 'application/pdf') return true
    return /\.pdf$/i.test(String(filename || '').trim())
}

// An http(s) address whose path ends in .pdf (query and fragment ignored). Nothing else is a "PDF link".
function isPdfUrl(raw) {
    let url
    try { url = new URL(String(raw)) } catch { return false }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return /\.pdf$/i.test(url.pathname)
}

module.exports = { isPdfDownload, isPdfUrl }
