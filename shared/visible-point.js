'use strict'
// A point to click on an element that may be partly outside the window (a very long message): the middle of the part that can be seen.
// Written as one self-contained function: its text is put into the script that runs inside the messenger's page.

/** @returns {{ x: number, y: number } | null} null when none of the element is in the window */
function visiblePoint(rect, width, height) {
    var left = Math.max(rect.left, 0)
    var right = Math.min(rect.right, width)
    var top = Math.max(rect.top, 0)
    var bottom = Math.min(rect.bottom, height)
    if (right - left < 1 || bottom - top < 1) return null
    return { x: (left + right) / 2, y: (top + bottom) / 2 }
}

module.exports = { visiblePoint }
