// Teams in the admin app (2026-11-09): one detailed view of a team and the actions support needs without
// touching the database by hand — add a person by email, change role or strict mode, remove, cancel an invite,
// rename, switch auto-renewal, hand over ownership. Mounted inside routes/admin.js after adminAuth, before
// the older /orgs routes there, so GET /orgs and GET /orgs/:id here replace the bare versions.
const router = require('express').Router()
const prisma = require('../utils/prisma')
const { getSeatsState, getProSeatHolderIds } = require('../lib/org')
const { statusFor, pickPersonBeat, OFFLINE_AFTER_SEC } = require('../lib/team-presence')
const { queueCommands } = require('../lib/team-command-store')
const { describeOrgAudit } = require('../lib/org-audit-text')

const AUDIT_TAKE = 100
const PRESENCE_LOOKBACK_MS = 24 * 60 * 60 * 1000
const ROLES = ['ADMIN', 'MEMBER']
const NAME_MAX = 80
const EXTEND_MAX_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

const fail = (res, where, err) => {
    console.error(`Admin teams ${where} error:`, err.message)
    res.status(500).json({ error: 'Ошибка сервера' })
}

function adminAudit(req, action, target) {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown'
    console.log(`[AUDIT] action=${action} target=${JSON.stringify(target)} ip=${ip}`)
    require('../lib/event-log').appendEvent('admin-audit', { at: new Date().toISOString(), action, target, ip })
}

const orgLog = (orgId, actorUserId, action, metaJson) =>
    prisma.orgAuditLog.create({ data: { orgId, actorUserId, action, metaJson } }).catch((e) => console.error('[admin-teams] audit failed:', e.message))

async function activeMember(orgId, userId) {
    const m = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } })
    return m && m.status === 'ACTIVE' ? m : null
}

// ── List ──
router.get('/orgs', async (req, res) => {
    try {
        const search = String(req.query.search || '').trim()
        const where = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] } : {}
        const orgs = await prisma.organization.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
        const owners = await prisma.user.findMany({ where: { id: { in: [...new Set(orgs.map((o) => o.ownerId))] } }, select: { id: true, email: true, name: true } })
        const ownerById = new Map(owners.map((u) => [u.id, u]))
        const counts = await prisma.orgMember.groupBy({ by: ['orgId'], where: { orgId: { in: orgs.map((o) => o.id) }, status: 'ACTIVE' }, _count: { _all: true } })
        const countBy = new Map(counts.map((c) => [c.orgId, c._count._all]))
        const result = orgs.map((o) => ({
            ...o,
            ownerEmail: ownerById.get(o.ownerId)?.email || null,
            ownerName: ownerById.get(o.ownerId)?.name || null,
            seatsUsed: countBy.get(o.id) || 0,
            ...getSeatsState(o)
        }))
        res.json({ orgs: result, total: result.length, page: 1, pages: 1 })
    } catch (err) { fail(res, 'list', err) }
})

// ── Detail ──
router.get('/orgs/:id', async (req, res) => {
    try {
        const org = await prisma.organization.findUnique({ where: { id: req.params.id } })
        if (!org) return res.status(404).json({ error: 'Команда не найдена' })
        const now = new Date()
        const [owner, members, pendingInvites, auditRows, payments, beats, assignments, holders] = await Promise.all([
            prisma.user.findUnique({ where: { id: org.ownerId }, select: { id: true, email: true, name: true } }),
            prisma.orgMember.findMany({ where: { orgId: org.id, status: 'ACTIVE' }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { joinedAt: 'asc' } }),
            prisma.orgInvite.findMany({ where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' } }),
            prisma.orgAuditLog.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' }, take: AUDIT_TAKE }),
            prisma.payment.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma.orgPresence.findMany({ where: { orgId: org.id, at: { gt: new Date(now - PRESENCE_LOOKBACK_MS) } }, orderBy: { at: 'desc' }, take: 2000 }),
            prisma.orgMessengerAssignment.findMany({ where: { orgId: org.id }, select: { userId: true, name: true } }),
            getProSeatHolderIds(org)
        ])

        const latestByDevice = new Map()
        for (const b of beats) {
            const key = `${b.userId}:${b.deviceKeyId || '-'}`
            if (!latestByDevice.has(key)) latestByDevice.set(key, b)
        }
        const beatsByUser = new Map()
        for (const b of latestByDevice.values()) beatsByUser.set(b.userId, [...(beatsByUser.get(b.userId) || []), b])

        const people = members.map((m) => {
            const beat = pickPersonBeat(beatsByUser.get(m.userId) || [])
            const presence = statusFor(beat, now, true)
            const own = assignments.filter((a) => a.userId === m.userId)
            return {
                userId: m.userId, role: m.role, status: m.status, joinedAt: m.joinedAt, user: m.user,
                proSeat: holders.has(m.userId), strictMode: m.strictMode, canAddOwnMessengers: m.canAddOwnMessengers,
                presence, lastSeenAt: beat ? beat.at : null, unread: beat && presence !== 'offline' ? beat.unreadTotal : 0,
                messengers: own.map((a) => a.name)
            }
        })

        const ids = new Set([org.ownerId])
        for (const r of auditRows) {
            if (r.actorUserId) ids.add(r.actorUserId)
            if (r.metaJson && typeof r.metaJson.userId === 'string') ids.add(r.metaJson.userId)
        }
        const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, email: true } })
        const emailById = new Map(users.map((u) => [u.id, u.email]))
        const who = (id) => emailById.get(id) || null
        const auditLog = auditRows.map((r) => ({ id: r.id, action: r.action, actorUserId: r.actorUserId, actorEmail: who(r.actorUserId), createdAt: r.createdAt, ...describeOrgAudit(r, who) }))

        res.json({
            ...org, ...getSeatsState(org, now), owner,
            members: people, proSeatsUsed: people.filter((p) => p.proSeat).length,
            summary: {
                working: people.filter((p) => p.presence === 'working').length,
                away: people.filter((p) => p.presence === 'away').length,
                offline: people.filter((p) => p.presence === 'offline' || p.presence === 'off_hours').length,
                messengers: assignments.length,
                offlineAfterSec: OFFLINE_AFTER_SEC
            },
            pendingInvites, payments, auditLog
        })
    } catch (err) { fail(res, 'detail', err) }
})

// ── Rename, auto-renewal ──
router.patch('/orgs/:id', async (req, res) => {
    try {
        const org = await prisma.organization.findUnique({ where: { id: req.params.id } })
        if (!org) return res.status(404).json({ error: 'Команда не найдена' })
        const data = {}
        if (req.body?.name !== undefined) {
            const name = String(req.body.name).trim()
            if (!name || name.length > NAME_MAX) return res.status(400).json({ error: `Название от 1 до ${NAME_MAX} символов` })
            data.name = name
        }
        if (req.body?.autoRenewSeats !== undefined) {
            if (typeof req.body.autoRenewSeats !== 'boolean') return res.status(400).json({ error: 'Недопустимое значение' })
            data.autoRenewSeats = req.body.autoRenewSeats
        }
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Нечего изменять' })
        await prisma.organization.update({ where: { id: org.id }, data })
        if (data.name) await orgLog(org.id, org.ownerId, 'org.rename', { name: data.name, via: 'admin' })
        adminAudit(req, 'org.update', { id: org.id, ...data })
        res.json({ ok: true })
    } catch (err) { fail(res, 'update', err) }
})

// ── Add an existing Centrio account by email ──
router.post('/orgs/:id/members', async (req, res) => {
    try {
        const org = await prisma.organization.findUnique({ where: { id: req.params.id } })
        if (!org) return res.status(404).json({ error: 'Команда не найдена' })
        const email = String(req.body?.email || '').trim().toLowerCase()
        const role = req.body?.role || 'MEMBER'
        if (!email.includes('@')) return res.status(400).json({ error: 'Укажите почту' })
        if (!ROLES.includes(role)) return res.status(400).json({ error: 'Недопустимая роль' })
        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, email: true } })
        if (!user) return res.status(404).json({ error: 'Аккаунта с такой почтой нет. Пусть человек сначала зарегистрируется в Centrio.' })
        if (await activeMember(org.id, user.id)) return res.status(409).json({ error: 'Уже в этой команде' })
        await prisma.orgMember.upsert({
            where: { orgId_userId: { orgId: org.id, userId: user.id } },
            update: { status: 'ACTIVE', role },
            create: { orgId: org.id, userId: user.id, role, status: 'ACTIVE' }
        })
        await orgLog(org.id, org.ownerId, 'member.join', { userId: user.id, via: 'admin' })
        adminAudit(req, 'org.member.add', { id: org.id, userId: user.id })
        res.json({ ok: true })
    } catch (err) { fail(res, 'member add', err) }
})

// ── Role, strict mode, own messengers ──
router.patch('/orgs/:id/members/:userId', async (req, res) => {
    try {
        const { id, userId } = req.params
        const target = await activeMember(id, userId)
        if (!target) return res.status(404).json({ error: 'Участник не найден' })
        const body = req.body || {}
        const data = {}
        if (body.role !== undefined) {
            if (target.role === 'OWNER') return res.status(403).json({ error: 'Роль владельца меняется передачей владения' })
            if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'Недопустимая роль' })
            data.role = body.role
        }
        for (const key of ['strictMode', 'canAddOwnMessengers']) {
            if (body[key] === undefined) continue
            if (typeof body[key] !== 'boolean') return res.status(400).json({ error: 'Недопустимое значение' })
            data[key] = body[key]
        }
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Нечего изменять' })
        await prisma.orgMember.update({ where: { orgId_userId: { orgId: id, userId } }, data })
        const org = await prisma.organization.findUnique({ where: { id }, select: { ownerId: true } })
        if (data.role) await orgLog(id, org.ownerId, 'member.role', { userId, role: data.role, via: 'admin' })
        if (data.strictMode !== undefined) await orgLog(id, org.ownerId, 'member.strict', { userId, strictMode: data.strictMode, via: 'admin' })
        if (data.canAddOwnMessengers !== undefined) await orgLog(id, org.ownerId, 'member.canAddOwnMessengers', { userId, canAddOwnMessengers: data.canAddOwnMessengers, via: 'admin' })
        adminAudit(req, 'org.member.update', { id, userId, ...data })
        res.json({ ok: true })
    } catch (err) { fail(res, 'member update', err) }
})

// ── Remove: same as the owner's own removal, work sign-ins on the person's computers are wiped ──
router.delete('/orgs/:id/members/:userId', async (req, res) => {
    try {
        const { id, userId } = req.params
        const target = await activeMember(id, userId)
        if (!target) return res.status(404).json({ error: 'Участник не найден' })
        if (target.role === 'OWNER') return res.status(403).json({ error: 'Владельца нельзя удалить. Сначала передайте владение.' })
        const org = await prisma.organization.findUnique({ where: { id }, select: { ownerId: true } })
        await queueCommands({ orgId: id, userId, kind: 'wipe', payload: { assignmentIds: 'all' }, createdById: org.ownerId })
        await prisma.orgMember.update({ where: { orgId_userId: { orgId: id, userId } }, data: { status: 'SUSPENDED' } })
        await orgLog(id, org.ownerId, 'member.remove', { userId, via: 'admin' })
        adminAudit(req, 'org.member.remove', { id, userId })
        res.json({ ok: true })
    } catch (err) { fail(res, 'member remove', err) }
})

// ── Hand over ownership to an active member ──
router.post('/orgs/:id/owner', async (req, res) => {
    try {
        const { id } = req.params
        const userId = String(req.body?.userId || '')
        const org = await prisma.organization.findUnique({ where: { id } })
        if (!org) return res.status(404).json({ error: 'Команда не найдена' })
        if (org.ownerId === userId) return res.status(400).json({ error: 'Он уже владелец' })
        if (!(await activeMember(id, userId))) return res.status(404).json({ error: 'Новый владелец должен быть участником команды' })
        await prisma.$transaction([
            prisma.orgMember.updateMany({ where: { orgId: id, userId: org.ownerId }, data: { role: 'ADMIN' } }),
            prisma.orgMember.update({ where: { orgId_userId: { orgId: id, userId } }, data: { role: 'OWNER', strictMode: false } }),
            prisma.organization.update({ where: { id }, data: { ownerId: userId } })
        ])
        await orgLog(id, userId, 'org.owner', { userId, from: org.ownerId, via: 'admin' })
        adminAudit(req, 'org.owner', { id, userId, from: org.ownerId })
        res.json({ ok: true })
    } catch (err) { fail(res, 'owner', err) }
})

// ── Add days to the paid period, counted from its current end (from now if it already ended) ──
router.post('/orgs/:id/extend', async (req, res) => {
    try {
        const days = parseInt(req.body?.days, 10)
        if (!Number.isInteger(days) || days < 1 || days > EXTEND_MAX_DAYS) return res.status(400).json({ error: `От 1 до ${EXTEND_MAX_DAYS} дней` })
        const org = await prisma.organization.findUnique({ where: { id: req.params.id } })
        if (!org) return res.status(404).json({ error: 'Команда не найдена' })
        const now = new Date()
        const base = org.seatsExpiresAt && org.seatsExpiresAt > now ? org.seatsExpiresAt : now
        const seatsExpiresAt = new Date(base.getTime() + days * DAY_MS)
        await prisma.organization.update({ where: { id: org.id }, data: { seatsExpiresAt } })
        await orgLog(org.id, org.ownerId, 'seats.gift', { days, via: 'admin', expiresAt: seatsExpiresAt })
        adminAudit(req, 'org.extend', { id: org.id, days })
        res.json({ ok: true, seatsExpiresAt })
    } catch (err) { fail(res, 'extend', err) }
})

// ── Cancel an invite ──
router.delete('/orgs/:id/invites/:inviteId', async (req, res) => {
    try {
        const invite = await prisma.orgInvite.findFirst({ where: { id: req.params.inviteId, orgId: req.params.id } })
        if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' })
        await prisma.orgInvite.delete({ where: { id: invite.id } })
        const org = await prisma.organization.findUnique({ where: { id: req.params.id }, select: { ownerId: true } })
        await orgLog(req.params.id, org.ownerId, 'member.invite_cancel', { email: invite.email, via: 'admin' })
        adminAudit(req, 'org.invite.cancel', { id: req.params.id, inviteId: invite.id })
        res.json({ ok: true })
    } catch (err) { fail(res, 'invite cancel', err) }
})

module.exports = router
