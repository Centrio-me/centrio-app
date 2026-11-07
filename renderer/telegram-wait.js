// The QR code and the "Open Telegram" button under the waiting spinner, while the person confirms in the bot.
const BLOCK_CLASS = 'tg-wait'

function showTelegramWait(textEl, { qr }, { tGet, onOpen }) {
    clearTelegramWait()
    if (!textEl) return
    const block = document.createElement('div')
    block.className = BLOCK_CLASS
    const image = document.createElement('img')
    image.src = qr
    image.width = 180
    image.height = 180
    image.alt = ''
    const hint = document.createElement('p')
    hint.textContent = tGet('oauth.tgScan')
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'lk-btn lk-btn--small'
    open.textContent = tGet('oauth.tgOpen')
    open.addEventListener('click', onOpen)
    block.append(image, hint, open)
    textEl.after(block)
    // The general hint speaks about a browser tab, here there is none.
    block.parentElement.querySelectorAll('.la-note').forEach((note) => { note.hidden = true })
}

function clearTelegramWait() {
    document.querySelectorAll(`.${BLOCK_CLASS}`).forEach((block) => {
        block.parentElement.querySelectorAll('.la-note').forEach((note) => { note.hidden = false })
        block.remove()
    })
}

module.exports = { showTelegramWait, clearTelegramWait }
