'use strict'
// Where the little pointer of the right panel card goes (3.7.4, Аврора / Время суток), see right-panel-pointer.js.

// The card has rounded corners (20px) and starts 8px below the column: the pointer stays below the curve
const MIN_Y = 28

/**
 * @param {{ top: number, height: number } | null} btn the active button
 * @param {{ top: number, height: number }} bar the button column
 * @returns {number | null} px from the top of the column, or null when there is nothing to point at
 */
function pointerY(btn, bar) {
    if (!btn || !bar) return null
    const y = Math.round(btn.top + btn.height / 2 - bar.top)
    if (y < 0 || y > bar.height) return null
    return Math.max(MIN_Y, y)
}

module.exports = { pointerY }
