'use strict'
// 3.7.4: in Аврора / Время суток the open right panel is a card; a little pointer on its right edge shows which button
// it came out of (styles-themes-fx.css draws it from --rp-pointer-y on the button column). Only class changes and
// resizes move it, nothing runs in a loop.
const { pointerY } = require('./right-panel-pointer-logic')

function update() {
    const bar = document.getElementById('rightActivityBar')
    if (!bar) return
    const btn = bar.querySelector('.activity-btn.active')
    const y = pointerY(btn ? btn.getBoundingClientRect() : null, bar.getBoundingClientRect())
    if (y === null) bar.style.removeProperty('--rp-pointer-y')
    else bar.style.setProperty('--rp-pointer-y', `${y}px`)
    bar.classList.toggle('rp-pointer', y !== null)
}

function start() {
    const bar = document.getElementById('rightActivityBar')
    const panel = document.getElementById('rightPanel')
    if (!bar || !panel) return
    const observer = new MutationObserver(update)
    observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] })
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', update)
    bar.querySelector('.activity-top')?.addEventListener('scroll', update, { passive: true })
    update()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()

module.exports = { update }
