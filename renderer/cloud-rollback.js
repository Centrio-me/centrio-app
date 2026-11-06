// The account's cloud copy was rolled back when the servers were rebuilt after the hosting failure: any snapshot
// last written before this moment comes from the old backup (22 Sep 2026) and is OLDER than what this computer holds.
// Applying it on sign-in or on start would silently replace fresh messengers, folders and settings with that old copy,
// so such a snapshot is never applied while the computer has data of its own: the local state is sent up instead.
const CLOUD_ROLLBACK_BEFORE_MS = Date.parse('2026-11-04T10:40:00Z')

function cloudSnapshotTime(cloudData) {
    const raw = cloudData?.syncedAt || cloudData?.settings?.updatedAt || null
    const at = raw ? Date.parse(raw) : NaN
    return Number.isFinite(at) ? at : null
}

// True when the cloud copy is the rolled-back one AND this computer has messengers worth keeping.
function cloudCopyIsRolledBack(cloudData, localMessengers) {
    const at = cloudSnapshotTime(cloudData)
    if (at === null || at >= CLOUD_ROLLBACK_BEFORE_MS) return false
    return Array.isArray(localMessengers) && localMessengers.length > 0
}

module.exports = { CLOUD_ROLLBACK_BEFORE_MS, cloudSnapshotTime, cloudCopyIsRolledBack }
