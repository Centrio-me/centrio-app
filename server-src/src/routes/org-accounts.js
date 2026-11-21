'use strict'

// TEAM: accounts with a login and a password instead of an email, batch creation, batch invitations,
// password reset, and re-sending an invitation (2026-11-21). Mounted from routes/org.js on the same router,
// so every path below lives under /api/org/:orgId/...
//
// Every change of the number of people (an account made, an invitation made) runs inside a transaction that first
// locks the organization row (SELECT ... FOR UPDATE), so two requests at once can never take the same last seat.

const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const la = require('../lib/login-accounts')
const { createInviteToken } = require('../lib/org')
const { sendOrgInviteEmail } = require('../lib/email')
const { defaultStrictForJoin } = require('../lib/team-strict')
const { rateLimit } = require('../middleware/rateLimit')
const authMiddleware = require('../middleware/auth')

const MAX_BATCH = 30
const HASH_COST = 10
const MAIL_GAP_MS = 650 // Resend allows about 2 requests a second
const TX_TIMEOUT_MS = 15000
const MAX_LIST_TEXT = 20000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const fail = (code, error) => ({ ok: false, code, error })
const isPaidActive = (org) => !!org && !!org.seatsExpiresAt && org.seatsExpiresAt > new Date()
const roleFor = (req, wanted) => (wanted === 'ADMIN' && req.orgMembership.role === 'OWNER' ? 'ADMIN' : 'MEMBER')
const inviterLabel = (user) => (la.isLoginOnlyEmail(user.email) ? (user.name || 'Администратор') : user.email)

const MESSAGES = {
    team_expired: 'Подписка команды закончилась. Продлите места, чтобы добавлять сотрудников.',
    no_seats: 'Нет свободных мест. Купите дополнительные места.',
    login_taken: 'Такой логин уже занят',
    generic: 'Не удалось создать. Попробуйте ещё раз.'
}

/** Runs fn(tx, org) with the organization row locked until the transaction ends. */
function withOrgLock(orgId, fn) {
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`
        const org = await tx.organization.findUnique({ where: { id: orgId } })
        return fn(tx, org)
    }, { timeout: TX_TIMEOUT_MS })
}

async function freeSeats(tx, org) {
    const used = await tx.orgMember.count({ where: { orgId: org.id, status: 'ACTIVE' } })
    const pending = await tx.orgInvite.count({ where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } } })
    return org.seatLimit - used - pending
}

async function createLoginAccount(orgId, row, passwordHash) {
    try {
        return await withOrgLock(orgId, async (tx, org) => {
            if (!isPaidActive(org)) return fail('team_expired', MESSAGES.team_expired)
            const taken = await tx.user.findFirst({ where: { OR: [{ login: row.login }, { email: la.standInEmail(row.login) }] }, select: { id: true } })
            if (taken) return fail('login_taken', MESSAGES.login_taken)
            if ((await freeSeats(tx, org)) <= 0) return fail('no_seats', MESSAGES.no_seats)
            const user = await tx.user.create({
                data: { email: la.standInEmail(row.login), login: row.login, name: row.name, passwordHash, emailVerified: true },
                select: { id: true }
            })
            const strictMode = row.role === 'ADMIN' ? false : defaultStrictForJoin(new Date(), process.env.TEAM_STRICT_DEFAULT_FROM)
            await tx.orgMember.create({ data: { orgId, userId: user.id, role: row.role, status: 'ACTIVE', strictMode } })
            return { ok: true, userId: user.id }
        })
    } catch (err) {
        if (err && err.code === 'P2002') return fail('login_taken', MESSAGES.login_taken)
        console.error('[org-accounts] create failed:', err && err.message)
        return fail('generic', MESSAGES.generic)
    }
}

async function inviteOne(orgId, email, role, invitedById) {
    try {
        return await withOrgLock(orgId, async (tx, org) => {
            if (!isPaidActive(org)) return { email, status: 'team_expired' }
            const member = await tx.orgMember.findFirst({ where: { orgId, status: 'ACTIVE', user: { email: { equals: email, mode: 'insensitive' } } }, select: { id: true } })
            if (member) return { email, status: 'already_member' }
            const pending = await tx.orgInvite.findFirst({ where: { orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
            if (pending) return { email, status: 'already_invited' }
            if ((await freeSeats(tx, org)) <= 0) return { email, status: 'no_seats' }
            const { token, tokenHash, expiresAt } = createInviteToken()
            const invite = await tx.orgInvite.create({ data: { orgId, email, role, tokenHash, invitedById, expiresAt } })
            return { email, status: 'sent', id: invite.id, role, expiresAt, token }
        })
    } catch (err) {
        console.error('[org-accounts] invite failed:', err && err.message)
        return { email, status: 'failed' }
    }
}

module.exports = function mountOrgAccounts(router, { requireOrgRole, logOrgAudit, orgActionKey, memberActionLimiter }) {
    const accountsLimiter = rateLimit({ name: 'org-accounts', windowMs: 60 * 60 * 1000, max: 40, keyGenerator: orgActionKey })
    const inviteBatchLimiter = rateLimit({ name: 'org-invite-batch', windowMs: 60 * 60 * 1000, max: 20, keyGenerator: orgActionKey })
    const manage = [authMiddleware, requireOrgRole(['OWNER', 'ADMIN'])]

    // Suggested logins and passwords for a list of names; writes nothing.
    router.post('/:orgId/accounts/prepare', accountsLimiter, ...manage, async (req, res) => {
        try {
            const raw = Array.isArray(req.body && req.body.names) ? req.body.names : String((req.body && req.body.names) || '').split(/\r?\n/)
            const names = raw.map((n) => String(n == null ? '' : n).trim().slice(0, 80)).filter(Boolean)
            if (!names.length) return res.status(400).json({ success: false, error: 'Введите хотя бы одно имя' })
            if (names.length > MAX_BATCH) return res.status(400).json({ success: false, error: `За раз не больше ${MAX_BATCH} сотрудников` })
            const bases = [...new Set(names.map(la.loginFromName))]
            const existing = await prisma.user.findMany({ where: { OR: bases.map((b) => ({ login: { startsWith: b } })) }, select: { login: true } })
            const taken = new Set(existing.map((u) => u.login))
            const rows = la.assignLogins(names, (login) => taken.has(login)).map((r) => ({ ...r, password: la.generatePassword() }))
            const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
            const free = org ? await withOrgLock(org.id, (tx, o) => freeSeats(tx, o)) : 0
            res.json({ success: true, data: { rows, freeSeats: Math.max(0, free), paid: isPaidActive(org) } })
        } catch (err) {
            console.error('[org-accounts] prepare failed:', err.message)
            res.status(500).json({ success: false, error: 'Не удалось подготовить список' })
        }
    })

    // Creates the accounts. Each is made on its own: those that did not fit or did not pass are reported, the rest are created.
    router.post('/:orgId/accounts', accountsLimiter, ...manage, async (req, res) => {
        try {
            const list = req.body && Array.isArray(req.body.accounts) ? req.body.accounts : null
            if (!list || !list.length) return res.status(400).json({ success: false, error: 'Нет данных для создания' })
            if (list.length > MAX_BATCH) return res.status(400).json({ success: false, error: `За раз не больше ${MAX_BATCH} сотрудников` })
            const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
            if (!isPaidActive(org)) return res.status(409).json({ success: false, error: MESSAGES.team_expired })

            const failed = []
            const prepared = []
            const seen = new Set()
            for (const item of list) {
                const login = la.normalizeLogin(item && item.login)
                const name = String((item && item.name) || '').trim().slice(0, 80) || login
                const bad = la.checkLogin(login)
                if (bad) { failed.push({ name, login, code: bad.code, error: bad.message }); continue }
                if (seen.has(login)) { failed.push({ name, login, code: 'login_taken', error: 'Этот логин повторяется в списке' }); continue }
                const given = item && typeof item.password === 'string' && item.password !== '' ? item.password : null
                const password = given || la.generatePassword()
                const badPassword = la.checkPassword(password)
                if (badPassword) { failed.push({ name, login, code: badPassword.code, error: badPassword.message }); continue }
                seen.add(login)
                prepared.push({ name, login, password, role: roleFor(req, item && item.role) })
            }

            const created = []
            for (const row of prepared) {
                const passwordHash = await bcrypt.hash(row.password, HASH_COST)
                const result = await createLoginAccount(org.id, row, passwordHash)
                if (!result.ok) { failed.push({ name: row.name, login: row.login, code: result.code, error: result.error }); continue }
                created.push({ userId: result.userId, name: row.name, login: row.login, password: row.password, role: row.role })
                await logOrgAudit(org.id, req.user.id, 'member.create_login', { userId: result.userId, login: row.login, role: row.role })
            }
            res.json({ success: true, data: { created, failed } })
        } catch (err) {
            console.error('[org-accounts] create batch failed:', err.message)
            res.status(500).json({ success: false, error: 'Не удалось создать аккаунты' })
        }
    })

    // A new password for an account that has no real email. The old sessions end, the person signs in again.
    router.post('/:orgId/members/:userId/reset-password', memberActionLimiter, ...manage, async (req, res) => {
        try {
            const member = await prisma.orgMember.findUnique({
                where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
                include: { user: { select: { id: true, email: true, login: true } } }
            })
            if (!member || member.status !== 'ACTIVE') return res.status(404).json({ success: false, error: 'Участник не найден' })
            if (member.role === 'OWNER') return res.status(403).json({ success: false, error: 'Пароль владельца так не меняется' })
            if (member.role === 'ADMIN' && req.orgMembership.role !== 'OWNER') return res.status(403).json({ success: false, error: 'Пароль администратора может менять только владелец' })
            if (!la.isLoginOnlyEmail(member.user.email)) {
                return res.status(409).json({ success: false, error: 'У этого сотрудника есть почта: он восстановит пароль сам через «Забыли пароль».' })
            }
            const given = req.body && typeof req.body.password === 'string' && req.body.password !== '' ? req.body.password : null
            const password = given || la.generatePassword()
            const bad = la.checkPassword(password)
            if (bad) return res.status(400).json({ success: false, error: bad.message })
            const passwordHash = await bcrypt.hash(password, HASH_COST)
            await prisma.$transaction([
                prisma.user.update({ where: { id: member.userId }, data: { passwordHash } }),
                prisma.session.deleteMany({ where: { userId: member.userId } })
            ])
            la.loginLock.clear(member.user.login)
            await logOrgAudit(req.params.orgId, req.user.id, 'member.password_reset', { userId: member.userId, login: member.user.login })
            res.json({ success: true, data: { userId: member.userId, login: member.user.login, password } })
        } catch (err) {
            console.error('[org-accounts] reset failed:', err.message)
            res.status(500).json({ success: false, error: 'Не удалось сменить пароль' })
        }
    })

    // Invitations by email for a pasted list. Each address gets its own result.
    router.post('/:orgId/invites/batch', inviteBatchLimiter, ...manage, async (req, res) => {
        try {
            const body = req.body || {}
            const text = Array.isArray(body.emails) ? body.emails.join('\n') : String(body.emails || '')
            if (text.length > MAX_LIST_TEXT) return res.status(400).json({ success: false, error: 'Список слишком длинный' })
            const parsed = la.parseEmails(text)
            if (!parsed.valid.length && !parsed.invalid.length) return res.status(400).json({ success: false, error: 'Введите хотя бы один email' })
            if (parsed.valid.length > MAX_BATCH) return res.status(400).json({ success: false, error: `За раз не больше ${MAX_BATCH} адресов` })
            const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
            if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
            if (!isPaidActive(org)) return res.status(409).json({ success: false, error: 'Купите места для команды, чтобы приглашать сотрудников.' })
            const role = roleFor(req, body.role)

            const results = parsed.invalid.map((email) => ({ email, status: 'invalid' }))
            for (const email of parsed.duplicates) results.push({ email, status: 'duplicate' })
            const toMail = []
            for (const email of parsed.valid) {
                const r = await inviteOne(org.id, email, role, req.user.id)
                if (r.status === 'sent') {
                    toMail.push({ email, token: r.token })
                    await logOrgAudit(org.id, req.user.id, 'member.invite', { email, role })
                    results.push({ email, status: 'sent', id: r.id, role, expiresAt: r.expiresAt })
                } else {
                    results.push({ email, status: r.status })
                }
            }
            res.json({ success: true, data: { results } })

            const from = inviterLabel(req.user)
            ;(async () => {
                for (const item of toMail) {
                    let sent = await sendOrgInviteEmail({ email: item.email, orgName: org.name, inviterEmail: from, token: item.token }).catch(() => null)
                    if (!sent || !sent.ok) {
                        await sleep(MAIL_GAP_MS * 3)
                        sent = await sendOrgInviteEmail({ email: item.email, orgName: org.name, inviterEmail: from, token: item.token }).catch(() => null)
                    }
                    if (!sent || !sent.ok) await logOrgAudit(org.id, req.user.id, 'member.invite_mail_failed', { email: item.email })
                    await sleep(MAIL_GAP_MS)
                }
            })().catch((err) => console.error('[org-accounts] invite mail loop failed:', err.message))
        } catch (err) {
            console.error('[org-accounts] invite batch failed:', err.message)
            if (!res.headersSent) res.status(500).json({ success: false, error: 'Не удалось отправить приглашения' })
        }
    })

    // The letter did not arrive: a new link (the old one stops working) and the letter again.
    router.post('/:orgId/invites/:inviteId/resend', memberActionLimiter, ...manage, async (req, res) => {
        try {
            const invite = await prisma.orgInvite.findUnique({ where: { id: req.params.inviteId }, include: { organization: { select: { name: true } } } })
            if (!invite || invite.orgId !== req.params.orgId) return res.status(404).json({ success: false, error: 'Приглашение не найдено' })
            if (invite.acceptedAt) return res.status(409).json({ success: false, error: 'Приглашение уже принято' })
            const { token, tokenHash, expiresAt } = createInviteToken()
            await prisma.orgInvite.update({ where: { id: invite.id }, data: { tokenHash, expiresAt } })
            const sent = await sendOrgInviteEmail({ email: invite.email, orgName: invite.organization.name, inviterEmail: inviterLabel(req.user), token })
            if (!sent || !sent.ok) return res.status(502).json({ success: false, error: 'Не удалось отправить письмо. Проверьте адрес и попробуйте ещё раз.' })
            res.json({ success: true, data: { id: invite.id, expiresAt } })
        } catch (err) {
            console.error('[org-accounts] resend failed:', err.message)
            res.status(500).json({ success: false, error: 'Не удалось отправить приглашение' })
        }
    })
}
