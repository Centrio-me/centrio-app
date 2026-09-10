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

// Mirrors MIN_SEATS in landing/org-routes.js — kept in sync by hand, same
// cross-file convention already used for SEAT_PLANS between org-routes.js
// and auto-renew-cron.js (no shared module between routes and lib in this
// repo layout). The first MIN_SEATS org slots are free (org creation sets
// seatLimit: MIN_SEATS with no payment, see POST /api/org) — but per the
// 2026-09-10 product decision below, "free slot" only ever meant "a row in
// the member list", never "free Pro". Don't conflate the two constants even
// though they're numerically identical right now.
const MIN_SEATS = 5

// Role priority for deciding WHICH members hold the org's paid Pro seats
// when there are more active members than paid seats — owner and admins are
// prioritized over plain members, then earliest-joined within each rank.
const ROLE_PRIORITY = { OWNER: 0, ADMIN: 1, MEMBER: 2 }

/**
 * FEATURE (2026-09-10, "свяжи Pro-доступ с оплаченным местом в команде. И
 * бесплатно никому не даём" — live product decision, following up on the
 * earlier finding that accepting an org invite never touched the invitee's
 * own `plan` field at all — org membership granted zero product access by
 * itself, paid or not): determines how many of this org's active members
 * currently sit on a PAID seat (seatLimit beyond the free MIN_SEATS base,
 * and only while the paid period — seatsExpiresAt — hasn't lapsed), then
 * ranks active members (OWNER > ADMIN > MEMBER, then earliest joinedAt) and
 * returns true only for members within that paid-seat count. The free base
 * seats NEVER grant Pro, regardless of rank — only truly paid seats do.
 *
 * @param {object} org - organization record with id/seatLimit/seatsExpiresAt
 * @returns {Promise<Set<string>>} userIds of members holding a paid Pro seat
 */
async function getProSeatHolderIds(org) {
    const paidSeats = (org.seatsExpiresAt && org.seatsExpiresAt > new Date())
        ? Math.max(0, org.seatLimit - MIN_SEATS)
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
                    seatsExpiresAt: true, autoRenewSeats: true
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
        orgProSeat: proSeatHolderIds.has(userId)
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

module.exports = {
    getOrgSummaryForUser,
    requireOrgRole,
    createInviteToken,
    hashInviteToken,
    generateUniqueOrgSlug
}
