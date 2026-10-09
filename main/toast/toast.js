// The page of a notification pop-up (see main/toast/toastManager.js). All data comes from the app itself.
const api = window.toastApi
const $ = (id) => document.getElementById(id)
const card = $('card')
let strings = {}
let sending = false

function report() {
    api.resize(Math.ceil(card.getBoundingClientRect().height) + 18)
}

function setStatus(kind, text, withOpen) {
    const el = $('status')
    el.className = 'status ' + kind
    el.textContent = text
    if (withOpen) {
        el.append(' ')
        const link = document.createElement('a')
        link.textContent = strings.openChat
        link.addEventListener('click', (event) => { event.stopPropagation(); api.click() })
        el.appendChild(link)
    }
    el.hidden = false
    report()
}

api.onInit((data) => {
    strings = data.strings || {}
    $('title').textContent = data.title || ''
    $('app').textContent = data.app || ''
    $('body').textContent = data.body || ''
    if (data.icon) $('avatar').src = data.icon
    else $('avatar').style.visibility = 'hidden'
    $('close').setAttribute('aria-label', strings.close || '')
    if (data.canReply) {
        $('reply').hidden = false
        $('replyInput').placeholder = strings.replyPlaceholder || ''
        $('replySend').setAttribute('aria-label', strings.send || '')
        $('replySend').title = strings.send || ''
    }
    report()
})

api.onReplyResult((result) => {
    sending = false
    $('replySend').disabled = false
    $('replyInput').disabled = false
    if (result === 'ok') {
        $('reply').hidden = true
        setStatus('ok', strings.sent || '')
        api.done()
    } else {
        setStatus('bad', result === 'no-input' ? (strings.noInput || strings.failed || '') : (strings.failed || ''), true)
        api.extend() // keep the failure readable for a while
        $('replyInput').focus()
    }
})

card.addEventListener('click', (event) => {
    if (event.target.closest('.reply, .close, .status a')) return
    api.click()
})
$('close').addEventListener('click', (event) => { event.stopPropagation(); api.close() })
card.addEventListener('mouseenter', () => api.hover(true))
card.addEventListener('mouseleave', () => api.hover(document.activeElement === $('replyInput') && $('replyInput').value.length > 0))

$('reply').addEventListener('submit', (event) => {
    event.preventDefault()
    const text = $('replyInput').value.trim()
    if (!text || sending) return
    sending = true
    $('replySend').disabled = true
    $('replyInput').disabled = true
    $('status').hidden = true
    api.hover(true) // stay on screen while the answer is being sent
    api.reply(text)
})
$('replyInput').addEventListener('input', () => api.hover(true))
$('replyInput').addEventListener('keydown', (event) => { if (event.key === 'Escape') api.close() })
window.addEventListener('resize', report)
