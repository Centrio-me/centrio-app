// Who may do what with team tasks (3.7.3). Tasks go both ways now: a manager (OWNER/ADMIN) assigns to anyone in the
// team, an employee sends a request to a manager ("посмотреть договор", "согласовать") — never to another employee.
'use strict'

const isManager = (ctx) => !!ctx && (ctx.role === 'OWNER' || ctx.role === 'ADMIN')

/** ctx: the person acting {userId, role}; assignee: the active team member the task is for {userId, role} */
function canAssign(ctx, assignee) {
    if (!ctx || !assignee || !assignee.userId || assignee.userId === ctx.userId) return false
    if (isManager(ctx)) return true
    return assignee.role === 'OWNER' || assignee.role === 'ADMIN'
}

function canSee(task, ctx) {
    if (!task || !ctx) return false
    return isManager(ctx) || task.assigneeId === ctx.userId || task.createdById === ctx.userId
}

/** Prisma where-part for the task list: a manager sees the whole team, an employee his tasks and his requests */
function listFilter(ctx) {
    return isManager(ctx) ? {} : { OR: [{ assigneeId: ctx.userId }, { createdById: ctx.userId }] }
}

function canSetStatus(task, ctx) {
    return isManager(ctx) || (!!task && task.assigneeId === ctx.userId)
}

function canDelete(task, ctx) {
    if (isManager(ctx)) return true
    return !!task && task.createdById === ctx.userId && task.status === 'OPEN'
}

function canEditFields(ctx) {
    return isManager(ctx)
}

module.exports = { isManager, canAssign, canSee, listFilter, canSetStatus, canDelete, canEditFields }
