// Per-session microphone / camera switches. A session (one messenger tab, its own partition) can have its microphone
// and its camera turned off on their own; the default is "allowed", so nothing changes for sessions never touched.
// Stored as { [messengerId]: { mic?: false, camera?: false } } — only the blocked sides are written.
'use strict'

const PARTITION_PREFIX = 'persist:'

function messengerIdFromPartition(partition) {
    if (typeof partition !== 'string' || !partition.startsWith(PARTITION_PREFIX)) return null
    return partition.slice(PARTITION_PREFIX.length) || null
}

// permission: Electron's name ('media' covers microphone and camera); details: mediaTypes (request handler) or
// mediaType (check handler). Anything that is not 'media' is never touched here (screen share keeps its own picker).
function isMediaBlocked(prefs, messengerId, permission, details) {
    if (permission !== 'media') return false
    const own = (prefs && messengerId && prefs[messengerId]) || null
    if (!own) return false
    const micOff = own.mic === false
    const camOff = own.camera === false
    if (!micOff && !camOff) return false
    const types = Array.isArray(details && details.mediaTypes) && details.mediaTypes.length
        ? details.mediaTypes
        : (details && details.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : null)
    // The type is not known: refuse only when both sides are off, otherwise let it through.
    if (!types) return micOff && camOff
    return (types.includes('audio') && micOff) || (types.includes('video') && camOff)
}

// Returns a new map; an entry that is back to the default (everything allowed) is dropped.
function setMediaAccess(prefs, messengerId, kind, allowed) {
    const key = kind === 'camera' ? 'camera' : 'mic'
    const next = { ...(prefs || {}) }
    const own = { ...(next[messengerId] || {}) }
    if (allowed) delete own[key]; else own[key] = false
    if (Object.keys(own).length) next[messengerId] = own; else delete next[messengerId]
    return next
}

module.exports = { isMediaBlocked, setMediaAccess, messengerIdFromPartition }
