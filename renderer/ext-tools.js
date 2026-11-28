'use strict'
// The tools of Settings → Расширения that are not switches of extensionsState: the spell checker, the translator, the currency
// rates with the calculator (their state lives in the main process) and the tools of the right panel (tasks, notes, quick
// replies, passwords: switched on or off through the right panel layout, see rightbar-custom.js).
// Every definition: { id, titleKey, descKey, icon, color, free, isOn(), setOn(on), renderSettings?(box) }.
const { createSpellcheckTool, el } = require('./spellcheck-ui')

const svg = (paths) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
const FLAGS_EVENT = 'exttools-changed'

function languageName(code, uiLanguage) {
    try {
        const name = new Intl.DisplayNames([uiLanguage || 'ru'], { type: 'language' }).of(code)
        return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
    } catch {
        return code
    }
}

/**
 * @param {{ store: { get: Function }, tGet: (key: string, params?: object) => string, invokeIpc: Function, getLang: () => string,
 *   setPanelItem: (id: string, visible: boolean) => void, isPanelItemOn: (id: string) => boolean }} deps
 */
function createExtTools({ tGet, invokeIpc, getLang, setPanelItem, isPanelItemOn }) {
    const flags = { translate: true, currency: true, timer: true, units: true, color: true, spellcheck: true }
    window.__centrioTools = flags

    async function refreshFlags() {
        try { const spellState = await invokeIpc('spellcheck:get'); flags.spellcheck = !spellState || spellState.enabled !== false } catch { /* keep */ }
        for (const id of Object.keys(flags).filter((key) => key !== 'spellcheck')) {
            try {
                const s = await invokeIpc('exttools:get', id)
                flags[id] = !s || s.enabled !== false
            } catch { /* keep */ }
        }
        document.dispatchEvent(new CustomEvent(FLAGS_EVENT))
    }

    const spell = createSpellcheckTool({ invokeIpc, tGet, getLang })

    const toolState = (id) => ({
        isOn: async () => { try { const s = await invokeIpc('exttools:get', id); return !s || s.enabled !== false } catch { return true } },
        setOn: async (enabled) => { try { await invokeIpc('exttools:set', id, { enabled }) } catch { /* keep */ } await refreshFlags() }
    })

    const translate = {
        id: 'translate', titleKey: 'vext.translate.title', descKey: 'vext.translate.desc', free: true,
        icon: svg('<path d="M5 8h8M9 5v3M7 8c0 3 2.5 5.5 5.500 6.500M11 8c-.5 3-3 5.500-6 6.500M13 19l4-9 4 9M14.500 16h5"/>'),
        color: '#1a73e8', bg: 'rgba(26,115,232,.13)', border: 'rgba(26,115,232,.28)',
        ...toolState('translate'),
        async renderSettings(box) {
            box.textContent = ''
            let current = { target: 'ru' }
            let languages = []
            try { current = (await invokeIpc('exttools:get', 'translate')) || current; languages = await invokeIpc('exttools:languages') } catch { /* defaults */ }
            const block = el('div', 'sp-block')
            block.append(el('div', 'sp-title', tGet('vext.translate.target')), el('div', 'sp-hint', tGet('vext.translate.targetHint')))
            const chips = el('div', 'sp-chips')
            for (const code of languages) {
                const chip = el('button', 'sp-chip' + (code === current.target ? ' on' : ''), languageName(code, getLang()))
                chip.type = 'button'
                chip.setAttribute('aria-pressed', String(code === current.target))
                chip.addEventListener('click', async () => {
                    try { await invokeIpc('exttools:set', 'translate', { target: code }) } catch { /* keep */ }
                    translate.renderSettings(box)
                })
                chips.append(chip)
            }
            block.append(chips)
            box.append(block)
        }
    }

    const currency = {
        id: 'currency', titleKey: 'vext.currency.title', descKey: 'vext.currency.desc', free: true,
        icon: svg('<circle cx="12" cy="12" r="9"/><path d="M14.500 9.500c-.5-1-1.500-1.500-2.500-1.500-1.500 0-2.500.800-2.500 2s1 1.800 2.500 2 2.500.800 2.500 2-1 2-2.500 2c-1 0-2-.500-2.500-1.500M12 6.500V8M12 16v1.500"/>'),
        color: '#22a06b', bg: 'rgba(34,160,107,.13)', border: 'rgba(34,160,107,.28)',
        ...toolState('currency'),
        async renderSettings(box) {
            box.textContent = ''
            const block = el('div', 'sp-block')
            block.append(el('div', 'sp-title', tGet('vext.currency.how')))
            for (const line of ['vext.currency.ex1', 'vext.currency.ex2', 'vext.currency.ex3']) block.append(el('div', 'sp-example', tGet(line)))
            let info = null
            try { info = await invokeIpc('rates:get') } catch { /* offline */ }
            block.append(el('div', 'sp-hint', info && info.date ? tGet('vext.currency.source', { d: info.date }) : tGet('vext.currency.offline')))
            box.append(block)
        }
    }

    const simple = (id, icon, color, bg, border, examples) => ({
        id, titleKey: `vext.${id}.title`, descKey: `vext.${id}.desc`, free: true, icon, color, bg, border,
        ...toolState(id),
        async renderSettings(box) {
            box.textContent = ''
            const block = el('div', 'sp-block')
            block.append(el('div', 'sp-title', tGet('vext.answers.what')))
            for (const line of examples) block.append(el('div', 'sp-example', tGet(line)))
            box.append(block)
        }
    })

    const timer = simple('timer', svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.500 2M9 2.500h6M12 2.500V5"/>'), '#f97316', 'rgba(249,115,22,.13)', 'rgba(249,115,22,.28)', ['vext.timer.ex1', 'vext.timer.ex2', 'vext.timer.ex3'])
    const units = simple('units', svg('<path d="M3 17l4-4 4 4 4-8 6 8M3 21h18"/>'), '#14b8a6', 'rgba(20,184,166,.13)', 'rgba(20,184,166,.28)', ['vext.units.ex1', 'vext.units.ex2', 'vext.units.ex3'])
    const color = simple('color', svg('<path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 1.500-2s-.500-2 1-2H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.500" r="1"/><circle cx="16" cy="11" r="1"/>'), '#a855f7', 'rgba(168,85,247,.13)', 'rgba(168,85,247,.28)', ['vext.color.ex1', 'vext.color.ex2', 'vext.color.ex3'])

    const spellcheck = {
        id: 'spellcheck', titleKey: 'vext.spell.title', descKey: 'vext.spell.desc', free: true,
        icon: svg('<path d="M4 17l4-10 4 10M5.500 14h5M14 17l2.500 2.500L21 13"/>'),
        color: '#8b5cf6', bg: 'rgba(139,92,246,.13)', border: 'rgba(139,92,246,.28)',
        isOn: spell.isOn, setOn: async (on) => { await spell.setOn(on); await refreshFlags() }, renderSettings: spell.renderSettings
    }

    const panelItem = (id, icon, color, bg, border, free) => ({
        id: `panel:${id}`, titleKey: `vext.panel.${id}.title`, descKey: `vext.panel.${id}.desc`, free, icon, color, bg, border,
        isOn: async () => isPanelItemOn(id),
        setOn: async (on) => { setPanelItem(id, on) }
    })

    const panel = [
        panelItem('todos', svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'), '#22c55e', 'rgba(34,197,94,.13)', 'rgba(34,197,94,.28)', false),
        panelItem('notes', svg('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h4"/>'), '#f59e0b', 'rgba(245,158,11,.13)', 'rgba(245,158,11,.28)', false),
        panelItem('quickReplies', svg('<path d="M4 5h16v10H9l-5 4z"/><path d="M13 8l-2 3h3l-2 3"/>'), '#ec4899', 'rgba(236,72,153,.13)', 'rgba(236,72,153,.28)', false),
        panelItem('passwords', svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), '#0ea5e9', 'rgba(14,165,233,.13)', 'rgba(14,165,233,.28)', true)
    ]

    // AdBlock keeps its switch in extensionsState; the public filter lists and what they do are settings of its card
    function toggleRow(labelKey, hintKey, checked, onChange) {
        const row = el('label', 'sp-switch')
        const text = el('span', 'sp-switch-text')
        text.append(el('span', 'sp-title', tGet(labelKey)), el('span', 'sp-hint', tGet(hintKey)))
        const toggle = el('span', 'toggle')
        const input = el('input')
        input.type = 'checkbox'
        input.checked = checked
        input.addEventListener('change', () => onChange(input.checked))
        toggle.append(input, el('span', 'toggle-slider'))
        row.append(text, toggle)
        return row
    }

    async function adblockSettings(box) {
        const draw = (status) => {
            box.textContent = ''
            if (!status) { box.append(el('div', 'sp-hint', tGet('vext.adblock.unavailable'))); return }
            const set = async (options) => { try { draw(await invokeIpc('adblock:set', options)) } catch { /* keep */ } }
            box.append(
                toggleRow('vext.adblock.lists', 'vext.adblock.listsHint', status.enabled, (enabled) => set({ enabled })),
                toggleRow('vext.adblock.cosmetic', 'vext.adblock.cosmeticHint', status.cosmetic, (cosmetic) => set({ cosmetic }))
            )
            const info = el('div', 'sp-block')
            const when = status.updatedAt ? new Date(status.updatedAt).toLocaleDateString(getLang() || 'ru', { day: 'numeric', month: 'long' }) : tGet('vext.adblock.never')
            info.append(el('div', 'sp-hint', tGet('vext.adblock.stats', { d: status.domains, s: status.sites, when })))
            info.append(el('div', 'sp-hint', tGet('vext.adblock.blocked', { n: status.blocked })))
            const update = el('button', 'tr-btn', status.updating ? tGet('vext.adblock.updating') : tGet('vext.adblock.update'))
            update.type = 'button'
            update.disabled = status.updating
            update.addEventListener('click', async () => {
                update.disabled = true
                update.textContent = tGet('vext.adblock.updating')
                try { draw(await invokeIpc('adblock:update')) } catch { draw(status) }
            })
            info.append(update)
            box.append(info)
        }
        let status = null
        try { status = await invokeIpc('adblock:status') } catch { /* none */ }
        draw(status)
    }

    refreshFlags()
    return { tools: [spellcheck, translate, currency, timer, units, color], panel, refreshFlags, adblockSettings }
}

module.exports = { createExtTools }
