'use strict'

// NOTE on deploy path: this is a flat local mirror. On the production server
// this file lives at /var/www/centrio-api/src/lib/org.js (see payments-server.js
// for the same convention explained in more detail).
//
// Корпоративная версия (TEAM) — Phase 1 helpers.
// См. Obsidian → Centrio → Корпоративная версия (план + журнал по файлам).
//
// Scope reminder (Phase 1 only): organizations, seats, membership, invites,
// audit log. NOT in scope here: org policy enforcement (allowed-messenger
// whitelist, forced settings), SSO, silent-deploy — those are Phase 2+.

const crypto = require('crypto')
const prisma = require('../utils/prisma')

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Mirrors TEAM_MIN_SEATS in the website's src/lib/pricing.ts — kept in sync
// by hand, same cross-file convention already used for SEAT_PLANS between
// org-routes.js and auto-renew-cron.js (no shared module between routes and
// lib in this repo layout). Purely the MINIMUM PURCHASE QUANTITY — you can't
// buy fewer than 5 seats in one go. No longer a "free tier" (see
// getProSeatHolderIds below for the 2026-09-30 correction).
const MIN_SEATS = 5

// Role priority for deciding WHICH members hold the org's paid Pro seats
// when there are more active members than paid seats — owner and admins are
// prioritized over plain members, then earliest-joined within each rank.
const ROLE_PRIORITY = { OWNER: 0, ADMIN: 1, MEMBER: 2 }

/**
 * FEATURE (2026-09-10, "свяжи Pro-доступ с оплаченным местом в команде. И
 * бесплатно никому не даём" — live product decision), CORRECTED (2026-09-30,
 * live clarification: "чтобы пригласить сотрудников — нужно купить минимум
 * 5 мест... каждое место уже должно иметь PRO" — there is no free tier at
 * all; MIN_SEATS is only ever the minimum PURCHASE quantity, never a free
 * allocation): determines how many of this org's active members currently
 * sit on a paid seat — ALL of seatLimit, while the paid period
 * (seatsExpiresAt) hasn't lapsed — then ranks active members (OWNER > ADMIN
 * > MEMBER, then earliest joinedAt) and returns true for members within
 * that count. An org with no active payment (seatsExpiresAt null or in the
 * past) grants nobody Pro, regardless of seatLimit.
 *
 * The earlier version subtracted MIN_SEATS from seatLimit here, treating
 * the first 5 seats as a permanent free allocation. That assumption is what
 * made a 2026-09-18 manual grant ("5 seats for a month to every org") a
 * total no-op for any org still at the default seatLimit=5 — the formula
 * computed 0 paid seats no matter what seatsExpiresAt said. Removing the
 * subtraction fixes those orgs retroactively with no data migration needed
 * (their existing seatLimit=5 now correctly yields 5 paid seats).
 *
 * @param {object} org - organization record with id/seatLimit/seatsExpiresAt
 * @returns {Promise<Set<string>>} userIds of members holding a paid Pro seat
 */
async function getProSeatHolderIds(org) {
    const paidSeats = (org.seatsExpiresAt && org.seatsExpiresAt > new Date())
        ? org.seatLimit
        : 0
    if (paidSeats === 0) return new Set()

    const members = await prisma.orgMember.findMany({
        where: { orgId: org.id, status: 'ACTIVE' },
        select: { userId: true, role: true, joinedAt: true }
    })
    members.sort((a, b) => {
        const roleDiff = (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9)
        if (roleDiff !== 0) return roleDiff
        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    })

    return new Set(members.slice(0, paidSeats).map(m => m.userId))
}

const EXPIRING_SOON_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** State of an organization's paid period: none (never paid) | active | expiring (<= 7 days left) | expired. */
function getSeatsState(org, now = new Date()) {
    if (!org.seatsExpiresAt) return { state: 'none', daysLeft: null }
    const left = new Date(org.seatsExpiresAt).getTime() - now.getTime()
    if (left <= 0) return { state: 'expired', daysLeft: 0 }
    const daysLeft = Math.ceil(left / DAY_MS)
    return { state: daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active', daysLeft }
}

/**
 * Team status of a batch of users for the admin panel: who is an owner / employee of a team, whether that team's
 * paid period is alive and whether the person actually sits on a paid seat. Map<userId, status>.
 */
async function getTeamStatusForUsers(userIds) {
    const result = new Map()
    if (!userIds.length) return result
    const memberships = await prisma.orgMember.findMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        include: { organization: { select: { id: true, name: true, ownerId: true, seatLimit: true, seatsExpiresAt: true } } }
    })
    const holdersByOrg = new Map()
    for (const m of memberships) {
        if (!holdersByOrg.has(m.orgId)) holdersByOrg.set(m.orgId, await getProSeatHolderIds(m.organization))
    }
    for (const m of memberships) {
        const org = m.organization
        const st = getSeatsState(org)
        const status = {
            orgId: org.id, orgName: org.name,
            role: m.role, isOwner: org.ownerId === m.userId,
            proSeat: holdersByOrg.get(m.orgId).has(m.userId),
            state: st.state, daysLeft: st.daysLeft,
            seatsExpiresAt: org.seatsExpiresAt
        }
        const prev = result.get(m.userId)
        if (!prev || (status.isOwner && !prev.isOwner)) result.set(m.userId, status)
    }
    return result
}

/**
 * Returns null if the user is not an ACTIVE member of any organization,
 * otherwise a small denormalized summary safe to embed in the `user` object
 * returned by /api/auth/login and /api/auth/me.
 *
 * This is the ONLY per-request read of org membership used for that purpose —
 * nothing about org state is ever taken from client input. Callers must treat
 * the returned object as authoritative and must not merge it with anything
 * client-supplied before persisting/trusting it downstream (see
 * main/services/entitlement.js on the desktop side, which reads this same
 * shape verbatim out of the persisted cloud user).
 *
 * @param {string} userId
 * @returns {Promise<null | {
 *   orgId: string, orgName: string, orgSlug: string, orgRole: 'OWNER'|'ADMIN'|'MEMBER',
 *   orgTier: 'START'|'BUSINESS', orgSeatLimit: number, orgSeatsUsed: number,
 *   orgSeatsExpiresAt: string|null, orgAutoRenewSeats: boolean, orgIsOwner: boolean,
 *   orgProSeat: boolean
 * }>}
 */
async function getOrgSummaryForUser(userId) {
    const membership = await prisma.orgMember.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: {
            organization: {
                select: {
                    id: true, name: true, slug: true, tier: true, seatLimit: true, ownerId: true,
                    seatsExpiresAt: true, autoRenewSeats: true, logoUrl: true
                }
            }
        }
    })
    if (!membership) return null

    const seatsUsed = await prisma.orgMember.count({
        where: { orgId: membership.orgId, status: 'ACTIVE' }
    })

    const proSeatHolderIds = await getProSeatHolderIds(membership.organization)

    return {
        orgId: membership.orgId,
        orgName: membership.organization.name,
        orgSlug: membership.organization.slug,
        orgRole: membership.role,
        orgTier: membership.organization.tier,
        orgSeatLimit: membership.organization.seatLimit,
        orgSeatsUsed: seatsUsed,
        // 'none' | 'active' | 'expiring' | 'expired' + whole days left: lets the app say plainly what state the team subscription is in
        orgState: getSeatsState(membership.organization).state,
        orgDaysLeft: getSeatsState(membership.organization).daysLeft,
        // Additive fields (see journal — needed by the team-server.tsx billing
        // tab; harmless to also carry through login/me → cloud.user on desktop,
        // same posture as the rest of this object).
        orgSeatsExpiresAt: membership.organization.seatsExpiresAt
            ? membership.organization.seatsExpiresAt.toISOString()
            : null,
        orgAutoRenewSeats: !!membership.organization.autoRenewSeats,
        orgIsOwner: membership.organization.ownerId === userId,
        // FEATURE (2026-09-10, see getProSeatHolderIds above) — the desktop
        // app's isEffectivePro() (main/services/entitlement.js) ORs this in
        // alongside the individual account plan/trial, so a member gets Pro
        // features purely from occupying a paid team seat, independent of
        // their own personal plan.
        orgProSeat: proSeatHolderIds.has(userId),
        // FEATURE (2026-09-10, custom org branding): carried through
        // login/me → cloud.user so the desktop app can swap its logo
        // without a separate request. null means "use the default logo".
        orgLogoUrl: membership.organization.logoUrl || null
    }
}

/**
 * Express middleware factory. Requires the authenticated user (req.user.id,
 * set by ../middleware/auth upstream) to be an ACTIVE member of the org named
 * by req.params.orgId, with a role in `allowedRoles`. Attaches
 * req.orgMembership (the raw OrgMember row) for downstream handlers so they
 * don't have to re-query it.
 *
 * Deliberately re-checks membership+role on every request instead of trusting
 * anything cached client-side (same trust-boundary posture as the rest of
 * this API — see payments-server.js's auth checks for the established
 * pattern in this codebase).
 *
 * @param {Array<'OWNER'|'ADMIN'|'MEMBER'>} allowedRoles
 */
function requireOrgRole(allowedRoles) {
    return async function orgRoleMiddleware(req, res, next) {
        try {
            const orgId = req.params.orgId || req.params.id
            if (!orgId) {
                return res.status(400).json({ success: false, error: 'Missing organization id' })
            }

            const membership = await prisma.orgMember.findUnique({
                where: { orgId_userId: { orgId, userId: req.user.id } }
            })

            if (!membership || membership.status !== 'ACTIVE') {
                return res.status(403).json({ success: false, error: 'Not a member of this organization' })
            }

            if (!allowedRoles.includes(membership.role)) {
                return res.status(403).json({ success: false, error: 'Insufficient organization role' })
            }

            req.orgMembership = membership
            next()
        } catch (err) {
            next(err)
        }
    }
}

/**
 * Generates a plaintext invite token (given to the invitee via email) plus
 * its SHA-256 hash (the only form ever persisted, mirroring the
 * email-verification token pattern already used in auth-server.js — never
 * store the plaintext token at rest).
 *
 * @returns {{ token: string, tokenHash: string, expiresAt: Date }}
 */
function createInviteToken() {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashInviteToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    return { token, tokenHash, expiresAt }
}

function hashInviteToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Slugifies an org name into a URL-safe slug and disambiguates collisions
 * with a short random suffix. Not cryptographically meaningful — just needs
 * to be unique (enforced again at the DB level by Organization.slug @unique).
 */
async function generateUniqueOrgSlug(name) {
    const base = String(name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'team'

    let slug = base
    let attempt = 0
    // Small bounded retry loop — collisions should be rare in practice.
    while (attempt < 10) {
        const existing = await prisma.organization.findUnique({ where: { slug } })
        if (!existing) return slug
        attempt += 1
        slug = `${base}-${crypto.randomBytes(3).toString('hex')}`
    }
    // Fall through with a fully-random slug if we somehow keep colliding.
    return `${base}-${crypto.randomUUID()}`
}

/**
 * What a seat order is, decided on the server from the org's state (never from the client):
 *  - 'new'   no active paid period (never paid / expired): the chosen seats REPLACE the limit, the period starts now;
 *  - 'renew' active period, same seats: only the period is extended (price = current seats x period);
 *  - 'add'   active period, more seats: seats are added for the REST of the period only, price is prorated by days left.
 * Payment.days carries it: null = new, 0 = renew, N > 0 = add for N days.
 */
function planSeatOrder(org, body, { minSeats, maxSeats }, now = new Date()) {
    const active = !!(org.seatsExpiresAt && org.seatsExpiresAt > now)
    if (!active) {
        const seats = parseInt(body && body.seats, 10)
        if (!Number.isInteger(seats) || seats < minSeats || seats > maxSeats) return { error: `Количество мест должно быть от ${minSeats} до ${maxSeats}. Для большего числа мест напишите на sales@centrio.me` }
        return { mode: 'new', seats, days: null, factor: 1 }
    }
    if (body && body.mode === 'add') {
        const seats = parseInt(body.seats, 10)
        if (!Number.isInteger(seats) || seats < 1 || org.seatLimit + seats > maxSeats) return { error: `Можно добавить от 1 до ${Math.max(0, maxSeats - org.seatLimit)} мест. Для большего числа мест напишите на sales@centrio.me` }
        const daysLeft = Math.max(1, Math.ceil((org.seatsExpiresAt.getTime() - now.getTime()) / DAY_MS))
        return { mode: 'add', seats, days: daysLeft, factor: Math.min(1, daysLeft / 30) }
    }
    return { mode: 'renew', seats: Math.max(1, org.seatLimit), days: 0, factor: 1 }
}

/** The org state after crediting a succeeded seat payment (pure, see planSeatOrder for the meaning of Payment.days). */
function computeSeatCredit(org, payment, isRenewal, now = new Date()) {
    const active = !!(org.seatsExpiresAt && org.seatsExpiresAt > now)
    const extend = (from) => { const d = new Date(from); d.setMonth(d.getMonth() + payment.months); return d }
    if (isRenewal || payment.days === 0) return { seatLimit: org.seatLimit, seatsExpiresAt: extend(active ? org.seatsExpiresAt : now) }
    if (payment.days > 0) return { seatLimit: org.seatLimit + (payment.seats || 0), seatsExpiresAt: org.seatsExpiresAt }
    if (!active) return { seatLimit: payment.seats || org.seatLimit, seatsExpiresAt: extend(now) }
    return { seatLimit: org.seatLimit + (payment.seats || 0), seatsExpiresAt: extend(org.seatsExpiresAt) } // legacy: paid while active, no mode recorded
}

/**
 * Credits a succeeded seat (TEAM) payment to its organization: extends the paid period and, for a
 * first purchase / top-up, adds the bought seats. Called by EVERY payment path (YooKassa personal
 * webhook, org seats webhook, status poll, FRIDE) so an org payment can never be mistaken for a
 * personal Pro payment again (2026-10-14: a paid TEAM order only gave its owner a month of personal
 * Pro and left the organization untouched).
 * An auto-renewal payment (metadata.autoRenew) only extends the period — its seats are already counted.
 * The caller must have already claimed the payment (status flip) so this runs once per payment.
 */
async function creditSeatPayment(payment, yk, provider) {
    const org = await prisma.organization.findUnique({ where: { id: payment.orgId } })
    if (!org) return null
    const now = new Date()
    const meta = (yk && yk.metadata) || {}
    const isRenewal = meta.autoRenew === true || meta.autoRenew === 'true'
    const credit = computeSeatCredit(org, payment, isRenewal, now)
    const exp = credit.seatsExpiresAt
    const data = { seatsExpiresAt: credit.seatsExpiresAt, seatLimit: credit.seatLimit }
    if (provider !== 'fride') data.autoRenewSeats = true
    if (yk && yk.payment_method && yk.payment_method.saved) data.autoRenewPayMethodId = yk.payment_method.id
    await prisma.organization.update({ where: { id: org.id }, data })
    await prisma.orgAuditLog.create({
        data: { orgId: org.id, actorUserId: payment.userId, action: isRenewal ? 'seats.autorenew.success' : 'seats.purchase', metaJson: { mode: isRenewal ? 'autorenew' : (payment.days === 0 ? 'renew' : (payment.days > 0 ? 'add' : 'new')), seats: payment.seats, months: payment.months, provider: provider || 'yookassa', paymentId: payment.id, expiresAt: exp } }
    }).catch(e => console.error('[org] audit log write failed:', e.message))
    console.log('Org seat payment OK: org=' + org.id + ' seatLimit=' + (data.seatLimit ?? org.seatLimit) + ' until ' + exp.toISOString())
    return { org, exp }
}

module.exports = {
    creditSeatPayment,
    planSeatOrder,
    computeSeatCredit,
    getSeatsState,
    getTeamStatusForUsers,
    getProSeatHolderIds,
    getOrgSummaryForUser,
    requireOrgRole,
    createInviteToken,
    hashInviteToken,
    generateUniqueOrgSlug
}
