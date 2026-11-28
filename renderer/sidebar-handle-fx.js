'use strict'
// In the themes with a moving backdrop («Аврора», «Время суток») the left panel is see-through, so the fold handle that grows out of
// its edge must show the very same backdrop, not a flat colour. The handle carries a small copy of the backdrop layer, placed so that
// every pixel of it lines up with the real one, and its animations are set to the same moment: it reads as a part of the panel.
const FX_LAYER_ID = 'themeFxLayer'
const CLONE_CLASS = 'theme-fx-clone'

/**
 * @param {HTMLElement | null} handle the fold handle (#sidebarCollapseBtn)
 * @returns {{ sync: () => void }}
 */
function bindHandleFx(handle) {
    if (!handle) return { sync: () => {} }
    let clone = null

    function dropClone() {
        if (clone) clone.remove()
        clone = null
    }

    function align() {
        if (!clone) return
        const rect = handle.getBoundingClientRect()
        clone.style.left = `${-rect.left}px`
        clone.style.top = `${-rect.top}px`
        clone.style.width = `${window.innerWidth}px`
        clone.style.height = `${window.innerHeight}px`
    }

    // the copy has to be at the same point of every slow animation as the original
    function copyAnimationTime(source) {
        const from = [...source.children]
        const to = [...clone.children]
        from.forEach((node, i) => {
            const mine = to[i] ? to[i].getAnimations() : []
            node.getAnimations().forEach((animation, k) => {
                if (mine[k] && animation.currentTime != null) mine[k].currentTime = animation.currentTime
            })
        })
    }

    function build() {
        dropClone()
        if (!document.documentElement.hasAttribute('data-fx')) return
        const source = document.getElementById(FX_LAYER_ID)
        if (!source) { requestAnimationFrame(build); return }
        clone = source.cloneNode(true)
        clone.removeAttribute('id')
        clone.classList.add(CLONE_CLASS)
        handle.prepend(clone)
        align()
        requestAnimationFrame(() => { if (clone) copyAnimationTime(source) })
    }

    // The handle shows while the pointer is on the panel and lingers a moment after it leaves, so a slow move onto the part that
    // reaches over the page (where the page may take the pointer first) does not lose it.
    const LINGER_MS = 2200
    const bar = handle.parentElement
    let lingerTimer = 0
    const show = () => { clearTimeout(lingerTimer); handle.classList.add('edge-on') }
    const hideLater = () => {
        clearTimeout(lingerTimer)
        lingerTimer = setTimeout(() => { if (!handle.matches(':hover') && !handle.matches(':focus-visible')) handle.classList.remove('edge-on') }, LINGER_MS)
    }
    for (const node of [bar, handle]) {
        if (!node) continue
        node.addEventListener('mouseenter', show)
        node.addEventListener('mouseleave', hideLater)
    }

    new MutationObserver(build).observe(document.documentElement, { attributes: true, attributeFilter: ['data-fx'] })
    window.addEventListener('resize', align)
    build()
    return { sync: align }
}

module.exports = { bindHandleFx }
