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

module.exports = { showSaveToast, hideSaveToast }
