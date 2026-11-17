'use strict'
// The sign-in of a messenger lives in the session of its tab, and the session is named after the tab's id. The cloud copy
// replaces this computer's list at every start, with the ids it was written with: when the other computer made its tabs
// on its own they have other ids, and this computer lost every sign-in at once (a TEAM administrator, 2026-11-17:
// «выкинуло из самой программы, в центрио выйдено отовсюду»). A tab that is already here (the same address and name)
// keeps its own id; everything in the cloud copy that points to a tab by id is changed to follow.

const normalizeUrl = (url) => String(url || '').trim().toLowerCase().replace(/\/+$/, '')
const normalizeName = (name) => String(name || '').trim().toLowerCase()

/** @returns {Map<string, string>} the cloud id → the id this computer already uses, only where they differ */
function buildIdMap(cloudMessengers, localMessengers) {
    const map = new Map()
    const taken = new Set()
    const localIds = new Set(localMessengers.map((m) => m.id))
    for (const c of cloudMessengers) if (localIds.has(c.id)) taken.add(c.id)
    const free = () => localMessengers.filter((l) => !taken.has(l.id))
    // first the tabs that agree on address and name, then those that agree on the address alone, when only one is left
    const passes = [
        (l, c) => normalizeUrl(l.url) === normalizeUrl(c.url) && normalizeName(l.name) === normalizeName(c.name),
        (l, c) => normalizeUrl(l.url) === normalizeUrl(c.url)
    ]
    passes.forEach((same, pass) => {
        for (const c of cloudMessengers) {
            if (localIds.has(c.id) || map.has(c.id)) continue
            const found = free().filter((l) => same(l, c))
            if (found.length === 0) continue
            if (pass === 1) {
                // by the address alone only when it is not a guess: one local tab and one cloud tab of that address are left
                const sameCloud = cloudMessengers.filter((x) => !localIds.has(x.id) && !map.has(x.id) && normalizeUrl(x.url) === normalizeUrl(c.url))
                if (found.length !== 1 || sameCloud.length !== 1) continue
            }
            map.set(c.id, found[0].id)
            taken.add(found[0].id)
        }
    })
    return map
}

/** The cloud copy with this computer's ids kept for the tabs it already has. The copy given in is not changed. */
function keepLocalIds(cloudData, localMessengers) {
    if (!cloudData || !Array.isArray(cloudData.messengers) || !Array.isArray(localMessengers) || localMessengers.length === 0) return cloudData
    const map = buildIdMap(cloudData.messengers, localMessengers)
    if (map.size === 0) return cloudData
    const to = (id) => (map.has(id) ? map.get(id) : id)
    const out = { ...cloudData, messengers: cloudData.messengers.map((m) => ({ ...m, id: to(m.id) })) }
    const extra = cloudData.settings && cloudData.settings.extra
    if (extra && typeof extra === 'object') {
        const next = { ...extra }
        if (typeof next.activeTabId === 'string') next.activeTabId = to(next.activeTabId)
        if (Array.isArray(next.sidebarOrder)) next.sidebarOrder = next.sidebarOrder.map((id) => (typeof id === 'string' ? to(id) : id))
        if (Array.isArray(next.splitPresets)) next.splitPresets = next.splitPresets.map((p) => (p && Array.isArray(p.memberIds) ? { ...p, memberIds: p.memberIds.map(to) } : p))
        out.settings = { ...cloudData.settings, extra: next }
    }
    return out
}

module.exports = { keepLocalIds, buildIdMap }
