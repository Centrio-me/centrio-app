'use strict'
// «Исправить ошибки» of the right-click menu of a text field: the text of the field is checked by Centrio's own dictionaries
// (main/services/spellfix.js), every mistake is shown with the nearest words, and the text goes back into the field corrected.
function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

const SHOW_DELAY_MS = 20

/**
 * @param {{ invokeIpc: (channel: string, ...args: any[]) => Promise<any>, tGet: (key: string, params?: object) => string }} deps
 */
function createSpellfixPopup({ invokeIpc, tGet }) {
    let card = null
    let token = 0

    function close() {
        token += 1
        if (card) card.remove()
        card = null
    }

    function mount(title) {
        close()
        card = el('section', 'tr-card sf-card')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-label', title)
        const head = el('div', 'tr-head')
        const closeBtn = el('button', 'tr-x', '×')
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', tGet('vext.answers.close'))
        closeBtn.addEventListener('click', close)
        const heading = el('span', 'tr-title', title)
        head.append(heading, closeBtn)
        const body = el('div', 'sf-body')
        card.append(head, body)
        document.body.append(card)
        requestAnimationFrame(() => setTimeout(() => card && card.classList.add('show'), SHOW_DELAY_MS))
        return { head, body, heading }
    }

    function applyChoices(text, mistakes, choices) {
        let out = text
        for (let i = mistakes.length - 1; i >= 0; i--) {
            const pick = choices[i]
            if (pick == null) continue
            out = out.slice(0, mistakes[i].start) + pick + out.slice(mistakes[i].end)
        }
        return out
    }

    async function open({ wcId }) {
        const { head, body, heading } = mount(tGet('vext.fix.title'))
        const mine = token
        body.append(el('div', 'tr-result is-loading', tGet('vext.fix.checking')))
        const text = await Promise.resolve(invokeIpc('pagemenu:field-text', wcId)).catch(() => '')
        if (mine !== token || !card) return
        if (!text || !text.trim()) { body.textContent = ''; body.append(el('div', 'tr-result', tGet('vext.fix.empty'))); return }
        const checked = await Promise.resolve(invokeIpc('spellfix:check', text)).catch(() => null)
        if (mine !== token || !card) return
        body.textContent = ''
        if (!checked || !checked.ok) { body.append(el('div', 'tr-result is-error', tGet('vext.fix.failed'))); return }
        const mistakes = checked.mistakes
        if (!mistakes.length) { body.append(el('div', 'tr-result', tGet('vext.fix.none'))); return }
        heading.textContent = `${tGet('vext.fix.title')} · ${mistakes.length}`

        // the first suggestion is chosen for every mistake; a word with none stays as it is
        const choices = mistakes.map((m) => (m.suggestions.length ? m.suggestions[0] : null))
        const list = el('div', 'sf-list')
        mistakes.forEach((m, i) => {
            const row = el('div', 'sf-row')
            row.append(el('span', 'sf-word', m.word), el('span', 'sf-arrow', '→'))
            const options = el('span', 'sf-options')
            const buttons = []
            const paint = () => buttons.forEach(({ node, value }) => node.classList.toggle('on', value === choices[i]))
            const add = (value, label) => {
                const node = el('button', 'sf-chip', label)
                node.type = 'button'
                node.addEventListener('click', () => { choices[i] = value; paint() })
                options.append(node)
                buttons.push({ node, value })
            }
            m.suggestions.forEach((s) => add(s, s))
            add(null, tGet('vext.fix.keep'))
            paint()
            row.append(options)
            list.append(row)
        })
        const actions = el('div', 'tr-actions')
        const fix = el('button', 'tr-btn sf-primary', tGet('vext.fix.apply'))
        fix.type = 'button'
        fix.addEventListener('click', async () => {
            fix.disabled = true
            const fixed = applyChoices(text, mistakes, choices)
            await Promise.resolve(invokeIpc('pagemenu:field-replace', wcId, fixed)).catch(() => false)
            close()
        })
        actions.append(fix)
        body.append(list, actions)
    }

    document.addEventListener('centrio-spellfix', (e) => { open((e && e.detail) || {}) })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) close() }, true)
    document.addEventListener('mousedown', (e) => { if (card && !card.contains(e.target)) close() }, true)
    return { open, close }
}

module.exports = { createSpellfixPopup }
