'use strict'
// A screenshot for the support chat: a modern screen makes a PNG of 3 to 10 MB, the server takes 5 MB. So a big picture
// is made smaller (the longest side, then the JPEG quality) until it fits, instead of an error (2026-11-18, a client who
// tried twice to attach a screenshot and could not). The size of a picture the person sees in the chat stays readable.

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIDE = 2560
const QUALITIES = [0.9, 0.82, 0.72, 0.6]

/** The size to draw a picture at so that its longest side is at most max (never bigger than the original). */
function fitSize(width, height, max = MAX_SIDE) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height))
    const longest = Math.max(w, h)
    if (longest <= max) return { width: w, height: h }
    const k = max / longest
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** Does the file need work: a type we do not take as is, or a size over the limit. */
function needsConversion(file, maxBytes) {
    return !ALLOWED.includes(file.type) || file.size > maxBytes
}

function toBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * @returns {Promise<File|null>} a file that fits, or null when the file is not a picture or cannot be made small enough.
 * A GIF is not converted (it would stop moving): too big stays an error.
 */
async function prepareImage(file, maxBytes) {
    if (!needsConversion(file, maxBytes)) return file
    if (file.type === 'image/gif' || !/^image\//.test(file.type)) return null
    let bitmap
    try { bitmap = await createImageBitmap(file) } catch { return null }
    try {
        let side = MAX_SIDE
        for (let round = 0; round < 3; round++) {
            const { width, height } = fitSize(bitmap.width, bitmap.height, side)
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#fff' // a transparent PNG becomes white under JPEG, not black
            ctx.fillRect(0, 0, width, height)
            ctx.drawImage(bitmap, 0, 0, width, height)
            for (const q of QUALITIES) {
                const blob = await toBlob(canvas, 'image/jpeg', q)
                if (blob && blob.size <= maxBytes) {
                    const base = String(file.name || 'screenshot').replace(/\.[^.]+$/, '') || 'screenshot'
                    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
                }
            }
            side = Math.round(side * 0.7)
        }
        return null
    } finally {
        if (bitmap && bitmap.close) bitmap.close()
    }
}

module.exports = { fitSize, needsConversion, prepareImage, MAX_SIDE }
