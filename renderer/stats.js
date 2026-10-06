// Anonymous product events for the admin funnel. Fire and forget: statistics must never slow down or break the app.
const seen = new Set()

/** @param {string} name  lower_snake_case event name  @param {{ once?: boolean }} [options] once: only the first time per run */
function track(name, props, options = {}) {
    try {
        if (options.once) {
            if (seen.has(name)) return
            seen.add(name)
        }
        const call = window.electronAPI && window.electronAPI.invoke
        if (call) call('visitor:track', name, props || {}).catch(() => {})
    } catch { /* never throw from statistics */ }
}

module.exports = { track }
