// Is the person looking at Centrio? Background work (the «Все мессенджеры» lists, the open chat, the moving light of
// «Аврора») slows down or stops when not. The page alone cannot tell: with a messenger tab in focus,
// document.hasFocus() is false, so the main window's own focus comes from main (main/bootstrap/initApp.js).

let windowFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true
const listeners = new Set()

function notify() { for (const fn of listeners) { try { fn() } catch {} } }

if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.on === 'function') {
    window.electronAPI.on('window-focus', (on) => { windowFocused = on !== false; notify() })
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', notify)

/** hidden, minimised, or another window in front */
function isAway() {
    return (typeof document !== 'undefined' && document.hidden) || !windowFocused
}

/** hidden or minimised: nothing on screen at all */
function isHidden() {
    return typeof document !== 'undefined' && document.hidden
}

/** called whenever the answer may have changed */
function onAttentionChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

module.exports = { isAway, isHidden, onAttentionChange }
