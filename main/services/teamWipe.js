// Clears team messenger sessions on this computer (TEAM control, 2026-11-08): on the owner's
// «Завершить рабочие сеансы», when the person is removed from the team, and when he signs out.
// Only "persist:org:*" partitions are touched; personal messengers are never cleared here.
const fs = require('fs')
const path = require('path')
const { app, session } = require('electron')
const orgAssignedPartitions = require('./orgAssignedPartitions')
const { orgPartitionIds } = require('./teamWipePlan')

function partitionDirNames() {
    try {
        return fs.readdirSync(path.join(app.getPath('userData'), 'Partitions'))
    } catch {
        return []
    }
}

async function wipe(assignmentIds = 'all') {
    const only = Array.isArray(assignmentIds) ? assignmentIds : null
    const ids = orgPartitionIds(partitionDirNames(), orgAssignedPartitions.list(), only)
    let cleared = 0
    for (const id of ids) {
        try {
            const ses = session.fromPartition(`persist:${id}`)
            await ses.clearStorageData()
            await ses.clearCache()
            await ses.clearAuthCache().catch(() => {})
            cleared++
        } catch (error) {
            console.warn('[team-wipe] could not clear', id, error.message)
        }
    }
    return { cleared }
}

module.exports = { wipe }
