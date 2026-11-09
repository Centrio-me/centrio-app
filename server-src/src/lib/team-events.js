// TEAM live channel (2026-11-08): an in-process bus per organization. The API runs as a
// single pm2 fork, so every SSE stream and every route that changes team data share it.
const { EventEmitter } = require('events')

const bus = new EventEmitter()
bus.setMaxListeners(0)

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])
const MANAGER_ONLY_TYPES = new Set(['presence'])

function emitOrgEvent(orgId, type, data = {}) {
    if (!orgId || !type) return
    const evt = { type, data, at: new Date() }
    for (const listener of bus.listeners(orgId)) {
        try {
            listener(evt)
        } catch (err) {
            console.error('[team-events] listener failed:', err.message)
        }
    }
}

function subscribeOrg(orgId, listener) {
    bus.on(orgId, listener)
    return () => bus.off(orgId, listener)
}

// A member receives events meant for everyone or for himself; presence is for managers only.
function visibleTo(evt, viewer) {
    if (MANAGER_ROLES.has(viewer.role)) return true
    if (MANAGER_ONLY_TYPES.has(evt.type)) return false
    const target = evt.data && evt.data.userId
    return !target || target === viewer.userId
}

// Every team change already writes an audit entry; the same moment tells the apps to resync.
const AUDIT_PREFIX_TO_EVENT = [
    ['messenger.', 'assignments'],
    ['credential.set', 'assignments'],
    ['credential.delete', 'assignments'],
    ['member.remove', 'member'],
    ['member.role', 'member'],
    ['member.canAddOwnMessengers', 'member'],
    ['member.strict', 'member'],
    ['settings.', 'settings'],
    ['vpn.', 'settings'],
    ['quickReply.', 'settings'],
    // Work hours live in the alert settings: members' apps refetch the schedule (3.7.1).
    ['alerts.update', 'settings'],
    ['workspace.', 'structure'],
    ['folder.', 'structure'],
    ['task.', 'tasks']
]

function eventForAudit(action, meta) {
    const match = AUDIT_PREFIX_TO_EVENT.find(([prefix]) => String(action).startsWith(prefix))
    if (!match) return null
    const userId = meta && (meta.userId || meta.assigneeId)
    return { type: match[1], data: userId ? { userId } : {} }
}

module.exports = { emitOrgEvent, subscribeOrg, visibleTo, eventForAudit }
