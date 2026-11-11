'use strict'
// «Все мессенджеры»: while the conversation scrolls, the day of the messages at the top floats under the header,
// like in Telegram, and fades away a moment after the scrolling stops.

const HIDE_AFTER_MS = 1300
const TOP_GAP_PX = 10
const USER_MS = 1500

/** @param {{ root: HTMLElement, scroll: HTMLElement, list: HTMLElement }} deps */
function createFloatingDay({ root, scroll, list }) {
    const pill = document.createElement('div')
    pill.className = 'aic-float-day'
    pill.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    pill.append(label)
    root.append(pill)
    let timer = null
    // only the person's own scrolling shows it: not the jump to the newest message when a chat opens
    let userAt = 0
    for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) scroll.addEventListener(type, () => { userAt = Date.now() }, { passive: true })

    function current() {
        const top = scroll.scrollTop + TOP_GAP_PX
        let found = ''
        for (const day of list.querySelectorAll('.aic-day')) {
            if (day.offsetTop <= top) found = day.textContent
            else break
        }
        return found
    }

    function onScroll() {
        if (Date.now() - userAt > USER_MS) return
        const text = current()
        // at the very top the real divider is on screen: no second copy over it
        if (!text || scroll.scrollTop < TOP_GAP_PX) { pill.classList.remove('is-on'); return }
        label.textContent = text
        pill.classList.add('is-on')
        clearTimeout(timer)
        timer = setTimeout(() => pill.classList.remove('is-on'), HIDE_AFTER_MS)
    }

    scroll.addEventListener('scroll', onScroll, { passive: true })
    return { reset() { clearTimeout(timer); pill.classList.remove('is-on') } }
}

module.exports = { createFloatingDay }
