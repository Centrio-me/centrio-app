'use strict'
// Which of the files that come out of a conversation Centrio's own reader shows (PDF, Word as PDF, a picture as a page).
const { isPdfDownload } = require('./pdf-detect')
const { isWordDownload } = require('./doc-detect')

const PICTURE_NAME = /\.(jpe?g|png|webp|gif)$/i

/** @returns {'pdf' | 'word' | 'image' | null} */
function readerKindForName(name) {
    const n = String(name || '').trim()
    if (!n) return null
    if (isPdfDownload(n, '')) return 'pdf'
    if (isWordDownload(n)) return 'word'
    if (PICTURE_NAME.test(n)) return 'image'
    return null
}

module.exports = { readerKindForName }
