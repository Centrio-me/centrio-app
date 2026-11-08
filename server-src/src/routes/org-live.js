// TEAM control (2026-11-08): the live stream, presence, the live board and notes.
// Mounted inside routes/org.js, so every path here is under /api/org.
const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { requireOrgRole } = require('../lib/org')
const { streamOrgEvents } = require('../lib/team-stream')

// ── GET /api/org/:orgId/events ─────────────────────────────────────────
// Server-Sent Events. The desktop app and the site's team page keep one open; on an event they
// refetch what changed. A member who is removed gets his 'member' event, then the stream closes.
router.get('/:orgId/events', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), (req, res) => {
    const orgId = req.params.orgId
    const userId = req.user.id
    streamOrgEvents(req, res, {
        orgId,
        viewer: { userId, role: req.orgMembership.role },
        findMember: () => prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } })
    })
})

// ── Presence and the live board ─────────────────────────────────────────
const { rateLimit } = require('../middleware/rateLimit')
const { emitOrgEvent } = require('../lib/team-events')
const { normalizeAlertSettings } = require('../lib/org-alerts')
const { teamScheduleOf, isWithinWorkHours, localDay } = require('../lib/team-schedule')
const { parseBeat, activeMinutesOf, buildLivePerson, summarizeLive } = require('../lib/team-presence')

const liveActionLimiter = rateLimit({ name: 'org-live-action', windowMs: 60 * 60 * 1000, max: 600, keyGenerator: (req) => req.user?.id || req.ip })
const presenceLimiter = rateLimit({ name: 'org-presence', windowMs: 60 * 1000, max: 6, keyGenerator: (req) => req.user?.id || req.ip })
const RECENT_BEATS_MS = 5 * 60 * 1000

async function loadTeamClock(orgId) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { alertSettingsJson: true } })
    return teamScheduleOf(normalizeAlertSettings(org?.alertSettingsJson))
}

async function livePersonFor(orgId, member, now, clock) {
    const [beats, stats, assignments, daily] = await Promise.all([
        prisma.orgPresence.findMany({ where: { orgId, userId: member.userId, at: { gt: new Date(now - RECENT_BEATS_MS) } }, orderBy: { at: 'desc' }, take: 50 }),
        prisma.orgMessengerStat.findMany({ where: { orgId, userId: member.userId } }),
        prisma.orgMessengerAssignment.findMany({ where: { orgId, userId: member.userId }, select: { id: true, name: true, paused: true }, orderBy: { sortOrder: 'asc' } }),
        prisma.orgPresenceDaily.findUnique({ where: { orgId_userId_day: { orgId, userId: member.userId, day: localDay(clock.timeZone, now) } } })
    ])
    // one beat per device: the newest
    const latest = new Map()
    for (const b of beats) if (!latest.has(b.deviceKeyId || 'unknown')) latest.set(b.deviceKeyId || 'unknown', b)
    return buildLivePerson({
        member, beats: [...latest.values()], stats, assignments, daily, now,
        inHours: isWithinWorkHours(clock.schedule, clock.timeZone, now)
    })
}

// ── POST /api/org/:orgId/presence ──────────────────────────────────────
// Sent by the desktop app every 30 s while the person is in a team.
router.post('/:orgId/presence', authMiddleware, presenceLimiter, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const userId = req.user.id
        const assignedIds = new Set((await prisma.orgMessengerAssignment.findMany({
            where: { orgId, userId, paused: false }, select: { id: true }
        })).map((a) => a.id))
        const beat = parseBeat(req.body, assignedIds)
        const now = new Date()
        const clock = await loadTeamClock(orgId)
        const day = localDay(clock.timeZone, now)
        const add = activeMinutesOf(beat)

        await prisma.orgPresence.create({ data: { orgId, userId, at: now, ...beat } })
        if (add > 0) {
            await prisma.orgPresenceDaily.upsert({
                where: { orgId_userId_day: { orgId, userId, day } },
                create: { orgId, userId, day, activeMin: add, firstAt: now, lastAt: now },
                update: { activeMin: { increment: add }, lastAt: now }
            })
        }
        if (req.orgMembership.role === 'MEMBER' || req.orgMembership.role === 'ADMIN') {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
            const person = await livePersonFor(orgId, { userId, name: (user?.name && user.name.trim()) || user?.email || '' }, now, clock)
            emitOrgEvent(orgId, 'presence', { userId, person })
        }
        res.json({ success: true })
    } catch (err) {
        console.error('Org presence error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка сохранения присутствия' })
    }
})

// ── GET /api/org/:orgId/live ───────────────────────────────────────────
// The «Сейчас» tab: one row per employee (owner excluded), plus the team at a glance.
router.get('/:orgId/live', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const now = new Date()
        const clock = await loadTeamClock(orgId)
        const members = await prisma.orgMember.findMany({
            where: { orgId, status: 'ACTIVE', role: { not: 'OWNER' } },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { joinedAt: 'asc' }
        })
        const people = []
        for (const m of members) {
            people.push(await livePersonFor(orgId, { userId: m.userId, name: (m.user.name && m.user.name.trim()) || m.user.email, strictMode: m.strictMode }, now, clock))
        }
        res.json({
            success: true,
            data: {
                summary: summarizeLive(people),
                people,
                inHours: isWithinWorkHours(clock.schedule, clock.timeZone, now),
                schedule: clock.schedule,
                timeZone: clock.timeZone
            }
        })
    } catch (err) {
        console.error('Org live error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения данных' })
    }
})

// ── Commands from the owner ─────────────────────────────────────────────
const { parseCommandBody, deliverySummary } = require('../lib/team-commands')
const { queueCommands } = require('../lib/team-command-store')

async function auditLive(orgId, actorUserId, action, meta) {
    try {
        await prisma.orgAuditLog.create({ data: { orgId, actorUserId, action, metaJson: meta ?? undefined } })
    } catch (err) {
        console.error('[org-live] audit write failed:', err.message)
    }
}

// An admin may act only on regular employees, like the other member actions.
async function loadTarget(req, res) {
    const target = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } } })
    if (!target || target.status !== 'ACTIVE' || target.role === 'OWNER') {
        res.status(404).json({ success: false, error: 'Сотрудник не найден' })
        return null
    }
    if (req.orgMembership.role === 'ADMIN' && target.role !== 'MEMBER') {
        res.status(403).json({ success: false, error: 'Администратор может управлять только сотрудниками' })
        return null
    }
    return target
}

// ── POST /api/org/:orgId/members/:userId/commands ───────────────────────
// { kind: 'pause'|'resume'|'reload'|'relogin'|'wipe', assignmentId? }
// pause/resume only flip OrgMessengerAssignment.paused (every device picks it up with the
// assignments); reload/relogin/wipe are queued per device and confirmed by each one.
router.post('/:orgId/members/:userId/commands', authMiddleware, liveActionLimiter, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const target = await loadTarget(req, res)
        if (!target) return
        const own = await prisma.orgMessengerAssignment.findMany({ where: { orgId, userId: target.userId }, select: { id: true, name: true } })
        const parsed = parseCommandBody(req.body, new Set(own.map((a) => a.id)))
        if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })
        const name = own.find((a) => a.id === parsed.payload.assignmentId)?.name || null

        if (parsed.kind === 'pause' || parsed.kind === 'resume') {
            await prisma.orgMessengerAssignment.update({ where: { id: parsed.payload.assignmentId }, data: { paused: parsed.kind === 'pause' } })
            emitOrgEvent(orgId, 'assignments', { userId: target.userId })
            await auditLive(orgId, req.user.id, `command.${parsed.kind}`, { userId: target.userId, name })
            return res.json({ success: true, data: { kind: parsed.kind, devices: 0 } })
        }
        const devices = await queueCommands({ orgId, userId: target.userId, kind: parsed.kind, payload: parsed.payload, createdById: req.user.id })
        await auditLive(orgId, req.user.id, `command.${parsed.kind}`, { userId: target.userId, name, devices })
        res.json({ success: true, data: { kind: parsed.kind, devices } })
    } catch (err) {
        console.error('Org command error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка отправки команды' })
    }
})

// ── GET /api/org/:orgId/members/:userId/commands ────────────────────────
router.get('/:orgId/members/:userId/commands', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const rows = await prisma.orgCommand.findMany({
            where: { orgId: req.params.orgId, userId: req.params.userId },
            orderBy: { createdAt: 'desc' },
            take: 60,
            select: { id: true, kind: true, payload: true, deviceKeyId: true, createdAt: true, doneAt: true }
        })
        res.json({
            success: true,
            data: {
                items: rows.slice(0, 20),
                delivery: Object.fromEntries(['reload', 'relogin', 'wipe'].map((k) => [k, deliverySummary(rows, k)]))
            }
        })
    } catch (err) {
        console.error('Org list commands error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения команд' })
    }
})

// ── Notes ────────────────────────────────────────────────────────────────
const { noteReadSummary, parseNoteBody, notesForMember } = require('../lib/team-notes')
const NOTES_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

router.post('/:orgId/notes', authMiddleware, liveActionLimiter, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const members = await prisma.orgMember.findMany({ where: { orgId, status: 'ACTIVE' }, select: { userId: true } })
        const parsed = parseNoteBody(req.body, new Set(members.map((m) => m.userId)))
        if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })
        const note = await prisma.orgNote.create({ data: { orgId, toUserId: parsed.toUserId, text: parsed.text, createdById: req.user.id } })
        emitOrgEvent(orgId, 'note', parsed.toUserId ? { userId: parsed.toUserId } : {})
        await auditLive(orgId, req.user.id, 'note.create', { toUserId: parsed.toUserId })
        res.json({ success: true, data: { id: note.id } })
    } catch (err) {
        console.error('Org note create error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка отправки' })
    }
})

// A member gets his unread notes; owner/admin get the last 50 with how many have read each.
router.get('/:orgId/notes', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const since = new Date(Date.now() - NOTES_WINDOW_MS)
        // ?mine=1: the notes meant for the caller himself, whatever his role (the desktop app asks this way).
        const isManager = req.orgMembership.role !== 'MEMBER' && req.query.mine !== '1'
        const notes = await prisma.orgNote.findMany({ where: { orgId, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: 50 })
        if (!isManager) {
            const reads = await prisma.orgNoteRead.findMany({ where: { userId: req.user.id, noteId: { in: notes.map((n) => n.id) } }, select: { noteId: true } })
            const mine = notesForMember(notes, req.user.id, new Set(reads.map((r) => r.noteId)))
            return res.json({ success: true, data: mine.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt })) })
        }
        const [members, reads] = await Promise.all([
            prisma.orgMember.findMany({ where: { orgId, status: 'ACTIVE' }, select: { userId: true } }),
            prisma.orgNoteRead.findMany({ where: { noteId: { in: notes.map((n) => n.id) } }, select: { noteId: true, userId: true } })
        ])
        res.json({
            success: true,
            data: notes.map((n) => ({ id: n.id, text: n.text, toUserId: n.toUserId, createdAt: n.createdAt, ...noteReadSummary(n, members, reads) }))
        })
    } catch (err) {
        console.error('Org notes list error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения' })
    }
})

router.post('/:orgId/notes/:id/read', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
    try {
        const note = await prisma.orgNote.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
        if (!note || (note.toUserId && note.toUserId !== req.user.id)) return res.status(404).json({ success: false, error: 'Не найдено' })
        await prisma.orgNoteRead.upsert({
            where: { noteId_userId: { noteId: note.id, userId: req.user.id } },
            create: { noteId: note.id, userId: req.user.id },
            update: {}
        })
        emitOrgEvent(req.params.orgId, 'note', { userId: req.user.id, read: note.id })
        res.json({ success: true })
    } catch (err) {
        console.error('Org note read error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка' })
    }
})

// ── GET /api/org/:orgId/reports?days=7|30 ───────────────────────────────
const { buildReportRows } = require('../lib/team-report')

router.get('/:orgId/reports', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const orgId = req.params.orgId
        const days = Number(req.query.days) === 30 ? 30 : 7
        const clock = await loadTeamClock(orgId)
        const from = localDay(clock.timeZone, new Date(Date.now() - (days - 1) * 86400000))
        const [members, dailies] = await Promise.all([
            prisma.orgMember.findMany({
                where: { orgId, status: 'ACTIVE', role: { not: 'OWNER' } },
                include: { user: { select: { name: true, email: true } } },
                orderBy: { joinedAt: 'asc' }
            }),
            prisma.orgPresenceDaily.findMany({ where: { orgId, day: { gte: from } } })
        ])
        const people = members.map((m) => ({ userId: m.userId, name: (m.user.name && m.user.name.trim()) || m.user.email }))
        res.json({ success: true, data: { days, from, rows: buildReportRows(people, dailies) } })
    } catch (err) {
        console.error('Org reports error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения отчёта' })
    }
})

module.exports = router
