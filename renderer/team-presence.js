// Presence beat for the team board (TEAM control, 2026-11-08): the app is open, how long the computer
// has been idle, which TEAM messenger is in front, unread per TEAM messenger. Personal tabs never appear.
function assignmentIdOf(messengerId) {
    return String(messengerId).replace(/^org:/, '')
}

function buildBeat(state, idleSec, deviceKeyId) {
    const team = state.activeMessengers.filter((m) => m.orgAssigned)
    const front = team.find((m) => m.id === state.activeTabId)
    return {
        deviceKeyId: deviceKeyId || null,
        open: true,
        idleSec: Math.max(0, Math.round(idleSec || 0)),
        frontAssignmentId: front ? assignmentIdOf(front.id) : null,
        unread: Object.fromEntries(team.map((m) => [assignmentIdOf(m.id), state.rawUnreadCounts[m.id] || 0]))
    }
}

module.exports = { buildBeat }
