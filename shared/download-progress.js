'use strict'
// What the window says while a messenger's file is coming down: «Скачивается «name»: 25%» / the number of files.
// Pure: the active downloads go in, the words and the bar's fraction come out.

const fill = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (_, key) => (key in values ? String(values[key]) : ''))
const clamp01 = (n) => Math.min(1, Math.max(0, n))

/** active: [{ name, received, total }] → { text, fraction|null } or null when nothing is coming down. */
function progressView(active, strings) {
    const list = Array.isArray(active) ? active : []
    if (list.length === 0) return null
    if (list.length > 1) return { text: fill(strings.many, { count: list.length }), fraction: null }
    const file = list[0]
    const total = Number(file.total) || 0
    if (total <= 0) return { text: fill(strings.one, { name: file.name }), fraction: null }
    const fraction = clamp01((Number(file.received) || 0) / total)
    return { text: fill(strings.oneWithPercent, { name: file.name, percent: Math.round(fraction * 100) }), fraction }
}

/** The map of active downloads after one event of main/ipc/downloads.js ('started' | 'progress' | anything else = finished). A new map. */
function applyUpdate(active, info) {
    const next = new Map(active)
    if (!info || !info.id) return next
    if (info.state === 'started') {
        next.set(info.id, { name: info.name || '', received: Number(info.received) || 0, total: Number(info.total) || 0 })
    } else if (info.state === 'progress') {
        const known = next.get(info.id)
        if (known) next.set(info.id, { ...known, received: Number(info.received) || 0, total: Number(info.total) || known.total })
    } else {
        next.delete(info.id)
    }
    return next
}

module.exports = { progressView, applyUpdate }
