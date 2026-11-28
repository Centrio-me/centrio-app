'use strict'
// The small built-in tools of the «Расширения» section that have settings of their own (translator, currency and calculator).
// One key of the main store: { translate: { enabled, target }, currency: { enabled } }.
const store = require('./store')

const KEY = 'extTools'
const TARGET_LANGUAGES = ['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'zh-CN', 'tr', 'uk', 'pl', 'ar', 'ja', 'ko']
const SWITCHES = ['currency', 'timer', 'units', 'color'] // tools that have only a switch

function read() {
    const raw = store.get(KEY, {}) || {}
    const translate = raw.translate && typeof raw.translate === 'object' ? raw.translate : {}
    const out = {
        translate: {
            enabled: translate.enabled !== false,
            target: TARGET_LANGUAGES.includes(translate.target) ? translate.target : 'ru'
        }
    }
    for (const id of SWITCHES) out[id] = { enabled: !(raw[id] && raw[id].enabled === false) }
    return out
}

function get(id) {
    const all = read()
    return Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null
}

function set(id, patch) {
    const all = read()
    if (!Object.prototype.hasOwnProperty.call(all, id) || !patch || typeof patch !== 'object') return get(id)
    const next = { ...all[id] }
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
    if (id === 'translate' && TARGET_LANGUAGES.includes(patch.target)) next.target = patch.target
    store.set(KEY, { ...all, [id]: next })
    return next
}

module.exports = { get, set, TARGET_LANGUAGES }
