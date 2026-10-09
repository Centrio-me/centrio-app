// Rebindable keyboard shortcuts. One registry in the main process, so a key works wherever the focus is:
// on the app UI or inside a messenger's <webview> (the webview preload that used to forward keys does not run).
// Overrides are stored as { actionId: 'Ctrl+Shift+K' } ('' disables an action).
const store = require('./store')
const { shortcutKeyName } = require('../../shared/shortcutKeys')

const STORE_KEY = 'shortcuts'

// `global` actions are registered with globalShortcut (they work with the window hidden); the rest are matched in
// before-input-event of the main window and of every messenger webview.
const DEFINITIONS = [
    { id: 'tabManager', accel: 'Ctrl+J' },
    { id: 'fullscreen', accel: 'F11' },
    { id: 'hideShow', accel: 'Ctrl+M', global: true },
    { id: 'quickSearch', accel: 'Ctrl+P' },
    { id: 'findInPage', accel: 'Ctrl+F' },
    { id: 'nextTab', accel: 'Ctrl+Tab' },
    { id: 'prevTab', accel: 'Ctrl+Shift+Tab' },
    { id: 'reload', accel: 'Ctrl+R' },
    { id: 'settings', accel: 'Ctrl+,' }
]

// Combinations that are fixed elsewhere (tab numbers, zoom) or that would break text editing.
const RESERVED = [
    /^Ctrl\+(Shift\+)?[1-9]$/, /^Ctrl\+0$/, /^Ctrl\+Shift\+[+\-=]$/, /^Ctrl\+[+\-=]$/,
    /^Ctrl\+[CVXAZYK]$/, /^Alt\+F4$/, /^Ctrl\+Shift\+[ZV]$/
]

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'])

function overrides() {
    const saved = store.get(STORE_KEY, {})
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}

function list() {
    const saved = overrides()
    return DEFINITIONS.map(def => ({
        id: def.id,
        defaultAccel: def.accel,
        accel: Object.prototype.hasOwnProperty.call(saved, def.id) ? String(saved[def.id]) : def.accel,
        global: !!def.global
    }))
}

// 'ctrl + shift + k' -> 'Ctrl+Shift+K'; returns '' for something that is not a valid combination.
function normalize(accel) {
    if (typeof accel !== 'string') return ''
    const parts = accel.split('+').map(p => p.trim()).filter(Boolean)
    if (accel.trim().endsWith('+') && !accel.trim().endsWith('++')) parts.push('+')
    const mods = new Set()
    let key = ''
    for (const raw of parts) {
        const low = raw.toLowerCase()
        if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'cmdorctrl' || low === 'commandorcontrol') mods.add('Ctrl')
        else if (low === 'alt' || low === 'option') mods.add('Alt')
        else if (low === 'shift') mods.add('Shift')
        else if (key) return ''
        else key = raw.length === 1 ? raw.toUpperCase() : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    }
    if (!key) return ''
    if (!/^([A-Z0-9,.;'[\]\\/`=+-]|F([1-9]|1\d|2[0-4])|Tab|Space|Esc|Up|Down|Left|Right|Delete|Backspace|Enter)$/.test(key)) return ''
    const isFunctionKey = /^F\d+$/.test(key)
    if (!mods.size && !isFunctionKey) return ''
    return ['Ctrl', 'Alt', 'Shift'].filter(m => mods.has(m)).concat(key).join('+')
}

function inputToAccel(input) {
    if (!input || MODIFIER_KEYS.has(input.key)) return ''
    const key = shortcutKeyName(input.key, input.code)
    const ctrl = input.control || (process.platform === 'darwin' && input.meta)
    return normalize([ctrl ? 'Ctrl' : '', input.alt ? 'Alt' : '', input.shift ? 'Shift' : '', key].filter(Boolean).join('+'))
}

function validate(id, accel) {
    const def = DEFINITIONS.find(d => d.id === id)
    if (!def) return { error: 'unknown_action' }
    if (accel === '') return { accel: '' }
    const normalized = normalize(accel)
    if (!normalized) return { error: 'invalid' }
    if (RESERVED.some(re => re.test(normalized))) return { error: 'reserved' }
    const clash = list().find(item => item.id !== id && item.accel === normalized)
    if (clash) return { error: 'conflict', conflictWith: clash.id }
    return { accel: normalized }
}

function set(id, accel) {
    const result = validate(id, accel)
    if (result.error) return result
    const def = DEFINITIONS.find(d => d.id === id)
    const next = { ...overrides() }
    if (result.accel === def.accel) delete next[id]
    else next[id] = result.accel
    store.set(STORE_KEY, next)
    return { success: true }
}

function reset(id) {
    if (!id) { store.set(STORE_KEY, {}); return { success: true } }
    const next = { ...overrides() }
    delete next[id]
    store.set(STORE_KEY, next)
    return { success: true }
}

function actionForInput(input) {
    const accel = inputToAccel(input)
    if (!accel) return null
    const hit = list().find(item => item.accel === accel && !item.global)
    return hit ? hit.id : null
}

module.exports = { DEFINITIONS, list, set, reset, normalize, inputToAccel, actionForInput }
