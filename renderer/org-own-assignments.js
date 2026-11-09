'use strict'
// GET /api/org/:orgId/messenger-assignments returns the whole team's roster to an OWNER/ADMIN (the website needs it to
// manage employees) and only their own rows to a MEMBER. The desktop app adds every row it keeps as a team tab, so an
// owner used to get all employees' messengers in his own sidebar, signed out (3.7.2). Keep only the person's own rows.
// Fails closed: without a known user id nothing is kept, and a row without an owner field is kept only for someone
// known to be a plain member (the server sends a member nothing but his own rows).

/**
 * @param {Array<{userId?: string}>} assignments rows from the server (each carries `userId`, the employee it is for)
 * @param {{id?: string|null, role?: string|null, isOwner?: boolean}} me signed-in person, his team role, owner flag
 */
function ownAssignments(assignments, me) {
    const list = Array.isArray(assignments) ? assignments : []
    if (!me?.id) return []
    const knownMember = me.role === 'MEMBER' && me.isOwner !== true
    return list.filter(a => (a.userId ? a.userId === me.id : knownMember))
}

module.exports = { ownAssignments }
