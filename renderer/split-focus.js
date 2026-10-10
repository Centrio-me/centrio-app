// Focus mode in split screen (settings → Appearance). While a split screen is on, the chosen parts of the window
// (left tab bar, right tool bar, bottom bar, top bar) are hidden so the panes get more room; leaving the split
// brings everything back. The top bar is not gone for good: moving the mouse to the very top edge slides it in.
//
// The split code sets `state.splitMode` in many places, so the property is observed instead of patching each one;
// changes are coalesced so a "turn off, turn on again" inside one tick (used while a layout is rebuilt) does not flicker.
'use strict'

const TOP_EDGE_PX = 6

function bindSplitFocus({ state, getSettings }) {
    const body = document.body
    let applied = ''
    let queued = false

    function wanted() {
        const settings = getSettings() || {}
        const on = !!state.splitMode && settings.splitFocus === true
        return {
            on,
            sidebar: on && settings.splitFocusSidebar !== false,
            right: on && settings.splitFocusRight !== false,
            status: on && settings.splitFocusStatusbar !== false,
            top: on && settings.splitFocusTitlebar === true
        }
    }

    function apply() {
        const next = wanted()
        const key = JSON.stringify(next)
        if (key === applied) return
        applied = key
        body.classList.toggle('split-focus', next.on)
        body.classList.toggle('sf-hide-sidebar', next.sidebar)
        body.classList.toggle('sf-hide-right', next.right)
        body.classList.toggle('sf-hide-status', next.status)
        body.classList.toggle('sf-hide-top', next.top)
        if (!next.top) body.classList.remove('sf-top-reveal')
        // The panes are laid out from the size of the content area: let them follow the new size.
        window.dispatchEvent(new Event('resize'))
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }

    function schedule() {
        if (queued) return
        queued = true
        queueMicrotask(() => { queued = false; apply() })
    }

    let splitMode = state.splitMode
    Object.defineProperty(state, 'splitMode', {
        configurable: true,
        enumerable: true,
        get: () => splitMode,
        set: (value) => { splitMode = value; schedule() }
    })

    document.addEventListener('centrio-settings-applied', schedule)

    // Slide the top bar in at the top edge, and out again when the mouse leaves it.
    const zone = document.createElement('div')
    zone.id = 'sfTopZone'
    zone.style.height = `${TOP_EDGE_PX}px`
    document.body.appendChild(zone)
    zone.addEventListener('mouseenter', () => { if (body.classList.contains('sf-hide-top')) body.classList.add('sf-top-reveal') })
    const titlebar = document.querySelector('.titlebar')
    if (titlebar) titlebar.addEventListener('mouseleave', () => body.classList.remove('sf-top-reveal'))

    schedule()
    return { refresh: schedule }
}

module.exports = { bindSplitFocus }
