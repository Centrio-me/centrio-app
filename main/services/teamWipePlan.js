// Which team sessions to clear (TEAM control, 2026-11-08). Team tabs use partitions "persist:org:<id>";
// Electron stores each in <userData>/Partitions/<encoded name>, where ':' becomes '%3A'.
function orgPartitionIds(partitionDirNames, registeredIds, onlyAssignmentIds = null) {
    const ids = new Set(registeredIds.filter((id) => String(id).startsWith('org:')))
    for (const dir of partitionDirNames) {
        const name = decodeURIComponent(dir)
        if (name.startsWith('org:')) ids.add(name)
    }
    const all = [...ids]
    if (!onlyAssignmentIds) return all
    const wanted = new Set(onlyAssignmentIds.map((a) => `org:${a}`))
    return all.filter((id) => wanted.has(id))
}

module.exports = { orgPartitionIds }
