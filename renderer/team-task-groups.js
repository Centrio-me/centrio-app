'use strict'
// Team tasks go both ways (3.7.3): a manager gives tasks to employees, an employee sends requests to a manager
// ("посмотреть договор", "согласовать"). How each person sees them; mirrors server-src/src/lib/team-task-rules.js.

/**
 * @param {Array<{id:string, assigneeId:string, createdById:string, status:string}>} tasks
 * @param {{userId:string, manager:boolean}} me
 * @returns {Array<{key:'forMe'|'myRequests'|'fromTeam'|'toTeam', items:Array}>}
 */
function groupTeamTasks(tasks, me) {
    const list = Array.isArray(tasks) ? tasks : []
    const groups = me.manager
        ? [
            { key: 'fromTeam', items: list.filter((t) => t.assigneeId === me.userId && t.createdById !== me.userId) },
            { key: 'toTeam', items: list.filter((t) => !(t.assigneeId === me.userId && t.createdById !== me.userId)) }
        ]
        : [
            { key: 'forMe', items: list.filter((t) => t.assigneeId === me.userId) },
            { key: 'myRequests', items: list.filter((t) => t.createdById === me.userId && t.assigneeId !== me.userId) }
        ]
    return groups.filter((g) => g.items.length)
}

function canToggle(task, me) {
    return me.manager || task.assigneeId === me.userId
}

function canWithdraw(task, me) {
    return !me.manager && task.createdById === me.userId && task.assigneeId !== me.userId && task.status === 'OPEN'
}

function assignTargets(members, me) {
    return (members || []).filter((m) => m.userId !== me.userId && (me.manager || m.role === 'OWNER' || m.role === 'ADMIN'))
}

module.exports = { groupTeamTasks, canToggle, canWithdraw, assignTargets }
