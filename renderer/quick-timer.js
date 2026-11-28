'use strict'
// Timers started from the quick switcher («таймер 15 мин»): kept in the browser storage so that they survive a restart,
// and when one runs out the app says so with a notification, a sound and a message at the bottom of the window.
const { showSaveToast } = require('./save-toast')

const STORAGE_KEY = 'centrio.timers'
const MAX_TIMERS = 10
const SOUND = 'assets/sounds/ringtone-10.mp3'

/**
 * @param {{ tGet: (key: string, params?: object) => string }} deps
 */
function createQuickTimer({ tGet }) {
    let timers = []
    const handles = new Map()

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(timers)) } catch { /* private mode */ }
    }

    function finish(timer) {
        timers = timers.filter((t) => t.id !== timer.id)
        handles.delete(timer.id)
        save()
        const text = timer.label ? tGet('vext.timer.doneLabel', { label: timer.label }) : tGet('vext.timer.done')
        showSaveToast({ kind: 'ok', text })
        try { new Notification(tGet('vext.timer.title'), { body: text, silent: true }) } catch { /* notifications are off */ }
        try { const a = new Audio(SOUND); a.volume = 0.8; a.play().catch(() => {}) } catch { /* no sound */ }
    }

    function schedule(timer) {
        const wait = Math.max(0, timer.end - Date.now())
        handles.set(timer.id, setTimeout(() => finish(timer), wait))
    }

    /** Starts a timer; false when there are too many */
    function start(ms, label) {
        if (timers.length >= MAX_TIMERS) return false
        const timer = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, end: Date.now() + ms, label: String(label || '').slice(0, 60) }
        timers.push(timer)
        save()
        schedule(timer)
        return true
    }

    function cancel(id) {
        clearTimeout(handles.get(id))
        handles.delete(id)
        timers = timers.filter((t) => t.id !== id)
        save()
    }

    /** The running ones, the nearest first */
    function list() {
        return [...timers].sort((a, b) => a.end - b.end)
    }

    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        timers = Array.isArray(saved) ? saved.filter((t) => t && typeof t.id === 'string' && Number.isFinite(t.end)).slice(0, MAX_TIMERS) : []
    } catch { timers = [] }
    timers.forEach(schedule)

    return { start, cancel, list }
}

module.exports = { createQuickTimer }
