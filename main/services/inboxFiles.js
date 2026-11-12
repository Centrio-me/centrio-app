'use strict'
// «Все мессенджеры» (3.8): files attached in our conversation window are handed to the messenger's own page as a
// real drag-and-drop (DevTools protocol on the tab), so the messenger uploads and sends them itself — Centrio never
// uploads anything anywhere.
const path = require('path')

const MAX_FILES = 10
// Telegram's own limit for one file; MAX allows a bit more
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
const DRAG_STEP_MS = 120

/**
 * Real files only: absolute paths, no folders, no duplicates, within the size and count limits.
 * @param {unknown} paths
 * @param {(p: string) => { isFile: () => boolean, size: number }} stat
 * @returns {{ path: string, name: string, size: number }[]}
 */
function checkFiles(paths, stat) {
    if (!Array.isArray(paths)) return []
    const seen = new Set()
    const out = []
    for (const p of paths) {
        if (out.length >= MAX_FILES) break
        if (typeof p !== 'string' || !path.isAbsolute(p) || seen.has(p)) continue
        seen.add(p)
        let info
        try { info = stat(p) } catch { continue }
        if (!info || !info.isFile() || info.size > MAX_FILE_BYTES) continue
        out.push({ path: p, name: path.basename(p), size: info.size })
    }
    return out
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Drops the files on the tab at the point (page CSS pixels), the way a person dragging them from Explorer would.
 * The tab's debugger is shared with the service-worker bridge (swNotifPatcher.js), so it is attached only if free.
 * @returns {Promise<boolean>}
 */
async function dropFiles(contents, point, files) {
    if (!contents || contents.isDestroyed() || !files.length) return false
    const dbg = contents.debugger
    try { if (!dbg.isAttached()) dbg.attach('1.3') } catch { return false }
    const data = { items: [], files: files.map((f) => f.path), dragOperationsMask: 1 }
    const x = Math.round(point.x)
    const y = Math.round(point.y)
    try {
        // messengers draw their drop zone on the first dragover and accept the drop on the next one over it
        for (const type of ['dragEnter', 'dragOver', 'dragOver', 'dragOver', 'drop']) {
            await dbg.sendCommand('Input.dispatchDragEvent', { type, x, y, data })
            await wait(DRAG_STEP_MS)
        }
        return true
    } catch {
        try { await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragCancel', x, y, data }) } catch {}
        return false
    }
}

// A drop in two steps (3.8.3): the messenger draws its zones («без сжатия» / «быстрая отправка») on the first dragover,
// the window looks where the wanted zone is, then the files are let go over it. One drag per tab at a time.
const drags = new Map()
async function startDrag(contents, point, files) {
    if (!contents || contents.isDestroyed() || !files.length) return false
    const dbg = contents.debugger
    try { if (!dbg.isAttached()) dbg.attach('1.3') } catch { return false }
    const data = { items: [], files: files.map((f) => f.path), dragOperationsMask: 1 }
    const x = Math.round(point.x)
    const y = Math.round(point.y)
    try {
        for (const type of ['dragEnter', 'dragOver', 'dragOver']) {
            await dbg.sendCommand('Input.dispatchDragEvent', { type, x, y, data })
            await wait(DRAG_STEP_MS)
        }
        drags.set(contents.id, data)
        return true
    } catch {
        try { await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragCancel', x, y, data }) } catch {}
        return false
    }
}

async function finishDrag(contents, point) {
    const data = contents && drags.get(contents.id)
    if (!data || contents.isDestroyed()) return false
    drags.delete(contents.id)
    const dbg = contents.debugger
    const x = Math.round(point.x)
    const y = Math.round(point.y)
    try {
        for (const type of ['dragOver', 'dragOver', 'drop']) {
            await dbg.sendCommand('Input.dispatchDragEvent', { type, x, y, data })
            await wait(DRAG_STEP_MS)
        }
        return true
    } catch {
        try { await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragCancel', x, y, data }) } catch {}
        return false
    }
}

module.exports = { checkFiles, dropFiles, startDrag, finishDrag, MAX_FILES, MAX_FILE_BYTES }
