'use strict'
// The paper size of a rendered Word file, for printing it to PDF: the first page's size in CSS pixels (96 per inch) → inches.

const PX_PER_INCH = 96
const A4_INCHES = { width: 8.27, height: 11.69 }
const MIN_PX = 200     // a "page" smaller than about 2 inches is a layout glitch, not paper
const MAX_PX = 20000   // 208 inches

function pageSizeInches(widthPx, heightPx) {
    const w = Number(widthPx)
    const h = Number(heightPx)
    const sane = (n) => Number.isFinite(n) && n >= MIN_PX && n <= MAX_PX
    if (!sane(w) || !sane(h)) return { ...A4_INCHES }
    return { width: w / PX_PER_INCH, height: h / PX_PER_INCH }
}

module.exports = { pageSizeInches, A4_INCHES }
