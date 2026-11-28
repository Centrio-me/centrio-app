'use strict'
// «Проверка правописания» as a tool of Settings → Расширения: the switch lives on its card, and its «Настройки» panel holds the
// languages and the person's own dictionary. The checking itself is in main/services/spellcheck.js.

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

function languageName(code, uiLanguage) {
    try {
        const name = new Intl.DisplayNames([uiLanguage || 'ru'], { type: 'language' }).of(code)
        return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
    } catch {
        return code
    }
}

/**
 * @param {{ invokeIpc: (channel: string, ...args: any[]) => Promise<any>, tGet: (key: string) => string,
 *   getLang: () => string }} deps
 */
function createSpellcheckTool({ invokeIpc, tGet, getLang }) {
    let state = null

    async function load() {
        try { state = await invokeIpc('spellcheck:get') } catch { state = null }
        return state
    }

    async function isOn() {
        const s = await load()
        return !s || s.enabled !== false
    }

    async function setOn(enabled) {
        try { state = await invokeIpc('spellcheck:set', { enabled }) } catch { /* keep */ }
    }

    function languagesBlock(redraw) {
        const block = el('div', 'sp-block')
        block.append(el('div', 'sp-title', tGet('vspell.languages')), el('div', 'sp-hint', tGet('vspell.languagesHint')))
        const chips = el('div', 'sp-chips')
        for (const code of state.offered) {
            const on = state.languages.includes(code)
            const chip = el('button', 'sp-chip' + (on ? ' on' : ''), languageName(code, getLang()))
            chip.type = 'button'
            chip.setAttribute('aria-pressed', String(on))
            chip.addEventListener('click', async () => {
                const next = on ? state.languages.filter((l) => l !== code) : [...state.languages, code]
                if (!next.length) return
                try { state = await invokeIpc('spellcheck:set', { languages: next }) } catch { /* keep */ }
                redraw()
            })
            chips.append(chip)
        }
        block.append(chips)
        return block
    }

    function dictionaryBlock(redraw) {
        const block = el('div', 'sp-block')
        block.append(el('div', 'sp-title', tGet('vspell.dictionary')), el('div', 'sp-hint', tGet('vspell.dictionaryHint')))
        const words = el('div', 'sp-words')
        if (!state.words.length) words.append(el('span', 'sp-empty', tGet('vspell.empty')))
        for (const word of state.words) {
            const item = el('span', 'sp-word', word)
            const remove = el('button', 'sp-word-x', '×')
            remove.type = 'button'
            remove.title = tGet('vspell.remove')
            remove.setAttribute('aria-label', `${tGet('vspell.remove')}: ${word}`)
            remove.addEventListener('click', async () => {
                try { state = await invokeIpc('spellcheck:remove-word', word) } catch { /* keep */ }
                redraw()
            })
            item.append(remove)
            words.append(item)
        }
        const form = el('form', 'sp-add')
        const input = el('input', 'sp-input')
        input.type = 'text'
        input.maxLength = 60
        input.placeholder = tGet('vspell.addWord')
        input.setAttribute('aria-label', tGet('vspell.addWord'))
        form.append(input)
        form.addEventListener('submit', async (e) => {
            e.preventDefault()
            const word = input.value.trim()
            if (!word) return
            try { state = await invokeIpc('spellcheck:add-word', word) } catch { /* keep */ }
            redraw()
        })
        block.append(words, form)
        return block
    }

    /** Draws the settings panel of the card into `box` */
    async function renderSettings(box) {
        const draw = () => {
            box.textContent = ''
            if (state) box.append(languagesBlock(draw), dictionaryBlock(draw))
        }
        await load()
        draw()
    }

    return { isOn, setOn, renderSettings }
}

module.exports = { createSpellcheckTool, el }
