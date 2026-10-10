// Settings → Hotkeys: the rebindable shortcuts (main/services/shortcutRegistry.js). Each row shows the current
// combination; "Change" waits for the next key press, "Reset" returns the default. The fixed ones (tab numbers,
// zoom, Esc) stay in the static list below.
const LABEL_KEYS = {
    tabManager: 'shortcuts.tabManager',
    fullscreen: 'shortcuts.fullscreen',
    hideShow: 'shortcuts.hideShow',
    quickSearch: 'shortcuts.quickSearch',
    findInPage: 'shortcuts.findInPage',
    nextTab: 'shortcuts.next',
    prevTab: 'shortcuts.prev',
    reload: 'shortcuts.reload',
    settings: 'shortcuts.openSettings'
}

const { shortcutKeyName } = require('../shared/shortcutKeys')

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'])

function eventToAccel(event) {
    if (MODIFIER_KEYS.has(event.key)) return ''
    const key = shortcutKeyName(event.key, event.code)
    return [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+')
}

function bindShortcutsSettings({ invokeIpc, tGet, getPresets = () => [] }) {
    const group = document.getElementById('shortcutsCustomGroup')
    if (!group) return

    let items = []
    let recordingId = null
    let message = ''

    // Tell the main process to stop handling shortcuts while a combination is being recorded.
    let announced = false
    function syncRecording() {
        const on = recordingId !== null
        if (on === announced) return
        announced = on
        invokeIpc('shortcuts:recording', on)
    }

    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    function keysNode(accel) {
        const wrap = el('div', 'shortcut-keys')
        if (!accel) {
            wrap.appendChild(el('span', 'shortcut-key shortcut-key-off', tGet('shortcuts.disabled')))
            return wrap
        }
        accel.split('+').forEach((part, index) => {
            if (index > 0) wrap.appendChild(el('span', 'shortcut-sep', '+'))
            wrap.appendChild(el('span', 'shortcut-key', part))
        })
        return wrap
    }

    // Split-screen presets: one row per saved layout, named "Split screen N · <name>".
    const presetIndex = (id) => { const m = /^splitPreset([1-9])$/.exec(id); return m ? Number(m[1]) - 1 : -1 }
    function labelFor(item) {
        const index = presetIndex(item.id)
        if (index < 0) return tGet(LABEL_KEYS[item.id] || item.id)
        const preset = (getPresets() || [])[index]
        const base = tGet('shortcuts.splitPresetN').replace('{n}', String(index + 1))
        return preset && preset.name ? `${base} · ${preset.name}` : base
    }

    function render() {
        syncRecording()
        group.textContent = ''
        group.appendChild(el('div', 'settings-group-title', tGet('shortcuts.customTitle')))
        group.appendChild(el('div', 'settings-hint shortcut-hint', tGet('shortcuts.customHint')))
        const list = el('div', 'shortcut-list')
        const presetCount = (getPresets() || []).length
        const shown = items.filter((item) => presetIndex(item.id) < 0 || presetIndex(item.id) < presetCount)
        shown.forEach((item) => {
            const row = el('div', 'shortcut-row')
            row.appendChild(el('span', 'shortcut-label', labelFor(item)))
            const side = el('div', 'shortcut-side')
            if (recordingId === item.id) side.appendChild(el('span', 'shortcut-recording', tGet('shortcuts.pressKeys')))
            else side.appendChild(keysNode(item.accel))

            const change = el('button', 'shortcut-btn', recordingId === item.id ? tGet('shortcuts.cancel') : tGet('shortcuts.change'))
            change.type = 'button'
            change.addEventListener('click', () => { recordingId = recordingId === item.id ? null : item.id; message = ''; render() })
            side.appendChild(change)

            if (item.accel !== item.defaultAccel) {
                const reset = el('button', 'shortcut-btn', tGet('shortcuts.reset'))
                reset.type = 'button'
                reset.addEventListener('click', async () => { applyResult(await invokeIpc('shortcuts:reset', item.id)) })
                side.appendChild(reset)
            }
            row.appendChild(side)
            list.appendChild(row)
        })
        group.appendChild(list)
        if (presetCount === 0) group.appendChild(el('div', 'settings-hint shortcut-hint', tGet('shortcuts.noPresets')))
        if (message) group.appendChild(el('div', 'shortcut-message', message))
        if (items.some(item => item.accel !== item.defaultAccel)) {
            const resetAll = el('button', 'shortcut-btn shortcut-btn-all', tGet('shortcuts.resetAll'))
            resetAll.type = 'button'
            resetAll.addEventListener('click', async () => { applyResult(await invokeIpc('shortcuts:reset')) })
            group.appendChild(resetAll)
        }
    }

    function applyResult(result) {
        if (result && Array.isArray(result.items)) items = result.items
        recordingId = null
        render()
    }

    function errorText(result) {
        if (result.error === 'conflict') {
            const other = items.find((item) => item.id === result.conflictWith)
            return tGet('shortcuts.errConflict').replace('{name}', other ? labelFor(other) : tGet(LABEL_KEYS[result.conflictWith] || result.conflictWith || ''))
        }
        if (result.error === 'reserved') return tGet('shortcuts.errReserved')
        return tGet('shortcuts.errInvalid')
    }

    // Capture phase: while recording, the key must not trigger the app's own shortcuts or type anywhere.
    document.addEventListener('keydown', async (event) => {
        if (!recordingId) return
        // The settings were closed while recording: stop here, so keys are never swallowed outside the settings.
        if (group.offsetParent === null) { recordingId = null; render(); return }
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') { recordingId = null; message = ''; render(); return }
        const accel = eventToAccel(event)
        if (!accel) return
        const id = recordingId
        const result = await invokeIpc('shortcuts:set', id, accel)
        if (result && result.success) { message = ''; applyResult(result); return }
        message = errorText(result || {})
        if (result && Array.isArray(result.items)) items = result.items
        render()
    }, true)

    async function load() {
        const result = await invokeIpc('shortcuts:list')
        if (result && Array.isArray(result.items)) items = result.items
        render()
    }

    load()
    // Texts depend on the interface language: redraw when the settings section is opened.
    document.querySelectorAll('[data-section="shortcuts"]').forEach((node) => node.addEventListener('click', load))
}

module.exports = { bindShortcutsSettings }
