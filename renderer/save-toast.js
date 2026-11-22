// A short plain message at the bottom of the window: what was saved and where, or why a picture/file did not save.
// One at a time; a new one replaces the old. Errors stay longer and say what to do instead.
'use strict'

const OK_MS = 6000
const ERROR_MS = 12000
let timer = null

function host() {
    let el = document.getElementById('saveToast')
    if (!el) {
        el = document.createElement('div')
        el.id = 'saveToast'
        el.className = 'save-toast'
        el.setAttribute('role', 'status')
        el.setAttribute('aria-live', 'polite')
        document.body.appendChild(el)
    }
    return el
}

function hideSaveToast() {
    if (timer) { clearTimeout(timer); timer = null }
    const el = document.getElementById('saveToast')
    if (el) el.classList.remove('show')
}

/** A «Скачивается…» line that stays while the file comes down and is changed in place (no blinking) as it goes. fraction: 0..1 or null. */
function showProgressToast(text, fraction) {
    if (!text) return
    const el = host()
    if (timer) { clearTimeout(timer); timer = null }
    const live = el.classList.contains('is-progress') && el.classList.contains('show')
    if (!live) {
        el.textContent = ''
        el.className = 'save-toast is-progress'
        const message = document.createElement('span')
        message.className = 'save-toast-text'
        el.appendChild(message)
        const bar = document.createElement('span')
        bar.className = 'save-toast-bar'
        bar.appendChild(document.createElement('span'))
        el.appendChild(bar)
        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'save-toast-close'
        close.setAttribute('aria-label', '×')
        close.textContent = '×'
        close.addEventListener('click', hideSaveToast)
        el.appendChild(close)
        requestAnimationFrame(() => el.classList.add('show'))
    }
    el.querySelector('.save-toast-text').textContent = text
    const bar = el.querySelector('.save-toast-bar')
    const fill = bar.firstChild
    bar.classList.toggle('is-indeterminate', fraction == null)
    fill.style.width = fraction == null ? '' : `${Math.round(fraction * 100)}%`
}

/** options: { kind: 'ok' | 'error', text, actionLabel?, onAction? } */
function showSaveToast({ kind = 'ok', text, actionLabel, onAction }) {
    if (!text) return
    const el = host()
    el.textContent = ''
    el.className = `save-toast is-${kind === 'error' ? 'error' : 'ok'}`
    const message = document.createElement('span')
    message.className = 'save-toast-text'
    message.textContent = text
    el.appendChild(message)
    if (actionLabel && typeof onAction === 'function') {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'save-toast-action'
        button.textContent = actionLabel
        button.addEventListener('click', () => { hideSaveToast(); onAction() })
        el.appendChild(button)
    }
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'save-toast-close'
    close.setAttribute('aria-label', '×')
    close.textContent = '×'
    close.addEventListener('click', hideSaveToast)
    el.appendChild(close)
    requestAnimationFrame(() => el.classList.add('show'))
    if (timer) clearTimeout(timer)
    timer = setTimeout(hideSaveToast, kind === 'error' ? ERROR_MS : OK_MS)
}

module.exports = { showSaveToast, showProgressToast, hideSaveToast }
