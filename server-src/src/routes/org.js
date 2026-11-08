const router  = require('express').Router()
const axios    = require('axios')
const { v4: uuidv4 } = require('uuid')
const authMiddleware = require('../middleware/auth')
const prisma   = require('../utils/prisma')
const { Prisma } = require('@prisma/client')
const { rateLimit } = require('../middleware/rateLimit')
const multer = require('multer')
const path = require('path')
// NOTE on deploy path: this file is deployed to
// /var/www/centrio-api/src/routes/org.js (see scripts/deploy-*.js and the
// identical note in payments-server.js) — `../lib/*` and `../middleware/*`
// resolve correctly once deployed into that nested layout, even though this
// checkout keeps everything flat under landing/.
const crypto = require('crypto')
const { sendOrgInviteEmail } = require('../lib/email')
const { normalizeAlertSettings, sendTestAlert } = require('../lib/org-alerts')
const { getBotUsername } = require('../lib/telegram-bot')
const { emitOrgEvent, eventForAudit } = require('../lib/team-events')
const { isAllowedAssignmentUrl, passwordSurvivesUrlChange } = require('../lib/team-commands')
const { queueCommands } = require('../lib/team-command-store')
const { defaultStrictForJoin } = require('../lib/team-strict')
const { recordReactions } = require('../lib/team-reactions')
const {
  getOrgSummaryForUser,
  requireOrgRole,
  createInviteToken,
  hashInviteToken,
  generateUniqueOrgSlug,
  creditSeatPayment,
  planSeatOrder
} = require('../lib/org')

// Корпоративная версия (TEAM) — Phase 1 (см. Obsidian → Centrio →
// Корпоративная версия → план + журнал реализации). Organizations, seats,
// membership, invites, self-service seat billing, audit log. Org policy
// (whitelist/forced settings), SSO, silent-deploy are Phase 2+ — not here.

// Mirrors the granularity already used for the payments routes (see
// payments-server.js) — org actions are less frequent than personal payment
// flows but still need a floor so a compromised/scripted account can't spam
// invite emails or seat-purchase attempts.
const createOrgLimiter    = rateLimit({ name: 'org-create',        windowMs: 24 * 60 * 60 * 1000, max: 3 })
const inviteLimiter       = rateLimit({ name: 'org-invite',        windowMs: 60 * 60 * 1000,      max: 30 })
const acceptInviteLimiter = rateLimit({ name: 'org-invite-accept', windowMs: 60 * 60 * 1000,      max: 10 })
// BUGFIX (2026-10-02, "везде пишет — слишком много запросов" в TEAM): this limiter
// was 60/hour keyed by IP and shared by EVERY org management action (assigning
// messengers, tasks, folders, quick replies, task comments...). An owner setting
// up a team (bulk-assigning messengers, ~20 requests a minute) burned the whole
// hour budget, and since the key was the IP, everyone in the same office (shared
// NAT) was blocked too. Now it is keyed by the signed-in user and much higher;
// it only has to stop runaway scripts.
const jwtForLimiter = require('jsonwebtoken')
function orgActionKey(req) {
  try {
    const token = (req.headers.authorization || '').split(' ')[1]
    const decoded = jwtForLimiter.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded && decoded.userId) return 'u:' + decoded.userId
  } catch { /* fall back to IP */ }
  return req.ip || 'unknown'
}
const memberActionLimiter = rateLimit({ name: 'org-member-action', windowMs: 60 * 60 * 1000, max: 1500, keyGenerator: orgActionKey })
const seatPaymentLimiter  = rateLimit({ name: 'org-seats-create',  windowMs: 5 * 60 * 1000,       max: 10 })
const orgWebhookLimiter   = rateLimit({ name: 'org-seats-webhook', windowMs: 60 * 1000,           max: 60 })
// Keyed per account, not per IP: the desktop app now pushes on every unread
// change (debounced), and a whole office behind one NAT IP must not share a
// single budget.
const orgStatsPushLimiter = rateLimit({
  name: 'org-stats-push', windowMs: 5 * 60 * 1000, max: 60,
  keyGenerator: (req) => req.user?.id || req.ip
})
const alertTestLimiter    = rateLimit({ name: 'org-alert-test',    windowMs: 60 * 60 * 1000,      max: 10 })
const QUICK_REPLY_TITLE_MAX = 80
const QUICK_REPLY_TEXT_MAX  = 2000
const QUICK_REPLIES_PER_ORG = 100
const TELEGRAM_LINK_TTL_MS  = 15 * 60 * 1000

// PATCH /:orgId/logo — mirrors chat-sites.js's widget-logo upload exactly
// (same multer config shape, same disk-storage-by-fixed-id convention, own
// subdirectory) — added 2026-09-28. The uploads/org-logos/ directory and
// two orphaned logo files in it (from 2026-09-19) already existed on disk,
// and the frontend (team/page.tsx handleLogoUpload/handleRemoveLogo) has
// called this exact route/shape since then — the route itself was just
// missing from index.js/org.js, most likely dropped in a later redeploy
// (see the divoom-bridge split note elsewhere in this codebase for the
// same class of "index.js redeploy silently drops a route" incident).
const orgLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, '/var/www/centrio-api/uploads/org-logos'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png'
        cb(null, `${req.params.orgId}${ext}`)
    }
})
const uploadOrgLogo = multer({
    storage: orgLogoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true)
        else cb(new Error('Только изображения'))
    }
})

const YK_SHOP   = process.env.YUKASSA_SHOP_ID
const YK_SECRET = process.env.YUKASSA_SECRET_KEY
const YK_API    = 'https://api.yookassa.ru/v3'
const FRONT     = process.env.FRONTEND_URL || 'https://centrio.me'

function ykAuth () { return { username: YK_SHOP, password: YK_SECRET } }

// TEAM Старт pricing (см. план §4). TEAM Бизнес не продаётся самостоятельно
// в Phase 1 — она вводится вместе с org policy в Phase 2, поэтому здесь
// сознательно нет "business"-варианта цены.
// PRICING (2026-09-29, live decision): поднято выше personal Pro (199₽/мес,
// ≈133₽/мес за год) вместо того, чтобы быть дешевле его — так же, как
// Rambox продаёт свой Teams-тариф примерно в 2 раза дороже индивидуального
// Pro. Было 179/149 — держать в синхроне с team/page.tsx's SEAT_PLANS.
const SEAT_PLANS = {
  month: { pricePerSeat: '389.00', months: 1,  label: 'Centrio TEAM Старт — место, 1 месяц' },
  year:  { pricePerSeat: '4188.00', months: 12, label: 'Centrio TEAM Старт — место, 1 год' } // 349₽/мес × 12
}

// FRIDE — EU/US card billing for Team seats (2026-09-29, live decision:
// "Оплата там есть eu-картами. Тоже сделай"). Mirrors payments-server.js's
// personal-Pro FRIDE integration exactly, including its RUB-tagged-amount
// quirk (see that file's FRIDE_PLANS comment — FRIDE's own API wants the
// amount field tagged `currency: 'RUB'` regardless of the fact the card is
// actually charged in EUR at checkout). Reuses the same FRIDE merchant
// account/env vars as personal Pro — no separate Team merchant setup.
const FRIDE_API_KEY     = process.env.FRIDE_API_KEY
const FRIDE_MERCHANT_ID = process.env.FRIDE_MERCHANT_ID
const FRIDE_API         = 'https://api.fride.io'
const FRIDE_SEAT_PLANS = {
  month: { price: '8.00', months: 1,  label: 'Centrio TEAM Старт — место, 1 месяц' },
  year:  { price: '84.00', months: 12, label: 'Centrio TEAM Старт — место, 1 год' } // €7/мес × 12
}

// Mirrors Rambox's Enterprise-tier minimum (см. план §4) — below this an
// organization isn't meaningfully different from a few people sharing Pro
// individually, and self-service billing below this floor isn't worth the
// support surface.
const MIN_SEATS = 5
const MAX_SEATS_SELF_SERVICE = 49 // 50+ — договорной инвойс, не self-service (см. план §4)

async function logOrgAudit(orgId, actorUserId, action, meta) {
  try {
    await prisma.orgAuditLog.create({
      data: { orgId, actorUserId, action, metaJson: meta ?? undefined }
    })
  } catch (err) {
    // Audit logging must never block the actual operation it's describing.
    console.error('[org] audit log write failed:', err.message)
  }
  // The apps resync the moment the owner changes something (TEAM live channel, 2026-11-08).
  const evt = eventForAudit(action, meta)
  if (evt) emitOrgEvent(orgId, evt.type, evt.data)
}

// ── POST /api/org ───────────────────────────────────────────────────
// Creates a new organization with the calling user as OWNER. Phase 1 MVP
// simplification (see landing/lib/org.js top comment and schema.prisma.tmp):
// a user may own at most one org and belong to at most one org, enforced
// here in application logic rather than at the schema level.
router.post('/', createOrgLimiter, authMiddleware, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ success: false, error: 'Введите название организации' })

    const existingOwned = await prisma.organization.findFirst({ where: { ownerId: req.user.id } })
    if (existingOwned) {
      return res.status(409).json({ success: false, error: 'У вас уже есть организация' })
    }
    const existingMembership = await prisma.orgMember.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' }
    })
    if (existingMembership) {
      return res.status(409).json({ success: false, error: 'Вы уже состоите в организации' })
    }

    const slug = await generateUniqueOrgSlug(name)

    const org = await prisma.$transaction(async (tx) => {
      // CHANGED (2026-09-30, live clarification: "команду создать можно,
      // после этого чтобы пригласить сотрудников — нужно купить минимум 5
      // мест" — creating an org is free, but inviting anyone requires an
      // actual seat purchase first; there is no free-seat allocation).
      // Used to start at MIN_SEATS (5) with no payment, which let an owner
      // invite up to 4 unpaid members immediately (see POST
      // /:orgId/invites' seatsUsed+pendingInvites >= seatLimit check below —
      // it only ever checked capacity, never payment status). Starting at 0
      // means that check blocks every invite until the first seat purchase
      // sets both seatLimit and seatsExpiresAt for real.
      const created = await tx.organization.create({
        data: {
          name,
          slug,
          ownerId: req.user.id,
          tier: 'START',
          seatLimit: 0
        }
      })
      await tx.orgMember.create({
        data: { orgId: created.id, userId: req.user.id, role: 'OWNER', status: 'ACTIVE' }
      })
      return created
    })

    await logOrgAudit(org.id, req.user.id, 'org.create', { name, slug })

    res.json({ success: true, data: { id: org.id, name: org.name, slug: org.slug, tier: org.tier, seatLimit: org.seatLimit } })
  } catch (err) {
    console.error('Org create error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания организации' })
  }
})

// ── GET /api/org/:orgId ─────────────────────────────────────────────
router.get('/:orgId', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const summary = await getOrgSummaryForUser(req.user.id)
    if (!summary || summary.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Организация не найдена' })
    }
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('Org get error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения организации' })
  }
})

// ── PATCH /api/org/:orgId ────────────────────────────────────────────
// Rename the organization — added 2026-09-28. team/page.tsx's
// handleRenameOrg already called this exact route/shape; it just never
// existed on the backend (every rename attempt 404'd). OWNER-only, same
// as the other org-identity-affecting actions in this file.
router.patch('/:orgId', authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ success: false, error: 'Введите название организации' })

    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    await prisma.organization.update({ where: { id: req.params.orgId }, data: { name } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.rename', { from: org.name, to: name })

    const summary = await getOrgSummaryForUser(req.user.id)
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('Org rename error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка переименования организации' })
  }
})

// ── PATCH /api/org/:orgId/logo ───────────────────────────────────────
router.patch('/:orgId/logo', authMiddleware, requireOrgRole(['OWNER']), (req, res, next) => {
  uploadOrgLogo.single('logo')(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'Файл слишком большой (максимум 5 МБ)' })
    }
    return res.status(400).json({ success: false, error: err.message || 'Не удалось загрузить файл' })
  })
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не загружен' })
    const logoUrl = `${process.env.API_URL}/uploads/org-logos/${req.file.filename}`
    await prisma.organization.update({ where: { id: req.params.orgId }, data: { logoUrl } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.logo', { logoUrl })
    res.json({ success: true, data: { logoUrl } })
  } catch (err) {
    console.error('Org logo upload error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка загрузки логотипа' })
  }
})

// ── DELETE /api/org/:orgId/logo ──────────────────────────────────────
router.delete('/:orgId/logo', authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    await prisma.organization.update({ where: { id: req.params.orgId }, data: { logoUrl: null } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.logo', { logoUrl: null })
    res.json({ success: true })
  } catch (err) {
    console.error('Org logo remove error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления логотипа' })
  }
})

// ── GET /api/org/:orgId/members ──────────────────────────────────────
router.get('/:orgId/members', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const members = await prisma.orgMember.findMany({
      where: { orgId: req.params.orgId, status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { joinedAt: 'asc' }
    })
    res.json({
      success: true,
      data: members.map(m => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        // BUGFIX (2026-10-02): the PATCH saved this flag but the list never returned it, so the
        // team page checkbox and the employee app always read it as 'allowed'.
        canAddOwnMessengers: m.canAddOwnMessengers,
        strictMode: m.strictMode,
        joinedAt: m.joinedAt
      }))
    })
  } catch (err) {
    console.error('Org members error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения участников' })
  }
})

// ── POST /api/org/:orgId/invites ─────────────────────────────────────
router.post('/:orgId/invites', inviteLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254)
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Введите корректный email' })
    }
    // Only OWNER may create another ADMIN — an ADMIN inviting a peer ADMIN
    // would let invited members escalate the org's admin set without the
    // owner's involvement.
    const role = req.body?.role === 'ADMIN' && req.orgMembership.role === 'OWNER' ? 'ADMIN' : 'MEMBER'

    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    // BUGFIX (2026-09-30, live clarification: "нужно купить минимум 5 мест
    // — как только куплено — можно рассылать приглашения"): this used to
    // check capacity only, never whether the org had actually paid. A
    // fresh, never-paid org previously started with seatLimit=5 (see
    // org.create above, since fixed to 0), so this alone let an owner
    // invite people with zero payment. Now also requires an active paid
    // period — covers both "never paid" (seatsExpiresAt null) and "paid,
    // then lapsed" (seatsExpiresAt in the past, seatLimit still whatever it
    // was) — same lapse case getProSeatHolderIds (lib/org.js) already
    // guards against on the Pro-access side; this is the matching guard on
    // the invite side.
    if (!org.seatsExpiresAt || org.seatsExpiresAt <= new Date()) {
      return res.status(409).json({ success: false, error: 'Купите места для команды, чтобы приглашать сотрудников.' })
    }

    const seatsUsed = await prisma.orgMember.count({ where: { orgId: org.id, status: 'ACTIVE' } })
    const pendingInvites = await prisma.orgInvite.count({
      where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } }
    })
    if (seatsUsed + pendingInvites >= org.seatLimit) {
      return res.status(409).json({ success: false, error: 'Недостаточно свободных мест. Купите дополнительные места.' })
    }

    // Case-insensitive: `email` here is already lowercased, but User.email is
    // stored verbatim at registration (auth-server.js's /register doesn't
    // normalize casing), so a plain equality match could silently miss an
    // existing member whose stored email has different casing.
    const alreadyMember = await prisma.orgMember.findFirst({
      where: { orgId: org.id, status: 'ACTIVE', user: { email: { equals: email, mode: 'insensitive' } } }
    })
    if (alreadyMember) {
      return res.status(409).json({ success: false, error: 'Этот пользователь уже в организации' })
    }

    // Dedup pending invites to the same address — without this, resending
    // (e.g. because the first email didn't arrive; there's no UI to view/
    // resend an existing invite yet) silently creates a second OrgInvite row
    // that both count against the seat-reservation check above and sends a
    // second, different acceptance link for the same person.
    const existingInvite = await prisma.orgInvite.findFirst({
      where: { orgId: org.id, email, acceptedAt: null, expiresAt: { gt: new Date() } }
    })
    if (existingInvite) {
      return res.status(409).json({ success: false, error: 'Приглашение на этот email уже отправлено и ещё действительно' })
    }

    const { token, tokenHash, expiresAt } = createInviteToken()
    const invite = await prisma.orgInvite.create({
      data: { orgId: org.id, email, role, tokenHash, invitedById: req.user.id, expiresAt }
    })

    await logOrgAudit(org.id, req.user.id, 'member.invite', { email, role })

    sendOrgInviteEmail({ email, orgName: org.name, inviterEmail: req.user.email, token })
      .catch(e => console.error('[email] org invite send failed:', e.message))

    res.json({ success: true, data: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt } })
  } catch (err) {
    console.error('Org invite error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания приглашения' })
  }
})

// ── POST /api/org/invites/:token/accept ──────────────────────────────
// Authenticated (the invitee must already have — or just have created — a
// Centrio account with a matching email) rather than public, so acceptance
// always ties to a real, logged-in user id, not just an email string.
router.post('/invites/:token/accept', acceptInviteLimiter, authMiddleware, async (req, res) => {
  try {
    const tokenHash = hashInviteToken(String(req.params.token || ''))
    const invite = await prisma.orgInvite.findUnique({ where: { tokenHash } })
    if (!invite) return res.status(404).json({ success: false, error: 'Приглашение не найдено' })
    if (invite.acceptedAt) return res.status(409).json({ success: false, error: 'Приглашение уже использовано' })
    if (invite.expiresAt < new Date()) return res.status(410).json({ success: false, error: 'Срок действия приглашения истёк' })

    // Re-read the requester fresh from the DB rather than trusting whatever
    // authMiddleware attached to req.user — we specifically need
    // emailVerified here, which isn't guaranteed to be on the JWT-derived
    // req.user shape used elsewhere in this codebase.
    const requester = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, emailVerified: true }
    })
    if (invite.email !== requester.email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Это приглашение выписано на другой email' })
    }
    // Without this, an attacker could register an unverified account under
    // someone else's (unowned) email and accept an invite meant for them —
    // and permanently squat that address, since /register 409s once any
    // account (verified or not) exists for it.
    if (!requester.emailVerified) {
      return res.status(403).json({ success: false, error: 'Сначала подтвердите email, затем откройте ссылку из письма ещё раз' })
    }

    const existingMembership = await prisma.orgMember.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' }
    })
    if (existingMembership) {
      return res.status(409).json({ success: false, error: 'Вы уже состоите в организации' })
    }

    const org = await prisma.organization.findUnique({ where: { id: invite.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    // The team's paid period must still be running, as for sending the invite (TEAM audit A5, 2026-11-08).
    if (!org.seatsExpiresAt || org.seatsExpiresAt <= new Date()) {
      return res.status(409).json({ success: false, error: 'Подписка команды закончилась. Попросите владельца продлить её.' })
    }
    const seatsUsed = await prisma.orgMember.count({ where: { orgId: org.id, status: 'ACTIVE' } })
    if (seatsUsed >= org.seatLimit) {
      return res.status(409).json({ success: false, error: 'В организации больше нет свободных мест' })
    }

    // A person removed earlier keeps a SUSPENDED row; inviting him back reactivates it instead of
    // hitting the unique (orgId, userId) constraint (TEAM audit A2, 2026-11-08).
    const strictMode = defaultStrictForJoin(new Date(), process.env.TEAM_STRICT_DEFAULT_FROM)
    await prisma.$transaction([
      prisma.orgMember.upsert({
        where: { orgId_userId: { orgId: org.id, userId: req.user.id } },
        create: { orgId: org.id, userId: req.user.id, role: invite.role, status: 'ACTIVE', strictMode },
        update: { role: invite.role, status: 'ACTIVE', joinedAt: new Date(), strictMode }
      }),
      prisma.orgInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
    ])

    await logOrgAudit(org.id, req.user.id, 'member.accept', { email: req.user.email, role: invite.role })

    res.json({ success: true, data: { orgId: org.id, orgName: org.name, role: invite.role } })
  } catch (err) {
    // Unique-constraint race on @@unique([orgId, userId]) — two accept
    // attempts (e.g. double-click) racing past the check above.
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Вы уже состоите в этой организации' })
    }
    console.error('Org invite accept error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка принятия приглашения' })
  }
})

// ── GET /api/org/invites/:token ───────────────────────────────────────
// Public (no auth) — needed so the invite-acceptance page and the register
// page can show/prefill the invited email BEFORE the visitor has an account
// or is logged in (added 2026-09-28, live request: "почта уже забита. И
// предупреждение, что менять её нельзя" — the email must be shown and
// locked on the registration form the invite link leads to). Safe to expose
// without auth: the token itself is the secret (high-entropy, single-use),
// and whoever holds it already received the invite email, so learning that
// email address back is not a new disclosure.
router.get('/invites/:token', async (req, res) => {
  try {
    const tokenHash = hashInviteToken(String(req.params.token || ''))
    const invite = await prisma.orgInvite.findUnique({
      where: { tokenHash },
      include: { organization: { select: { name: true } } }
    })
    if (!invite) return res.status(404).json({ success: false, error: 'Приглашение не найдено' })
    if (invite.acceptedAt) return res.status(409).json({ success: false, error: 'Приглашение уже использовано' })
    if (invite.expiresAt < new Date()) return res.status(410).json({ success: false, error: 'Срок действия приглашения истёк' })
    res.json({ success: true, data: { email: invite.email, orgName: invite.organization.name, role: invite.role } })
  } catch (err) {
    console.error('Org invite lookup error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения приглашения' })
  }
})

// ── GET /api/org/:orgId/invites ──────────────────────────────────────
// Pending (not yet accepted, not yet expired) invites — feeds the "Ждём
// принятия" list on the Members tab (added 2026-09-28, live request: sent-
// but-not-accepted invites should be visible and cancellable, not silently
// invisible after being sent).
router.get('/:orgId/invites', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const invites = await prisma.orgInvite.findMany({
      where: { orgId: req.params.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true }
    })
    res.json({ success: true, data: invites })
  } catch (err) {
    console.error('Org list invites error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения приглашений' })
  }
})

// ── DELETE /api/org/:orgId/invites/:inviteId ─────────────────────────
// Cancels a pending invite outright (deletes the row, rather than marking
// it e.g. "revoked") — its token becomes unusable the moment the row is
// gone (the accept endpoint looks it up by tokenHash and 404s), and it also
// immediately frees the seat the invite was reserving via the
// seatsUsed + pendingInvites check in POST /:orgId/invites above.
router.delete('/:orgId/invites/:inviteId', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const invite = await prisma.orgInvite.findUnique({ where: { id: req.params.inviteId } })
    if (!invite || invite.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Приглашение не найдено' })
    }
    if (invite.acceptedAt) {
      return res.status(409).json({ success: false, error: 'Приглашение уже принято, отменить нельзя' })
    }
    await prisma.orgInvite.delete({ where: { id: invite.id } })
    await logOrgAudit(req.params.orgId, req.user.id, 'member.invite_cancel', { email: invite.email })
    res.json({ success: true })
  } catch (err) {
    console.error('Org cancel invite error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка отмены приглашения' })
  }
})

// ── DELETE /api/org/:orgId/members/:userId ───────────────────────────
router.delete('/:orgId/members/:userId', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const target = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } }
    })
    if (!target || target.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: 'Участник не найден' })
    }
    if (target.role === 'OWNER') {
      return res.status(403).json({ success: false, error: 'Нельзя удалить владельца организации' })
    }
    // An ADMIN may remove MEMBERs but not other ADMINs — only the OWNER can.
    if (target.role === 'ADMIN' && req.orgMembership.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Только владелец может удалить администратора' })
    }

    // Work sign-ins on the person's computers are cleared: every device gets a wipe it can still
    // fetch with its own key after the membership is gone (TEAM control, 2026-11-08).
    await queueCommands({ orgId: req.params.orgId, userId: req.params.userId, kind: 'wipe', payload: { assignmentIds: 'all' }, createdById: req.user.id })

    await prisma.orgMember.update({
      where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
      data: { status: 'SUSPENDED' }
    })

    await logOrgAudit(req.params.orgId, req.user.id, 'member.remove', { userId: req.params.userId })

    res.json({ success: true })
  } catch (err) {
    console.error('Org member remove error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления участника' })
  }
})

// ── PATCH /api/org/:orgId/members/:userId ────────────────────────────
// Role changes are OWNER-only — an ADMIN promoting a MEMBER to ADMIN (or
// demoting a peer ADMIN) would let the admin set expand/contract itself
// without the owner's involvement, same rationale as the invite-role check.
//
// Also handles the "can add own messengers" permission toggle (team/
// page.tsx's per-member checkbox, `handleToggleCanAdd`) — added 2026-09-28,
// the frontend already sent `{ canAddOwnMessengers }` and even had an audit-
// log renderer for `member.canAddOwnMessengers` entries, but this endpoint
// only ever read `role` and 400'd on anything else, so the toggle never
// actually worked. Same OWNER-only gate as role changes for now — not
// touching who's allowed to call this, only what it accepts.
router.patch('/:orgId/members/:userId', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const hasRole = req.body?.role !== undefined
    const hasCanAdd = req.body?.canAddOwnMessengers !== undefined
    const hasStrict = req.body?.strictMode !== undefined
    // BUGFIX (2026-10-02): admins manage employees' messengers, so they may toggle 'can add own
    // messengers' for regular members (the team page already showed them the checkbox, but the
    // endpoint was owner-only and answered 403). Role changes stay owner-only.
    if (hasRole && req.orgMembership.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Менять роли может только владелец' })
    }
    if (!hasRole && !hasCanAdd && !hasStrict) {
      return res.status(400).json({ success: false, error: 'Нечего изменять' })
    }
    if (hasRole && !['ADMIN', 'MEMBER'].includes(req.body.role)) {
      return res.status(400).json({ success: false, error: 'Недопустимая роль' })
    }
    if (hasCanAdd && typeof req.body.canAddOwnMessengers !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Недопустимое значение' })
    }
    if (hasStrict && typeof req.body.strictMode !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Недопустимое значение' })
    }
    const target = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } }
    })
    if (!target || target.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: 'Участник не найден' })
    }
    if (target.role === 'OWNER') {
      return res.status(403).json({ success: false, error: 'Роль владельца нельзя изменить' })
    }
    if (req.orgMembership.role === 'ADMIN' && target.role !== 'MEMBER') {
      return res.status(403).json({ success: false, error: 'Администратор может менять настройки только у сотрудников' })
    }

    const data = {}
    if (hasRole) data.role = req.body.role
    if (hasCanAdd) data.canAddOwnMessengers = req.body.canAddOwnMessengers
    if (hasStrict) data.strictMode = req.body.strictMode

    await prisma.orgMember.update({
      where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
      data
    })

    if (hasRole) {
      await logOrgAudit(req.params.orgId, req.user.id, 'member.role', { userId: req.params.userId, role: req.body.role })
    }
    if (hasStrict) {
      await logOrgAudit(req.params.orgId, req.user.id, 'member.strict', { userId: req.params.userId, strictMode: req.body.strictMode })
    }
    if (hasCanAdd) {
      await logOrgAudit(req.params.orgId, req.user.id, 'member.canAddOwnMessengers', { userId: req.params.userId, canAddOwnMessengers: req.body.canAddOwnMessengers })
    }

    res.json({ success: true, data: { userId: req.params.userId, ...(hasRole ? { role: req.body.role } : {}), ...(hasCanAdd ? { canAddOwnMessengers: req.body.canAddOwnMessengers } : {}), ...(hasStrict ? { strictMode: req.body.strictMode } : {}) } })
  } catch (err) {
    console.error('Org member update error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка изменения роли' })
  }
})

// ── GET /api/org/:orgId/audit ─────────────────────────────────────────
router.get('/:orgId/audit', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const logs = await prisma.orgAuditLog.findMany({
      where: { orgId: req.params.orgId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
    res.json({ success: true, data: logs })
  } catch (err) {
    console.error('Org audit error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения журнала' })
  }
})

// ══════════════════════════════════════════════════════════════════════
// TEAM owner-control epic (2026-09-10) — shared VPN, forced theme, per-
// member messenger assignments, read-status stats. The desktop app
// (renderer/org-team.js) and the website's /team "Manage" tab were both
// built against these six routes, but the routes themselves were never
// actually written server-side — every call 404'd via the catch-all
// handler ("Маршрут не найден"), silently for the desktop app's
// fire-and-forget syncs and visibly for the website's save buttons. This
// block is the missing implementation; the Prisma models it reads/writes
// (Organization.vpnConfigName/vpnConfigLink/forcedSettingsJson,
// OrgMessengerAssignment, OrgMessengerStat) already existed.
// ══════════════════════════════════════════════════════════════════════

// ── GET /api/org/:orgId/vpn ────────────────────────────────────────────
router.get('/:orgId/vpn', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { vpnConfigName: true, vpnConfigLink: true }
    })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    const data = org.vpnConfigLink ? { name: org.vpnConfigName, link: org.vpnConfigLink } : null
    res.json({ success: true, data })
  } catch (err) {
    console.error('Org get vpn error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения VPN' })
  }
})

// ── PATCH /api/org/:orgId/vpn ──────────────────────────────────────────
// Body { name, link } — both null clears the shared VPN (see the website's
// handleClearVpn). OWNER-only: this is a shared config pushed to every
// member's desktop app automatically (org-team.js's syncSharedVpn), same
// trust level as forced settings below.
router.patch('/:orgId/vpn', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const name = req.body?.name != null ? String(req.body.name).trim().slice(0, 200) || null : null
    const link = req.body?.link != null ? String(req.body.link).trim().slice(0, 4000) || null : null

    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { vpnConfigName: link ? name : null, vpnConfigLink: link }
    })

    await logOrgAudit(req.params.orgId, req.user.id, 'vpn.update', { hasLink: Boolean(link) })

    res.json({ success: true, data: link ? { name, link } : null })
  } catch (err) {
    console.error('Org set vpn error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения VPN' })
  }
})

// ── GET /api/org/:orgId/settings ───────────────────────────────────────
router.get('/:orgId/settings', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { forcedSettingsJson: true }
    })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    res.json({ success: true, data: org.forcedSettingsJson ?? null })
  } catch (err) {
    console.error('Org get settings error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения настроек' })
  }
})

// ── PATCH /api/org/:orgId/settings ─────────────────────────────────────
// Body { settings } — replaces forcedSettingsJson wholesale (currently only
// { theme } is ever sent, from the website's theme selector; null clears
// it). OWNER-only, same rationale as VPN above.
router.patch('/:orgId/settings', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const settings = req.body?.settings ?? null
    if (settings !== null && (typeof settings !== 'object' || Array.isArray(settings))) {
      return res.status(400).json({ success: false, error: 'Некорректные настройки' })
    }

    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { forcedSettingsJson: settings ?? Prisma.JsonNull }
    })

    await logOrgAudit(req.params.orgId, req.user.id, 'settings.update', settings)

    res.json({ success: true, data: settings })
  } catch (err) {
    console.error('Org set settings error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения настроек' })
  }
})

// ── GET /api/org/:orgId/messenger-assignments ──────────────────────────
// OWNER/ADMIN see every assignment in the org (the website's Manage tab
// needs the full roster to render per-employee cards); a MEMBER sees only
// their own (the desktop app applies every row it gets back — see
// org-team.js's syncAssignments — so a member must never receive anyone
// else's).
router.get('/:orgId/messenger-assignments', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const isManager = req.orgMembership.role === 'OWNER' || req.orgMembership.role === 'ADMIN'
    const assignments = await prisma.orgMessengerAssignment.findMany({
      where: { orgId: req.params.orgId, ...(isManager ? {} : { userId: req.user.id }) },
      orderBy: { sortOrder: 'asc' }
    })
    // credentialAvailable: a saved login+password exists for this messenger (never the secret itself)
    const withCreds = assignments.length
      ? await prisma.orgCredential.findMany({ where: { orgId: req.params.orgId, assignmentId: { in: assignments.map(a => a.id) } }, select: { assignmentId: true }, distinct: ['assignmentId'] })
      : []
    const credSet = new Set(withCreds.map(c => c.assignmentId))
    res.json({ success: true, data: assignments.map(a => ({ ...a, credentialAvailable: credSet.has(a.id) })) })
  } catch (err) {
    console.error('Org get assignments error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения мессенджеров' })
  }
})

// ── POST /api/org/:orgId/messenger-assignments ─────────────────────────
router.post('/:orgId/messenger-assignments', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const userId = String(req.body?.userId || '')
    const name   = String(req.body?.name || '').trim().slice(0, 100)
    const url    = String(req.body?.url || '').trim().slice(0, 2000)
    const icon   = req.body?.icon ? String(req.body.icon).trim().slice(0, 500) : null
    const color  = req.body?.color ? String(req.body.color).trim().slice(0, 20) : null
    // Whether the employee's messenger must work through the VPN (default: yes). The owner/admin
    // decides; the desktop app applies it and the employee cannot override it.
    const useVpn = req.body?.useVpn === false ? false : true

    if (!userId || !name || !url) {
      return res.status(400).json({ success: false, error: 'Заполните сотрудника, название и адрес' })
    }
    if (!isAllowedAssignmentUrl(url)) {
      return res.status(400).json({ success: false, error: 'Адрес должен начинаться с https://' })
    }

    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: req.params.orgId, userId } }
    })
    if (!member || member.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: 'Сотрудник не найден в организации' })
    }

    if (member.role === 'OWNER') {
      return res.status(400).json({ success: false, error: 'Владельцу мессенджеры не назначаются — добавьте их в приложении' })
    }

    const count = await prisma.orgMessengerAssignment.count({ where: { orgId: req.params.orgId, userId } })

    const assignment = await prisma.orgMessengerAssignment.create({
      data: { orgId: req.params.orgId, userId, name, url, icon, color, useVpn, sortOrder: count }
    })

    await logOrgAudit(req.params.orgId, req.user.id, 'messenger.assign', { userId, name, useVpn })

    res.json({ success: true, data: assignment })
  } catch (err) {
    console.error('Org create assignment error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка назначения мессенджера' })
  }
})

// ── DELETE /api/org/:orgId/messenger-assignments/:id ───────────────────
router.delete('/:orgId/messenger-assignments/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const assignment = await prisma.orgMessengerAssignment.findUnique({ where: { id: req.params.id } })
    if (!assignment || assignment.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    }

    await prisma.$transaction([
      prisma.orgMessengerAssignment.delete({ where: { id: req.params.id } }),
      prisma.orgMessengerStat.deleteMany({ where: { orgId: req.params.orgId, messengerKey: req.params.id } })
    ])
    await logOrgAudit(req.params.orgId, req.user.id, 'messenger.unassign', { userId: assignment.userId, name: assignment.name })
    // the work sign-in of that messenger is cleared on the employee's computers (review I6)
    await queueCommands({ orgId: req.params.orgId, userId: assignment.userId, kind: 'wipe', payload: { assignmentIds: [assignment.id] }, createdById: req.user.id })

    res.json({ success: true })
  } catch (err) {
    console.error('Org delete assignment error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления мессенджера' })
  }
})

// ── Org custom link catalog (2026-09-28, live request: "клиентам можно
// давать свои собственные ссылки... создавать ссылки для перетягивания") —
// reusable org-level link templates (CRM, wiki, internal tools — anything
// that isn't one of the built-in messenger presets), separate from
// OrgMessengerAssignment (which is a per-employee assignment, not a
// reusable template). The website's Members tab renders these as
// draggable chips next to the built-in messenger presets; dragging one
// onto an employee card creates a regular OrgMessengerAssignment from it,
// same as dragging a preset does. ──────────────────────────────────────

// ── GET /api/org/:orgId/custom-links ────────────────────────────────
router.get('/:orgId/custom-links', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const links = await prisma.orgCustomLink.findMany({
      where: { orgId: req.params.orgId },
      orderBy: { createdAt: 'asc' }
    })
    res.json({ success: true, data: links })
  } catch (err) {
    console.error('Org get custom links error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения ссылок' })
  }
})

// ── POST /api/org/:orgId/custom-links ───────────────────────────────
router.post('/:orgId/custom-links', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 100)
    const url  = String(req.body?.url || '').trim().slice(0, 2000)
    if (!name || !url) {
      return res.status(400).json({ success: false, error: 'Укажите название и адрес' })
    }
    const link = await prisma.orgCustomLink.create({ data: { orgId: req.params.orgId, name, url } })
    await logOrgAudit(req.params.orgId, req.user.id, 'customlink.create', { name, url })
    res.json({ success: true, data: link })
  } catch (err) {
    console.error('Org create custom link error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания ссылки' })
  }
})

// ── DELETE /api/org/:orgId/custom-links/:id ─────────────────────────
router.delete('/:orgId/custom-links/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const link = await prisma.orgCustomLink.findUnique({ where: { id: req.params.id } })
    if (!link || link.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Ссылка не найдена' })
    }
    await prisma.orgCustomLink.delete({ where: { id: req.params.id } })
    await logOrgAudit(req.params.orgId, req.user.id, 'customlink.delete', { name: link.name })
    res.json({ success: true })
  } catch (err) {
    console.error('Org delete custom link error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления ссылки' })
  }
})

// ── GET /api/org/:orgId/messenger-stats ────────────────────────────────
// OWNER/ADMIN only (the website's "Manage" and "Overview" tabs' per-
// employee read-status cards) — a MEMBER doesn't need to see anyone's
// read/unread counts, including their own (the desktop app never reads
// this back, only pushes to it).
router.get('/:orgId/messenger-stats', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const stats = await prisma.orgMessengerStat.findMany({ where: { orgId: req.params.orgId } })
    res.json({ success: true, data: stats })
  } catch (err) {
    console.error('Org get stats error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения статистики' })
  }
})

// ── POST /api/org/:orgId/messenger-stats ───────────────────────────────
// Body { stats: [{ messengerKey, messengerName, unreadCount, lastReadAt?,
// lastMessageAt? }] } — pushed by every member's desktop app roughly every
// 5 minutes (org-team.js's pushStats), always for their OWN userId. Never
// content, just read/unread counts (see api.js's comment on
// orgPushMessengerStats).
router.post('/:orgId/messenger-stats', authMiddleware, orgStatsPushLimiter, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const stats = Array.isArray(req.body?.stats) ? req.body.stats : []
    if (stats.length === 0) return res.json({ success: true })

    // SECURITY/CORRECTNESS (2026-09-28): this used to accept and store
    // whatever messengerKey/unreadCount the client sent, with no check that
    // the key corresponded to a real org-assigned messenger for this user.
    // The desktop client (renderer/org-team.js's buildStatsPayload) pushes
    // stats for EVERY active messenger, personal ones included — so an
    // employee's private WhatsApp/Telegram unread count was silently
    // counted into the org's "unread"/"engagement" totals and visible to
    // the owner/admin in the Manage tab's per-messenger list. Now only
    // accepting keys that match a real OrgMessengerAssignment.id owned by
    // this user in this org — assignment ids are what buildStatsPayload
    // actually sends as messengerKey for org-assigned messengers (its own
    // `id` field with the `org:` prefix stripped).
    const assignedIds = new Set(
      (await prisma.orgMessengerAssignment.findMany({
        where: { orgId: req.params.orgId, userId: req.user.id },
        select: { id: true }
      })).map(a => a.id)
    )

    // "Клиент ждёт ответа" (2026-09-30): the server — not the client —
    // stamps when unread went 0 → >0 (waitingSince), keeps it while unread
    // stays >0, and clears it plus the alert counters once everything is
    // read. See lib/org-alerts.js for how it's consumed.
    const previous = new Map(
      (await prisma.orgMessengerStat.findMany({
        where: { orgId: req.params.orgId, userId: req.user.id },
        select: { messengerKey: true, unreadCount: true, waitingSince: true, notLoggedInSince: true }
      })).map(p => [p.messengerKey, p])
    )
    const now = new Date()
    const cleared = []

    const ops = stats.slice(0, 100).map(s => {
      const messengerKey = String(s?.messengerKey || '').slice(0, 200)
      if (!messengerKey || !assignedIds.has(messengerKey)) return null
      const unreadCount = Number.isFinite(s?.unreadCount) ? Math.max(0, Math.trunc(s.unreadCount)) : 0
      const prev = previous.get(messengerKey)
      const stillWaiting = unreadCount > 0 && prev && prev.unreadCount > 0 && prev.waitingSince
      // A client who waited is now read: count the reaction time (only while signed in).
      if (unreadCount === 0 && prev && prev.unreadCount > 0 && prev.waitingSince && s?.loginState !== 'out') cleared.push({ waitingSince: prev.waitingSince })
      const waitingFields = unreadCount === 0
        ? { waitingSince: null, alertSentAt: null, alertCount: 0 }
        : stillWaiting
          ? {}
          : { waitingSince: now, alertSentAt: null, alertCount: 0 }
      // Sign-in state reported by the app ("in" / "out" / "unknown"). While the employee is NOT signed in
      // the messenger must never count as "read": the unread number is 0 only because nothing loaded.
      const loginState = s?.loginState === 'in' || s?.loginState === 'out' ? s.loginState : null
      const loginFields = loginState === 'in'
        ? { loginState: 'in', loginStateAt: now, lastLoggedInAt: now, notLoggedInSince: null, loginAlertSentAt: null, loginAlertCount: 0 }
        : loginState === 'out'
          ? { loginState: 'out', loginStateAt: now, notLoggedInSince: (prev && prev.notLoggedInSince) || now }
          : {}
      const data = {
        messengerName: String(s?.messengerName || '').slice(0, 200),
        unreadCount,
        lastReadAt:    loginState === 'out' ? undefined : (s?.lastReadAt ? new Date(s.lastReadAt) : undefined),
        lastMessageAt: s?.lastMessageAt ? new Date(s.lastMessageAt) : undefined,
        ...waitingFields,
        ...loginFields
      }
      return prisma.orgMessengerStat.upsert({
        where: { orgId_userId_messengerKey: { orgId: req.params.orgId, userId: req.user.id, messengerKey } },
        create: { orgId: req.params.orgId, userId: req.user.id, messengerKey, ...data },
        update: data
      })
    }).filter(Boolean)

    await Promise.all(ops)
    await recordReactions(req.params.orgId, req.user.id, cleared, now).catch((e) => console.error('[org] reactions failed:', e.message))
    res.json({ success: true })
  } catch (err) {
    console.error('Org push stats error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения статистики' })
  }
})

// ── Быстрые ответы команды (2026-09-30) ─────────────────────────────────
// Owner/admin-managed reply templates every member sees read-only in the
// desktop app's Quick Replies panel (renderer/quick-replies-bind.js). Plain
// text only — the app copies them to the clipboard and never renders them
// as HTML — but still stripped of control characters and length-capped.
function sanitizeQuickReplyText(value, max) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max)
}

function parseQuickReplyBody(body) {
  const title = sanitizeQuickReplyText(body?.title, QUICK_REPLY_TITLE_MAX)
  const text  = sanitizeQuickReplyText(body?.text, QUICK_REPLY_TEXT_MAX + 1)
  if (!title) return { error: 'Введите название ответа' }
  if (!text) return { error: 'Введите текст ответа' }
  if (text.length > QUICK_REPLY_TEXT_MAX) return { error: `Текст ответа — не больше ${QUICK_REPLY_TEXT_MAX} символов` }
  return { title, text }
}

router.get('/:orgId/quick-replies', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const replies = await prisma.orgQuickReply.findMany({
      where: { orgId: req.params.orgId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, text: true, sortOrder: true, updatedAt: true }
    })
    res.json({ success: true, data: replies })
  } catch (err) {
    console.error('Org get quick replies error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения быстрых ответов' })
  }
})

router.post('/:orgId/quick-replies', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const parsed = parseQuickReplyBody(req.body)
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })

    const [count, maxOrder] = await Promise.all([
      prisma.orgQuickReply.count({ where: { orgId: req.params.orgId } }),
      prisma.orgQuickReply.aggregate({ where: { orgId: req.params.orgId }, _max: { sortOrder: true } })
    ])
    if (count >= QUICK_REPLIES_PER_ORG) {
      return res.status(409).json({ success: false, error: `Максимум ${QUICK_REPLIES_PER_ORG} быстрых ответов на команду` })
    }

    const reply = await prisma.orgQuickReply.create({
      data: { orgId: req.params.orgId, title: parsed.title, text: parsed.text, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      select: { id: true, title: true, text: true, sortOrder: true, updatedAt: true }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'quickReply.create', { title: parsed.title })
    res.json({ success: true, data: reply })
  } catch (err) {
    console.error('Org create quick reply error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения быстрого ответа' })
  }
})

router.patch('/:orgId/quick-replies/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const parsed = parseQuickReplyBody(req.body)
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })

    const existing = await prisma.orgQuickReply.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!existing) return res.status(404).json({ success: false, error: 'Быстрый ответ не найден' })

    const reply = await prisma.orgQuickReply.update({
      where: { id: existing.id },
      data: { title: parsed.title, text: parsed.text },
      select: { id: true, title: true, text: true, sortOrder: true, updatedAt: true }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'quickReply.update', { title: parsed.title })
    res.json({ success: true, data: reply })
  } catch (err) {
    console.error('Org update quick reply error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения быстрого ответа' })
  }
})

router.delete('/:orgId/quick-replies/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const deleted = await prisma.orgQuickReply.deleteMany({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (deleted.count === 0) return res.status(404).json({ success: false, error: 'Быстрый ответ не найден' })
    await logOrgAudit(req.params.orgId, req.user.id, 'quickReply.delete', null)
    res.json({ success: true })
  } catch (err) {
    console.error('Org delete quick reply error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления быстрого ответа' })
  }
})

// ── Оповещения «Клиент ждёт ответа» (2026-09-30) ────────────────────────
// Settings live in Organization.alertSettingsJson, always passed through
// normalizeAlertSettings() on the way in AND out. The Telegram chat id is
// never client-writable — it's only set by the bot webhook after the owner
// opens a one-time /start link (routes/telegram-webhook.js).
function alertSettingsResponse(org) {
  return {
    ...normalizeAlertSettings(org.alertSettingsJson),
    telegramLinked: !!org.alertTelegramChatId,
    telegramName: org.alertTelegramName || null,
    ownerEmail: org.owner?.email || null
  }
}

async function loadOrgForAlerts(orgId) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, alertSettingsJson: true, alertTelegramChatId: true, alertTelegramName: true,
      owner: { select: { email: true } }
    }
  })
}

router.get('/:orgId/alert-settings', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const org = await loadOrgForAlerts(req.params.orgId)
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    res.json({ success: true, data: alertSettingsResponse(org) })
  } catch (err) {
    console.error('Org get alert settings error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения настроек оповещений' })
  }
})

router.patch('/:orgId/alert-settings', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const settings = normalizeAlertSettings(req.body)

    // Alerts may only be emailed to people already tied to this org (owner,
    // billing address, active members) — an arbitrary address would turn the
    // "send test" button into a relay for owner-controlled text.
    if (settings.emailTo) {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.orgId },
        select: {
          billingEmail: true,
          owner: { select: { email: true } },
          members: { where: { status: 'ACTIVE' }, select: { user: { select: { email: true } } } }
        }
      })
      const allowed = new Set([
        org?.owner?.email, org?.billingEmail, ...(org?.members || []).map(m => m.user?.email)
      ].filter(Boolean).map(e => e.toLowerCase()))
      if (!allowed.has(settings.emailTo.toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Оповещения можно отправлять только на почту владельца или сотрудника команды' })
      }
    }

    // Member filter may only reference real members of THIS org.
    if (settings.memberUserIds.length > 0) {
      const valid = new Set((await prisma.orgMember.findMany({
        where: { orgId: req.params.orgId, userId: { in: settings.memberUserIds } },
        select: { userId: true }
      })).map(m => m.userId))
      settings.memberUserIds = settings.memberUserIds.filter(id => valid.has(id))
    }

    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { alertSettingsJson: settings }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'alerts.update', { enabled: settings.enabled })

    const org = await loadOrgForAlerts(req.params.orgId)
    res.json({ success: true, data: alertSettingsResponse(org) })
  } catch (err) {
    console.error('Org update alert settings error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения настроек оповещений' })
  }
})

router.post('/:orgId/alert-settings/telegram-link', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const botUsername = await getBotUsername()
    if (!botUsername) return res.status(503).json({ success: false, error: 'Telegram-бот сейчас недоступен, попробуйте позже' })

    const code = crypto.randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS)
    await prisma.$transaction([
      prisma.orgAlertLinkCode.deleteMany({ where: { orgId: req.params.orgId } }),
      prisma.orgAlertLinkCode.create({
        data: { orgId: req.params.orgId, codeHash: hashInviteToken(code), expiresAt }
      })
    ])
    res.json({ success: true, data: { url: `https://t.me/${botUsername}?start=alert_${code}`, expiresAt } })
  } catch (err) {
    console.error('Org telegram link error:', err.message)
    res.status(500).json({ success: false, error: 'Не удалось создать ссылку для Telegram' })
  }
})

router.delete('/:orgId/alert-settings/telegram-link', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { alertTelegramChatId: null, alertTelegramName: null }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'alerts.telegramUnlink', null)
    const org = await loadOrgForAlerts(req.params.orgId)
    res.json({ success: true, data: alertSettingsResponse(org) })
  } catch (err) {
    console.error('Org telegram unlink error:', err.message)
    res.status(500).json({ success: false, error: 'Не удалось отключить Telegram' })
  }
})

router.post('/:orgId/alert-settings/test', alertTestLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const result = await sendTestAlert(req.params.orgId)
    if (!result) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Org alert test error:', err.message)
    res.status(500).json({ success: false, error: 'Не удалось отправить проверку' })
  }
})

// Feed for the owner's/admin's own desktop app ("В приложение Centrio"
// channel) and the website's alert history. `after` is an ISO timestamp;
// returns at most 50 newest-first. Returns channelEnabled so the desktop app
// knows whether to surface them at all.
router.get('/:orgId/alerts', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const afterRaw = req.query.after ? new Date(String(req.query.after)) : null
    const after = afterRaw && !isNaN(afterRaw) ? afterRaw : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [org, alerts] = await Promise.all([
      prisma.organization.findUnique({ where: { id: req.params.orgId }, select: { alertSettingsJson: true } }),
      prisma.orgAlert.findMany({
        where: { orgId: req.params.orgId, createdAt: { gt: after } },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ])
    const userIds = [...new Set(alerts.map(a => a.userId))]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : []
    const nameById = new Map(users.map(u => [u.id, (u.name && u.name.trim()) || u.email]))

    const settings = normalizeAlertSettings(org?.alertSettingsJson)
    res.json({
      success: true,
      data: {
        channelEnabled: settings.enabled && settings.channels.app,
        items: alerts.map(a => ({
          id: a.id,
          memberName: nameById.get(a.userId) || 'Сотрудник',
          messengerName: a.messengerName,
          waitedMinutes: a.waitedMinutes,
          kind: a.kind,
          waitingSince: a.waitingSince,
          createdAt: a.createdAt
        }))
      }
    })
  } catch (err) {
    console.error('Org get alerts error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения оповещений' })
  }
})

// ── POST /api/org/:orgId/seats/create-payment ─────────────────────────
// Purchases additional seats (or the initial paid batch once the free/trial
// seat count is exceeded — trial handling itself is out of scope for Phase 1
// and is left as an open question in the plan, §11). OWNER-only: seat
// purchases are a billing action, ADMIN is an operational role, not a
// billing one.
router.post('/:orgId/seats/create-payment', seatPaymentLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const period = req.body?.period === 'year' ? 'year' : 'month'
    const cfg = SEAT_PLANS[period]

    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    const order = planSeatOrder(org, req.body, { minSeats: MIN_SEATS, maxSeats: MAX_SEATS_SELF_SERVICE })
    if (order.error) return res.status(400).json({ success: false, error: order.error })
    const seats = order.seats
    // adding seats mid-period is billed at the monthly rate, prorated by the days left
    const unit = order.mode === 'add' ? parseFloat(SEAT_PLANS.month.pricePerSeat) : parseFloat(cfg.pricePerSeat)
    const totalAmount = Math.max(1, Math.round(unit * seats * order.factor * 100) / 100).toFixed(2)
    const ikey = uuidv4()

    const { data: yk } = await axios.post(`${YK_API}/payments`, {
      amount: { value: totalAmount, currency: 'RUB' },
      // Phase 1 MVP simplification: one org per user (see lib/org.js), so the
      // self-service console is a single flat /team page — no need to encode
      // org.slug into the redirect (avoids a dead link if this ever pointed at
      // a route that doesn't actually exist as a dynamic segment).
      confirmation: { type: 'redirect', return_url: `${FRONT}/team?payment=success` },
      capture: true,
      description: `${cfg.label} × ${seats}`,
      metadata: { orgId: org.id, userId: req.user.id, seats, period, months: cfg.months, mode: order.mode },
      receipt: {
        customer: { email: req.user.email },
        items: [{
          description: `${cfg.label} × ${seats}`,
          quantity: '1.00',
          amount: { value: totalAmount, currency: 'RUB' },
          vat_code: 1,
          payment_mode: 'full_payment',
          payment_subject: 'service'
        }]
      }
    }, {
      auth: ykAuth(),
      headers: { 'Idempotence-Key': ikey }
    })

    await prisma.payment.create({
      data: {
        userId: req.user.id,
        amount: parseFloat(totalAmount),
        currency: 'RUB',
        status: 'PENDING',
        provider: 'yookassa',
        providerPayId: yk.id,
        plan: 'TEAM',
        months: cfg.months,
        orgId: org.id,
        seats,
        days: order.days
      }
    })

    res.json({ success: true, data: { paymentId: yk.id, confirmationUrl: yk.confirmation.confirmation_url } })
  } catch (err) {
    console.error('Org seat payment create error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа' })
  }
})

// ── POST /api/org/:orgId/seats/create-payment-fride ─────────────────────
// EU/US card alternative to the YooKassa endpoint above — same seat-count
// validation and OWNER-only gate, billed in EUR via FRIDE instead of RUB
// via YooKassa. Activation happens in payments-server.js's EXISTING
// /api/payments/fride-webhook (not a second, separate webhook endpoint
// here) — see that handler's branch on payment.orgId. Deliberately not
// mirroring the YooKassa endpoint's own GET .../status/:paymentId polling
// fallback: personal Pro's FRIDE integration has never had one either (it
// relies on the webhook alone), so this doesn't introduce a new pattern,
// just follows the one already proven for FRIDE specifically.
router.post('/:orgId/seats/create-payment-fride', seatPaymentLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    if (!FRIDE_MERCHANT_ID) return res.status(503).json({ success: false, error: 'FRIDE не настроен' })
    const period = req.body?.period === 'year' ? 'year' : 'month'
    const cfg = FRIDE_SEAT_PLANS[period]

    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    const order = planSeatOrder(org, req.body, { minSeats: MIN_SEATS, maxSeats: MAX_SEATS_SELF_SERVICE })
    if (order.error) return res.status(400).json({ success: false, error: order.error })
    const seats = order.seats

    const orderId = uuidv4()
    const unit = order.mode === 'add' ? parseFloat(FRIDE_SEAT_PLANS.month.price) : parseFloat(cfg.price)
    const totalAmount = Math.max(1, Math.round(unit * seats * order.factor))

    const { data: fr } = await axios.post(`${FRIDE_API}/invoices/create`, {
      merchant_id: FRIDE_MERCHANT_ID,
      amount: totalAmount,
      currency: 'RUB',
      order_id: orderId,
      description: `${cfg.label} × ${seats}`,
      success_url: `${FRONT}/team?payment=success`,
      fail_url: `${FRONT}/team?payment=fail`
    }, {
      headers: { 'X-Api-Key': FRIDE_API_KEY, 'Content-Type': 'application/json' }
    })

    // CORRECTNESS (2026-09-29, found while adding org-payment history to
    // CentrioAdmin's Team detail screen): the `currency: 'RUB'` a few lines
    // up is FRIDE's OWN API requirement for the invoice-create call (that
    // provider's quirk — see FRIDE_SEAT_PLANS comment), unrelated to what
    // WE store in our own Payment row. Our own bookkeeping should say what
    // was actually charged — EUR. (payments-server.js's personal-Pro
    // FRIDE flow still stores 'RUB' here too, an existing quirk this
    // change does not touch — flagged separately rather than silently
    // "fixed" on a live, working flow nobody asked to change.)
    await prisma.payment.create({
      data: {
        userId: req.user.id,
        amount: totalAmount,
        currency: 'EUR',
        status: 'PENDING',
        provider: 'fride',
        providerPayId: fr.invoice_id || orderId,
        plan: 'TEAM',
        months: cfg.months,
        orgId: org.id,
        seats,
        days: order.days
      }
    })

    res.json({ success: true, data: { paymentUrl: fr.payment_url || fr.url, invoiceId: fr.invoice_id } })
  } catch (err) {
    console.error('Org seat FRIDE payment create error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа FRIDE' })
  }
})

// ── GET /api/org/:orgId/seats/status/:paymentId ───────────────────────
// Fallback polling endpoint for the seat-purchase confirmation redirect
// (team-server.tsx), mirroring payments-server.js's GET /status/:paymentId —
// works even if the webhook below never fires (see the operational-blocker
// comment on that route: which URL YooKassa calls for this shop is a
// dashboard-level setting this session couldn't configure).
router.get('/:orgId/seats/status/:paymentId', authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { providerPayId: req.params.paymentId, orgId: req.params.orgId }
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Платёж не найден' })

    const { data: yk } = await axios.get(`${YK_API}/payments/${req.params.paymentId}`, { auth: ykAuth() })

    // Conditional update (not read-status-then-write): this poll endpoint and
    // the webhook below can both observe "not yet SUCCEEDED" and race to
    // credit seats twice for one payment. Flipping the status is the atomicity
    // boundary — only the request whose updateMany actually matched a row
    // (count === 1) proceeds to credit seats; a concurrent loser sees count
    // === 0 and treats it as already-handled.
    if (yk.status === 'succeeded') {
      const claim = await prisma.payment.updateMany({
        where: { id: payment.id, status: { not: 'SUCCEEDED' } },
        data: { status: 'SUCCEEDED' }
      })
      if (claim.count === 0) {
        return res.json({ success: true, data: { ykStatus: yk.status } })
      }

      await creditSeatPayment(payment, yk, 'yookassa')
    }

    res.json({ success: true, data: { ykStatus: yk.status } })
  } catch (err) {
    console.error('Org seat status error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка проверки статуса' })
  }
})

// ── POST /api/org/seats/webhook ───────────────────────────────────────
// Dedicated webhook for seat payments, kept separate from
// payments-server.js's /api/payments/webhook (personal Pro payments) rather
// than folding org handling into that already-audited, security-sensitive
// route — this endpoint only ever touches Organization rows, never
// User.plan directly.
//
// OPERATIONAL BLOCKER (see Obsidian journal): which URL YooKassa actually
// calls is a merchant-account-level dashboard setting, not something this
// code controls. If seat payments and personal payments share one YooKassa
// shop, YooKassa will only be configured with ONE webhook URL — routing
// orgId-tagged events to this endpoint vs. payments-server.js's endpoint
// needs to be decided and configured in the YooKassa dashboard (production
// access required, unavailable in this environment/session) before this
// endpoint receives any real traffic. Until then, GET /api/org/.../seats
// status can still be polled the same way payments-server.js's
// GET /status/:paymentId does, as a fallback that doesn't depend on webhook
// delivery at all.
router.post('/seats/webhook', orgWebhookLimiter, async (req, res) => {
  try {
    const { event, object: yk } = req.body || {}
    if (!yk?.id) return res.status(400).json({ error: 'Bad payload' })

    const payment = await prisma.payment.findUnique({ where: { providerPayId: yk.id } })
    if (!payment || !payment.orgId) {
      // Not a seat payment — nothing for this endpoint to do (personal
      // payments are handled exclusively by payments-server.js).
      return res.json({ ok: true, ignored: true })
    }

    if (event === 'payment.succeeded') {
      // Re-verify against YooKassa itself before trusting the webhook body —
      // same rationale as the identical check in payments-server.js's
      // webhook (client-visible paymentId, so a forged body must not be
      // trusted at face value).
      const { data: ykStatus } = await axios.get(`${YK_API}/payments/${yk.id}`, { auth: ykAuth() })
      if (ykStatus.status !== 'succeeded') {
        console.warn(`[org webhook] payment ${yk.id} claims succeeded but YooKassa reports '${ykStatus.status}' — ignoring`)
        return res.status(409).json({ error: 'Status mismatch' })
      }
      // Conditional update, not read-then-write: this webhook can be
      // delivered more than once (YooKassa retries), and can race against the
      // GET .../seats/status/:paymentId poll from team-server.tsx hitting the
      // same payment at the same time. Flipping the status is the atomicity
      // boundary — only the caller whose updateMany actually matched a row
      // (count === 1) proceeds to credit seats; everyone else treats it as
      // already-processed instead of double-crediting.
      const claim = await prisma.payment.updateMany({
        where: { providerPayId: yk.id, status: { not: 'SUCCEEDED' } },
        data: { status: 'SUCCEEDED' }
      })
      if (claim.count === 0) {
        return res.json({ ok: true, alreadyProcessed: true })
      }

      await creditSeatPayment(payment, ykStatus, 'yookassa')
    }

    if (event === 'payment.canceled') {
      await prisma.payment.updateMany({ where: { providerPayId: yk.id }, data: { status: 'CANCELLED' } })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Org webhook error:', err.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

// ── Задачи сотрудникам (2026-10-01, TEAM) ───────────────────────────────
// Owner/admin creates a task for a member; it appears in that member's
// Tasks panel in the desktop app ("От руководителя") with a red badge until
// seen. Members can only mark their own tasks done / seen. Plain text only.
const TASK_TITLE_MAX = 160
const TASK_NOTES_MAX = 2000
const TASKS_PER_ORG_OPEN = 500
const TASK_PRIORITIES = new Set(['NORMAL', 'HIGH'])
const TASK_SELECT = {
  id: true, assigneeId: true, createdById: true, title: true, notes: true, priority: true,
  status: true, dueAt: true, doneAt: true, seenAt: true, createdAt: true, updatedAt: true
}

function parseTaskBody(body, { partial }) {
  const out = {}
  if (!partial || body?.title !== undefined) {
    const title = sanitizeQuickReplyText(body?.title, TASK_TITLE_MAX).replace(/\n+/g, ' ')
    if (!title) return { error: 'Введите название задачи' }
    out.title = title
  }
  if (!partial || body?.notes !== undefined) {
    out.notes = sanitizeQuickReplyText(body?.notes, TASK_NOTES_MAX) || null
  }
  if (!partial || body?.priority !== undefined) {
    const priority = String(body?.priority || 'NORMAL').toUpperCase()
    if (!TASK_PRIORITIES.has(priority)) return { error: 'Неверный приоритет' }
    out.priority = priority
  }
  if (!partial || body?.dueAt !== undefined) {
    if (body?.dueAt === null || body?.dueAt === '' || body?.dueAt === undefined) out.dueAt = null
    else {
      const d = new Date(body.dueAt)
      if (Number.isNaN(d.getTime())) return { error: 'Неверный срок' }
      out.dueAt = d
    }
  }
  return out
}

const TASK_COMMENT_MAX = 1000
const TASK_COMMENTS_PER_TASK = 200

async function decorateTasks(tasks) {
  const taskIds = tasks.map(t => t.id)
  const [counts, latest] = taskIds.length
    ? await Promise.all([
        prisma.orgTaskComment.groupBy({ by: ['taskId'], where: { taskId: { in: taskIds } }, _count: { _all: true } }),
        prisma.orgTaskComment.findMany({ where: { taskId: { in: taskIds } }, orderBy: { createdAt: 'desc' }, distinct: ['taskId'], select: { taskId: true, authorId: true, body: true, createdAt: true } })
      ])
    : [[], []]
  const countOf = Object.fromEntries(counts.map(c => [c.taskId, c._count._all]))
  const lastOf = Object.fromEntries(latest.map(c => [c.taskId, c]))
  const ids = [...new Set([...tasks.flatMap(t => [t.assigneeId, t.createdById]), ...latest.map(c => c.authorId)])]
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : []
  const nameOf = Object.fromEntries(users.map(u => [u.id, u.name || u.email || '—']))
  return tasks.map(t => {
    const last = lastOf[t.id]
    return {
      ...t,
      assigneeName: nameOf[t.assigneeId] || '—',
      createdByName: nameOf[t.createdById] || '—',
      commentCount: countOf[t.id] || 0,
      lastComment: last ? { authorId: last.authorId, authorName: nameOf[last.authorId] || '—', body: last.body.slice(0, 160), at: last.createdAt } : null
    }
  })
}

async function findAccessibleTask(req) {
  const manager = ['OWNER', 'ADMIN'].includes(req.orgMembership?.role)
  const task = await prisma.orgTask.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
  if (!task || (!manager && task.assigneeId !== req.user.id)) return null
  return task
}

router.get('/:orgId/tasks/:id/comments', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const task = await findAccessibleTask(req)
    if (!task) return res.status(404).json({ success: false, error: 'Задача не найдена' })
    const comments = await prisma.orgTaskComment.findMany({
      where: { taskId: task.id }, orderBy: { createdAt: 'asc' }, take: TASK_COMMENTS_PER_TASK,
      select: { id: true, authorId: true, body: true, createdAt: true }
    })
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(comments.map(c => c.authorId))] } }, select: { id: true, name: true, email: true } })
    const nameOf = Object.fromEntries(users.map(u => [u.id, u.name || u.email || '—']))
    res.json({ success: true, data: comments.map(c => ({ ...c, authorName: nameOf[c.authorId] || '—' })) })
  } catch (err) {
    console.error('Org get task comments error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения комментариев' })
  }
})

router.post('/:orgId/tasks/:id/comments', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const task = await findAccessibleTask(req)
    if (!task) return res.status(404).json({ success: false, error: 'Задача не найдена' })
    const body = sanitizeQuickReplyText(req.body?.body, TASK_COMMENT_MAX)
    if (!body) return res.status(400).json({ success: false, error: 'Введите комментарий' })
    const count = await prisma.orgTaskComment.count({ where: { taskId: task.id } })
    if (count >= TASK_COMMENTS_PER_TASK) return res.status(409).json({ success: false, error: 'Слишком много комментариев к задаче' })
    const comment = await prisma.orgTaskComment.create({
      data: { taskId: task.id, authorId: req.user.id, body },
      select: { id: true, authorId: true, body: true, createdAt: true }
    })
    const author = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } })
    res.json({ success: true, data: { ...comment, authorName: author?.name || author?.email || '—' } })
  } catch (err) {
    console.error('Org create task comment error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения комментария' })
  }
})

router.get('/:orgId/tasks', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const manager = ['OWNER', 'ADMIN'].includes(req.orgMembership?.role)
    const where = { orgId: req.params.orgId }
    if (!manager) where.assigneeId = req.user.id
    else if (req.query.assigneeId) where.assigneeId = String(req.query.assigneeId)
    if (req.query.status === 'OPEN' || req.query.status === 'DONE') where.status = req.query.status
    const tasks = await prisma.orgTask.findMany({
      where, select: TASK_SELECT, take: 500,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    })
    const data = await decorateTasks(tasks)
    res.json({ success: true, data, unseen: data.filter(t => t.assigneeId === req.user.id && !t.seenAt && t.status === 'OPEN').length })
  } catch (err) {
    console.error('Org get tasks error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения задач' })
  }
})

router.post('/:orgId/tasks', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const parsed = parseTaskBody(req.body, { partial: false })
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })
    const assigneeId = String(req.body?.assigneeId || '')
    const member = await prisma.orgMember.findFirst({ where: { orgId: req.params.orgId, userId: assigneeId, status: 'ACTIVE' } })
    if (!member) return res.status(400).json({ success: false, error: 'Сотрудник не найден в команде' })
    const open = await prisma.orgTask.count({ where: { orgId: req.params.orgId, status: 'OPEN' } })
    if (open >= TASKS_PER_ORG_OPEN) return res.status(409).json({ success: false, error: `Максимум ${TASKS_PER_ORG_OPEN} открытых задач` })
    const task = await prisma.orgTask.create({
      data: { orgId: req.params.orgId, assigneeId, createdById: req.user.id, ...parsed },
      select: TASK_SELECT
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'task.create', { title: parsed.title, assigneeId })
    const [data] = await decorateTasks([task])
    res.json({ success: true, data })
  } catch (err) {
    console.error('Org create task error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания задачи' })
  }
})

// Employees mark their own unseen tasks as seen (clears the red badge).
router.post('/:orgId/tasks/seen', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    await prisma.orgTask.updateMany({
      where: { orgId: req.params.orgId, assigneeId: req.user.id, seenAt: null },
      data: { seenAt: new Date() }
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Org seen tasks error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка' })
  }
})

router.patch('/:orgId/tasks/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const manager = ['OWNER', 'ADMIN'].includes(req.orgMembership?.role)
    const existing = await prisma.orgTask.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!existing || (!manager && existing.assigneeId !== req.user.id)) {
      return res.status(404).json({ success: false, error: 'Задача не найдена' })
    }
    const data = {}
    if (manager) {
      const parsed = parseTaskBody(req.body, { partial: true })
      if (parsed.error) return res.status(400).json({ success: false, error: parsed.error })
      Object.assign(data, parsed)
      if (req.body?.assigneeId && req.body.assigneeId !== existing.assigneeId) {
        const member = await prisma.orgMember.findFirst({ where: { orgId: req.params.orgId, userId: String(req.body.assigneeId), status: 'ACTIVE' } })
        if (!member) return res.status(400).json({ success: false, error: 'Сотрудник не найден в команде' })
        data.assigneeId = member.userId
        data.seenAt = null
      }
    }
    if (req.body?.status === 'DONE' || req.body?.status === 'OPEN') {
      data.status = req.body.status
      data.doneAt = req.body.status === 'DONE' ? new Date() : null
      if (req.body.status === 'DONE' && !existing.seenAt) data.seenAt = new Date()
    }
    const task = await prisma.orgTask.update({ where: { id: existing.id }, data, select: TASK_SELECT })
    const resultNote = req.body?.status === 'DONE' ? sanitizeQuickReplyText(req.body?.comment, TASK_COMMENT_MAX) : ''
    if (resultNote) {
      await prisma.orgTaskComment.create({ data: { taskId: existing.id, authorId: req.user.id, body: resultNote } })
    }
    const [out] = await decorateTasks([task])
    res.json({ success: true, data: out })
  } catch (err) {
    console.error('Org update task error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения задачи' })
  }
})

router.delete('/:orgId/tasks/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const deleted = await prisma.orgTask.deleteMany({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (deleted.count === 0) return res.status(404).json({ success: false, error: 'Задача не найдена' })
    await logOrgAudit(req.params.orgId, req.user.id, 'task.delete', null)
    res.json({ success: true })
  } catch (err) {
    console.error('Org delete task error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления задачи' })
  }
})

// ── Папки и пространства для сотрудников (2026-10-02, TEAM) ─────────────
// The owner/admin builds a structure (workspaces -> folders) for one employee
// and puts the employee's assigned messengers into the folders. The employee
// app shows it as managed (read-only) next to their own folders.
const STRUCTURE_NAME_MAX = 40
const FOLDERS_PER_USER = 30
const WORKSPACES_PER_USER = 10

function parseStructureName(value) {
  const name = sanitizeQuickReplyText(value, STRUCTURE_NAME_MAX).replace(/\n+/g, ' ')
  return name || null
}

async function activeMember(orgId, userId) {
  return prisma.orgMember.findFirst({ where: { orgId, userId: String(userId || ''), status: 'ACTIVE' } })
}

const STRUCTURE_WS_SELECT = { id: true, userId: true, name: true, color: true, position: true }
const STRUCTURE_FOLDER_SELECT = { id: true, userId: true, workspaceId: true, name: true, position: true }

async function loadStructure(orgId, userId) {
  const where = userId ? { orgId, userId } : { orgId }
  const [workspaces, folders] = await Promise.all([
    prisma.orgWorkspace.findMany({ where, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: STRUCTURE_WS_SELECT }),
    prisma.orgFolder.findMany({ where, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: STRUCTURE_FOLDER_SELECT })
  ])
  return { workspaces, folders }
}

router.get('/:orgId/structure', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : null
    res.json({ success: true, data: await loadStructure(req.params.orgId, userId) })
  } catch (err) {
    console.error('Org get structure error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения структуры' })
  }
})

router.get('/:orgId/my-structure', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    res.json({ success: true, data: await loadStructure(req.params.orgId, req.user.id) })
  } catch (err) {
    console.error('Org get my structure error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения структуры' })
  }
})

router.post('/:orgId/workspaces', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const name = parseStructureName(req.body?.name)
    if (!name) return res.status(400).json({ success: false, error: 'Введите название' })
    const member = await activeMember(req.params.orgId, req.body?.userId)
    if (!member) return res.status(400).json({ success: false, error: 'Сотрудник не найден в команде' })
    const count = await prisma.orgWorkspace.count({ where: { orgId: req.params.orgId, userId: member.userId } })
    if (count >= WORKSPACES_PER_USER) return res.status(409).json({ success: false, error: `Не больше ${WORKSPACES_PER_USER} пространств на сотрудника` })
    const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : null
    const data = await prisma.orgWorkspace.create({ data: { orgId: req.params.orgId, userId: member.userId, name, color, position: count }, select: STRUCTURE_WS_SELECT })
    await logOrgAudit(req.params.orgId, req.user.id, 'workspace.create', { name, userId: member.userId })
    res.json({ success: true, data })
  } catch (err) {
    console.error('Org create workspace error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания пространства' })
  }
})

router.patch('/:orgId/workspaces/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.orgWorkspace.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!existing) return res.status(404).json({ success: false, error: 'Пространство не найдено' })
    const data = {}
    if (req.body?.name !== undefined) {
      const name = parseStructureName(req.body.name)
      if (!name) return res.status(400).json({ success: false, error: 'Введите название' })
      data.name = name
    }
    if (req.body?.color !== undefined) {
      data.color = typeof req.body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : null
    }
    const updated = await prisma.orgWorkspace.update({ where: { id: existing.id }, data, select: STRUCTURE_WS_SELECT })
    emitOrgEvent(req.params.orgId, 'structure', { userId: existing.userId })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Org update workspace error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения' })
  }
})

router.delete('/:orgId/workspaces/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const deleted = await prisma.orgWorkspace.deleteMany({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (deleted.count === 0) return res.status(404).json({ success: false, error: 'Пространство не найдено' })
    await logOrgAudit(req.params.orgId, req.user.id, 'workspace.delete', null)
    res.json({ success: true })
  } catch (err) {
    console.error('Org delete workspace error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления' })
  }
})

async function validWorkspaceFor(orgId, userId, workspaceId) {
  if (!workspaceId) return true
  const ws = await prisma.orgWorkspace.findFirst({ where: { id: String(workspaceId), orgId, userId } })
  return !!ws
}

router.post('/:orgId/folders', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const name = parseStructureName(req.body?.name)
    if (!name) return res.status(400).json({ success: false, error: 'Введите название' })
    const member = await activeMember(req.params.orgId, req.body?.userId)
    if (!member) return res.status(400).json({ success: false, error: 'Сотрудник не найден в команде' })
    if (!(await validWorkspaceFor(req.params.orgId, member.userId, req.body?.workspaceId))) {
      return res.status(400).json({ success: false, error: 'Пространство не найдено' })
    }
    const count = await prisma.orgFolder.count({ where: { orgId: req.params.orgId, userId: member.userId } })
    if (count >= FOLDERS_PER_USER) return res.status(409).json({ success: false, error: `Не больше ${FOLDERS_PER_USER} папок на сотрудника` })
    const data = await prisma.orgFolder.create({
      data: { orgId: req.params.orgId, userId: member.userId, workspaceId: req.body?.workspaceId || null, name, position: count },
      select: STRUCTURE_FOLDER_SELECT
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'folder.create', { name, userId: member.userId })
    res.json({ success: true, data })
  } catch (err) {
    console.error('Org create folder error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания папки' })
  }
})

router.patch('/:orgId/folders/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.orgFolder.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!existing) return res.status(404).json({ success: false, error: 'Папка не найдена' })
    const data = {}
    if (req.body?.name !== undefined) {
      const name = parseStructureName(req.body.name)
      if (!name) return res.status(400).json({ success: false, error: 'Введите название' })
      data.name = name
    }
    if (req.body?.workspaceId !== undefined) {
      if (!(await validWorkspaceFor(req.params.orgId, existing.userId, req.body.workspaceId))) {
        return res.status(400).json({ success: false, error: 'Пространство не найдено' })
      }
      data.workspaceId = req.body.workspaceId || null
    }
    const updated = await prisma.orgFolder.update({ where: { id: existing.id }, data, select: STRUCTURE_FOLDER_SELECT })
    emitOrgEvent(req.params.orgId, 'structure', { userId: existing.userId })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Org update folder error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения' })
  }
})

router.delete('/:orgId/folders/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.orgFolder.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!existing) return res.status(404).json({ success: false, error: 'Папка не найдена' })
    await prisma.$transaction([
      prisma.orgMessengerAssignment.updateMany({ where: { orgId: req.params.orgId, folderId: existing.id }, data: { folderId: null } }),
      prisma.orgFolder.delete({ where: { id: existing.id } })
    ])
    await logOrgAudit(req.params.orgId, req.user.id, 'folder.delete', null)
    res.json({ success: true })
  } catch (err) {
    console.error('Org delete folder error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления' })
  }
})

// Put an assigned messenger into one of the employee's managed folders (or out of any).
router.patch('/:orgId/messenger-assignments/:id', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const assignment = await prisma.orgMessengerAssignment.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
    if (!assignment) return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    const data = {}
    // folderId is only touched when the request actually carries it: a PATCH with just { useVpn }
    // must not silently move the messenger out of its folder.
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'folderId')) {
      const folderId = req.body.folderId || null
      if (folderId) {
        const folder = await prisma.orgFolder.findFirst({ where: { id: String(folderId), orgId: req.params.orgId, userId: assignment.userId } })
        if (!folder) return res.status(400).json({ success: false, error: 'Папка не найдена у этого сотрудника' })
      }
      data.folderId = folderId
    }
    if (typeof req.body?.useVpn === 'boolean') data.useVpn = req.body.useVpn
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim().slice(0, 100)
      if (!name) return res.status(400).json({ success: false, error: 'Введите название' })
      data.name = name
    }
    if (req.body?.url !== undefined) {
      const url = String(req.body.url || '').trim().slice(0, 2000)
      if (!isAllowedAssignmentUrl(url)) return res.status(400).json({ success: false, error: 'Адрес должен начинаться с https://' })
      data.url = url
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ success: false, error: 'Нечего изменять' })
    const siteChanged = data.url !== undefined && !passwordSurvivesUrlChange(assignment.url, data.url)
    const [updated] = await prisma.$transaction([
      prisma.orgMessengerAssignment.update({ where: { id: assignment.id }, data }),
      // a password saved for the old site must never be typed into the new one
      ...(siteChanged ? [prisma.orgCredential.deleteMany({ where: { assignmentId: assignment.id } })] : [])
    ])
    if (data.name !== undefined || data.url !== undefined) {
      await logOrgAudit(req.params.orgId, req.user.id, 'messenger.edit', { userId: assignment.userId, name: updated.name, url: updated.url, passwordDropped: siteChanged })
    }
    emitOrgEvent(req.params.orgId, 'assignments', { userId: assignment.userId })
    if (typeof data.useVpn === 'boolean') {
      await logOrgAudit(req.params.orgId, req.user.id, 'messenger.vpn', { userId: assignment.userId, name: assignment.name, useVpn: data.useVpn })
    }
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Org update assignment error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения' })
  }
})

// Team password vault (ciphertext only, see routes/org-vault.js)
router.use('/', require('./org-vault'))
// Live stream, presence, live board, notes (TEAM control, 2026-11-08)
router.use('/', require('./org-live'))

module.exports = router
