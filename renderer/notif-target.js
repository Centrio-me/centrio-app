'use strict'
// Where a click on a notification opens its messenger (3.7.2). Before, every click closed the split and opened the
// messenger alone in the full window, even when it was right there in a pane of the open split.
// Per-messenger choice lives in store key `notifOpenIn`: { [messengerId]: '' | 'window' | 'preset:<presetId>' }.
const { getVisibleMessengerIds } = require('./focused-messenger')

const PRESET_PREFIX = 'preset:'

function normalizeChoice(value) {
    if (value === 'window') return 'window'
    if (typeof value === 'string' && value.startsWith(PRESET_PREFIX) && /^preset:[\w-]{1,64}$/.test(value)) return value
    return ''
}

/**
 * @returns {{kind:'pane'}|{kind:'preset',presetId:string}|{kind:'window'}|{kind:'tab'}}
 */
function pickNotificationTarget({ state, id, choice, presets }) {
    if (state?.splitMode && getVisibleMessengerIds(state).includes(id)) return { kind: 'pane' }
    const pick = normalizeChoice(choice)
    if (pick === 'window') return { kind: 'window' }
    if (pick.startsWith(PRESET_PREFIX)) {
        const presetId = pick.slice(PRESET_PREFIX.length)
        const preset = (presets || []).find(p => p.id === presetId)
        if (preset && Array.isArray(preset.memberIds) && preset.memberIds.includes(id)) return { kind: 'preset', presetId }
    }
    return { kind: 'tab' }
}

module.exports = { pickNotificationTarget, normalizeChoice, PRESET_PREFIX }
