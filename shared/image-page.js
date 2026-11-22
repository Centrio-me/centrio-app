// The PDF page a picture is printed on (so the reader can show it): the picture's proportions, the longer side as long as an A4 sheet.
'use strict'

const LONG_SIDE_IN = 11.69
const A4 = { width: 8.27, height: 11.69 }
const MIN_SIDE_IN = 1

/** @param {number} widthPx @param {number} heightPx → {width, height} in inches */
function fitPageInches(widthPx, heightPx) {
    if (!(widthPx > 0) || !(heightPx > 0) || !Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return { ...A4 }
    const ratio = Math.max(Math.min(widthPx, heightPx) / Math.max(widthPx, heightPx), MIN_SIDE_IN / LONG_SIDE_IN)
    const short = LONG_SIDE_IN * ratio
    return widthPx >= heightPx ? { width: LONG_SIDE_IN, height: short } : { width: short, height: LONG_SIDE_IN }
}

module.exports = { fitPageInches }
