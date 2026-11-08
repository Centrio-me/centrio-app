// Strict mode for team members (TEAM control, 2026-11-08). The owner turns it on per employee on
// the site; the app then keeps the team messengers exactly as the owner set them.

const TEAM_LOCKED_WHEN_STRICT = new Set(['remove', 'rename', 'reorder', 'icon', 'moveFolder', 'mute'])
const ADDING = new Set(['add', 'addLink'])

function canDo(action, messenger, strict) {
    const isTeam = !!(messenger && messenger.orgAssigned)
    if (isTeam && action === 'remove') return false // team messengers were never removable by the employee
    if (!strict) return true
    if (ADDING.has(action)) return false
    if (isTeam && TEAM_LOCKED_WHEN_STRICT.has(action)) return false
    return true
}

// Personal messengers are hidden (never deleted) while strict mode is on.
function visibleMessengers(list, { strict, teamWorkspaceActive }) {
    if (!strict || !teamWorkspaceActive) return list
    return list.filter((m) => m.orgAssigned)
}

// «Не беспокоить» still works for personal messengers; team ones keep notifying during work hours.
function dndCoversTeam({ strict, inWorkHours }) {
    return !(strict && inWorkHours)
}

module.exports = { canDo, visibleMessengers, dndCoversTeam }
