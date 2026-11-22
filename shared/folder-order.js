'use strict'
// The folders of notes in the order the person set (2026-11-22): one dragged onto another takes its place.

/**
 * @param {{ id: string, position?: number }[]} folders in the shown order
 * @returns {{ id: string, position: number }[] & { changed: { id: string, position: number }[] }} the new order; `changed` holds the folders whose position is new
 */
function moveFolder(folders, fromId, toId, after) {
    const list = (Array.isArray(folders) ? folders : []).slice()
    const from = list.findIndex((f) => f.id === fromId)
    const to = list.findIndex((f) => f.id === toId)
    const keep = Object.assign(list.map((f, i) => ({ ...f, position: i })), { changed: [] })
    if (from < 0 || to < 0 || from === to) return keep
    const [moved] = list.splice(from, 1)
    const at = list.findIndex((f) => f.id === toId)
    list.splice(after ? at + 1 : at, 0, moved)
    const result = list.map((f, i) => ({ ...f, position: i }))
    const before = new Map(folders.map((f, i) => [f.id, i]))
    return Object.assign(result, { changed: result.filter((f) => before.get(f.id) !== f.position) })
}

module.exports = { moveFolder }
