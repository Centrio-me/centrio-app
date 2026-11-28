// Sidebar fold animation: the panel itself grows or shrinks (min/max width run together, so it works against the fixed width of the
// wide state), and every icon glides from its old place to its new one at the same time, so nothing is drawn behind the panel.
// In both states the icons keep the same left edge (see styles-sidebar-v2.css), so the panel's own width never moves them sideways.
const FLIP_SELECTOR = [
    '#activityBar .activity-btn',
    '#activityBar .messenger-item',
    '#activityBar .folder-item',
    '#activityBar .workspace-rail-chip',
    '#activityBar .sidebar-divider'
].join(',')
const DURATION_MS = 340
const STAGGER_MS = 8
const MAX_DELAY_MS = 70
const EASING = 'cubic-bezier(0.25, 1, 0.4, 1)'

function visibleRects(root) {
    const rects = new Map()
    root.querySelectorAll(FLIP_SELECTOR).forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) rects.set(el, r)
    })
    return rects
}

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Runs `change` (which flips the panel's layout) and animates the panel and every icon that exists both before and after.
 * @param {HTMLElement} bar the #activityBar element
 * @param {() => void} change applies the new layout synchronously
 * @param {() => void} [onFrame] called on every frame of the animation (things that follow the panel's edge)
 */
function animateSidebarLayout(bar, change, onFrame) {
    if (prefersReducedMotion()) { change(); if (onFrame) onFrame(); return }
    const first = visibleRects(bar)
    const from = bar.getBoundingClientRect().width
    bar.classList.add('sb-flip')
    change()
    const last = visibleRects(bar)
    const to = bar.getBoundingClientRect().width
    const panel = bar.animate(
        [{ width: `${from}px`, minWidth: `${from}px`, maxWidth: `${from}px` }, { width: `${to}px`, minWidth: `${to}px`, maxWidth: `${to}px` }],
        { duration: DURATION_MS, easing: EASING }
    )
    let index = 0
    last.forEach((now, el) => {
        const before = first.get(el)
        if (!before) return
        const dx = before.left - now.left
        const dy = before.top - now.top
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
        el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
            { duration: DURATION_MS, delay: Math.min(index * STAGGER_MS, MAX_DELAY_MS), easing: EASING, fill: 'backwards' }
        )
        index += 1
    })
    if (onFrame) {
        const tick = () => {
            onFrame()
            if (panel.playState === 'running') requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
    }
    const done = () => { bar.classList.remove('sb-flip'); if (onFrame) onFrame() }
    panel.addEventListener('finish', done)
    panel.addEventListener('cancel', done)
}

module.exports = { animateSidebarLayout }
