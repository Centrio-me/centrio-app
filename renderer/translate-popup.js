'use strict'
// The card with a translation of the selected text: «Перевести» in the right-click menu (renderer/page-menu.js) asks for it with the
// event 'centrio-translate'. It sits under the title bar, shows the translation, and can copy it. Tool: Settings → Расширения.
function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

const SHOW_DELAY_MS = 20
const COPIED_MS = 1400

// The card sits in the middle of the open conversation (not of the whole window, where the panels take a side)
function centreOverConversation(card) {
    const view = document.querySelector('webview.active')
    if (!view) return
    const box = view.getBoundingClientRect()
    if (!box.width) return
    card.style.left = Math.round(box.left + box.width / 2) + 'px'
    card.style.top = Math.round(box.top + Math.min(box.height * 0.18, 140)) + 'px'
}

/**
 * @param {{ invokeIpc: (channel: string, ...args: any[]) => Promise<any>, tGet: (key: string) => string, getLang: () => string }} deps
 */
function createTranslatePopup({ invokeIpc, tGet, getLang }) {
    let card = null
    let token = 0

    function languageName(code) {
        try {
            const name = new Intl.DisplayNames([getLang() || 'ru'], { type: 'language' }).of(code)
            return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
        } catch {
            return code
        }
    }

    function close() {
        token += 1
        if (card) card.remove()
        card = null
    }

    // options.insert: (text) => void, puts the translation into the field the text was selected in
    async function open(text, options = {}) {
        const source = String(text || '').trim()
        if (!source) return
        close()
        const mine = token
        card = el('section', 'tr-card')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-label', tGet('vext.translate.title'))
        const head = el('div', 'tr-head')
        const title = el('span', 'tr-title', tGet('vext.translate.title'))
        const pair = el('span', 'tr-pair', '')
        const closeBtn = el('button', 'tr-x', '×')
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', tGet('vext.answers.close'))
        closeBtn.addEventListener('click', close)
        head.append(title, pair, closeBtn)
        const original = el('div', 'tr-original', source.length > 280 ? `${source.slice(0, 280)}…` : source)
        const result = el('div', 'tr-result is-loading', tGet('vext.translate.loading'))
        const actions = el('div', 'tr-actions')
        const copy = el('button', 'tr-btn', tGet('vext.answers.copyText'))
        copy.type = 'button'
        copy.disabled = true
        actions.append(copy)
        const insert = el('button', 'tr-btn tr-primary', tGet('vext.translate.insert'))
        insert.type = 'button'
        insert.disabled = true
        if (typeof options.insert === 'function') actions.append(insert)
        card.append(head, original, result, actions)
        document.body.append(card)
        centreOverConversation(card)
        requestAnimationFrame(() => setTimeout(() => card && card.classList.add('show'), SHOW_DELAY_MS))

        let translated = ''
        let runs = 0
        copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(translated) } catch { return }
            copy.textContent = tGet('vext.answers.copied')
            setTimeout(() => { copy.textContent = tGet('vext.answers.copyText') }, COPIED_MS)
        })

        // the language to translate into can be changed right here; the choice lives for this card only
        const from = el('span', 'tr-from', '')
        const select = el('select', 'tr-lang')
        select.setAttribute('aria-label', tGet('vext.translate.target'))
        pair.append(from, el('span', 'tr-arrow', '→'), select)
        let languages
        let target
        try { languages = await invokeIpc('exttools:languages') } catch { languages = [] }
        try { target = (await invokeIpc('exttools:get', 'translate')).target } catch { target = '' }
        if (mine !== token || !card) return
        for (const code of languages) {
            const option = el('option', '', languageName(code))
            option.value = code
            select.append(option)
        }
        if (target) select.value = target

        const run = async () => {
            const stamp = ++runs
            result.className = 'tr-result is-loading'
            result.textContent = tGet('vext.translate.loading')
            copy.disabled = true
            insert.disabled = true
            const answer = await Promise.resolve(invokeIpc('translate:run', source, select.value || undefined)).catch(() => null)
            if (mine !== token || !card || stamp !== runs) return
            result.classList.remove('is-loading')
            if (answer && answer.ok) {
                translated = answer.text
                result.textContent = translated
                copy.disabled = false
                insert.disabled = false
                from.textContent = answer.from ? languageName(answer.from) : ''
            } else {
                result.classList.add('is-error')
                result.textContent = tGet('vext.translate.failed')
            }
        }
        insert.addEventListener('click', () => { try { options.insert(translated) } catch { /* the field went away */ } close() })
        select.addEventListener('change', run)
        await run()
    }

    document.addEventListener('centrio-translate', (e) => { const d = (e && e.detail) || {}; open(d.text, { insert: d.insert }) })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) close() }, true)
    document.addEventListener('mousedown', (e) => { if (card && !card.contains(e.target)) close() }, true)
    return { open, close }
}

module.exports = { createTranslatePopup }
