'use strict'

/**
 * Usage tracker — collects app/service time, notifications, messages
 * and flushes them to the API every 5 minutes and on quit.
 */

const store  = require('./store')
const api    = require('./api')
const { decryptValue } = require('./secureStore')

// ── State ─────────────────────────────────────────────────────────
let _focusStart  = Date.now()  // when window was last focused
let _focusAccum  = 0           // ms accumulated while focused
let _isFocused   = true        // assume focused at start

let _notifCount  = 0
let _msgSent     = 0
let _msgReceived = 0

const _serviceAccum = {}       // { 'Telegram': seconds, ... }
const _serviceNotifAccum = {}  // { 'Telegram': notifCount, ... }
let _interval = null

// ── Focus tracking ────────────────────────────────────────────────
function onFocus() {
    if (!_isFocused) {
        _focusStart = Date.now()
        _isFocused  = true
    }
}

function onBlur() {
    if (_isFocused) {
        _focusAccum += Date.now() - _focusStart
        _isFocused   = false
    }
}

function _getFocusedSecs() {
    let ms = _focusAccum
    if (_isFocused) ms += Date.now() - _focusStart
    return Math.floor(ms / 1000)
}

// ── Per-service time ──────────────────────────────────────────────
// The renderer only says WHICH messengers are on screen: the active tab, or every pane of a split (3.7.2: in a split
// they are all in use at once, so each earns the time — before only the focused pane did, and a split showed up as
// "only Telegram"). The clock lives here: time is credited only while the app window itself has focus, so a
// minimised or background Centrio, or a tab that is merely open in the background, never earns time.
let _activeServices = []
let _lastTick = Date.now()
let _tickTimer = null
const MAX_TICK_MS = 2500 // a longer gap means the computer slept: do not credit it

function setActiveServices(names) {
    _tickService() // credit the time up to now to the previous messengers first
    const list = Array.isArray(names) ? names.filter(n => typeof n === 'string' && n) : []
    _activeServices = [...new Set(list)]
}

function setActiveService(name) {
    setActiveServices(name ? [name] : [])
}

function _tickService() {
    const now = Date.now()
    const dt = now - _lastTick
    _lastTick = now
    if (!_isFocused || _activeServices.length === 0 || dt <= 0 || dt > MAX_TICK_MS) return
    for (const name of _activeServices) {
        _serviceAccum[name] = (_serviceAccum[name] || 0) + dt / 1000
    }
}

function _resetForTest() {
    Object.keys(_serviceAccum).forEach(k => delete _serviceAccum[k])
    _activeServices = []
    _lastTick = Date.now()
}

function _serviceSecondsForTest() {
    return Object.fromEntries(Object.entries(_serviceAccum).map(([k, v]) => [k, Math.round(v)]))
}

// Kept for older renderers that still report whole seconds themselves.
function addServiceTime(serviceName, seconds) {
    if (!serviceName || seconds <= 0) return
    _serviceAccum[serviceName] = (_serviceAccum[serviceName] || 0) + seconds
}

// ── Notification / message counters ──────────────────────────────
// serviceName ties a notification to a specific messenger tab (e.g. 'Telegram')
// so the per-service breakdown on the dashboard isn't always zero. Falls back
// to the unattributed aggregate bucket when no service is known.
function addNotif(count = 1, serviceName = null) {
    if (serviceName) {
        _serviceNotifAccum[serviceName] = (_serviceNotifAccum[serviceName] || 0) + count
    } else {
        _notifCount += count
    }
}
function addMsgSent(count = 1)     { _msgSent       += count }
function addMsgReceived(count = 1) { _msgReceived   += count }

// ── Flush to API ─────────────────────────────────────────────────
async function flush() {
    _tickService()
    try {
        // cloud.accessToken is written encrypted (safeStorage, see main.js's
        // 'store:secure-set' handler and main/services/secureStore.js) — a raw
        // store.get() here returned the "__enc__<base64>" ciphertext itself as
        // the Bearer token, so every flush 401'd silently and stats stopped
        // recording the moment a token was first written via secure storage.
        const token = decryptValue(store.get('cloud.accessToken', null))
        if (!token) return

        const appTime = _getFocusedSecs()

        // Send overall session stats
        if (appTime > 0 || _notifCount > 0 || _msgSent > 0 || _msgReceived > 0) {
            await api.trackStats(token, {
                appTime,
                notifCount:  _notifCount,
                msgSent:     _msgSent,
                msgReceived: _msgReceived,
            })
        }

        // Send per-service time + per-service notif count together, so a
        // service that only got a background notification (no tab switch
        // yet) still gets its own row instead of being dropped.
        const services = new Set([...Object.keys(_serviceAccum), ...Object.keys(_serviceNotifAccum)])
        for (const service of services) {
            const secs = Math.floor(_serviceAccum[service] || 0)
            const notifCount = _serviceNotifAccum[service] || 0
            if (secs > 0 || notifCount > 0) {
                await api.trackStats(token, {
                    service,
                    serviceTime: secs,
                    appTime: 0,  // avoid double-counting
                    notifCount,
                })
            }
        }

        // Reset all counters
        _focusAccum  = 0
        _focusStart  = Date.now()
        _notifCount  = 0
        _msgSent     = 0
        _msgReceived = 0
        Object.keys(_serviceAccum).forEach(k => delete _serviceAccum[k])
        Object.keys(_serviceNotifAccum).forEach(k => delete _serviceNotifAccum[k])

        console.log('[tracker] flushed stats')
    } catch (err) {
        // Don't crash — tracking is optional
        console.warn('[tracker] flush error:', err.message || err)
    }
}

// ── Start / stop ──────────────────────────────────────────────────
function start() {
    if (_interval) return
    // Flush every minute so data is saved frequently and not lost on crash
    _interval = setInterval(() => {
        flush().catch(() => {})
    }, 60 * 1000)
    _lastTick = Date.now()
    _tickTimer = setInterval(_tickService, 1000)
    console.log('[tracker] started')
}

function stop() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null }
    if (_interval) {
        clearInterval(_interval)
        _interval = null
    }
}

module.exports = {
    onFocus,
    onBlur,
    addServiceTime,
    setActiveService,
    setActiveServices,
    _tickService, // exported for the unit test
    _resetForTest,
    _serviceSecondsForTest,
    getActiveService: () => _activeServices[0] || null,
    addNotif,
    addMsgSent,
    addMsgReceived,
    flush,
    start,
    stop,
}
