const router  = require('express').Router()
const axios    = require('axios')
const { v4: uuidv4 } = require('uuid')
const multer   = require('multer')
const path     = require('path')
const authMiddleware = require('../middleware/auth')
const prisma   = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
// NOTE on deploy path: this file is deployed to
// /var/www/centrio-api/src/routes/org.js (see scripts/deploy-*.js and the
// identical note in payments-server.js) — `../lib/*` and `../middleware/*`
// resolve correctly once deployed into that nested layout, even though this
// checkout keeps everything flat under landing/.
const { sendOrgInviteEmail } = require('../lib/email')
const {
  getOrgSummaryForUser,
  requireOrgRole,
  createInviteToken,
  hashInviteToken,
  generateUniqueOrgSlug
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
const memberActionLimiter = rateLimit({ name: 'org-member-action', windowMs: 60 * 60 * 1000,      max: 60 })
const seatPaymentLimiter  = rateLimit({ name: 'org-seats-create',  windowMs: 5 * 60 * 1000,       max: 10 })
const orgWebhookLimiter   = rateLimit({ name: 'org-seats-webhook', windowMs: 60 * 1000,           max: 60 })

// Phase 2 (2026-09-10 — owner-control features: branding, forced settings,
// shared VPN, assigned messengers, read-status stats). Same rate-limit floor
// rationale as the Phase 1 limiters above.
const orgLogoLimiter       = rateLimit({ name: 'org-logo',        windowMs: 60 * 60 * 1000, max: 10 })
const orgSettingsLimiter   = rateLimit({ name: 'org-settings',    windowMs: 60 * 1000,      max: 30 })
const orgVpnLimiter        = rateLimit({ name: 'org-vpn',         windowMs: 60 * 1000,      max: 30 })
const orgAssignLimiter     = rateLimit({ name: 'org-assign',      windowMs: 60 * 1000,      max: 60 })
const orgStatsPushLimiter  = rateLimit({ name: 'org-stats-push',  windowMs: 60 * 1000,      max: 20 })

// Mirrors routes/upload.js's avatar-upload pattern exactly (same multer
// config shape, same disk-storage-by-fixed-id convention) — just a
// different destination dir and keyed by orgId instead of userId.
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/var/www/centrio-api/uploads/org-logos')
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    cb(null, `${req.params.orgId}${ext}`)
  }
})
const uploadLogo = multer({
  storage: logoStorage,
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
const SEAT_PLANS = {
  month: { pricePerSeat: '179.00', months: 1,  label: 'Centrio TEAM Старт — место, 1 месяц' },
  year:  { pricePerSeat: '1788.00', months: 12, label: 'Centrio TEAM Старт — место, 1 год' } // 149₽/мес × 12
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
      const created = await tx.organization.create({
        data: {
          name,
          slug,
          ownerId: req.user.id,
          tier: 'START',
          seatLimit: MIN_SEATS
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

// ── PATCH /api/org/:orgId — rename organization (2026-09-11, "сделать в
// ЛК возможность изменить название команды" — live user request) ──────
router.patch('/:orgId', authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ success: false, error: 'Введите название организации' })

    await prisma.organization.update({ where: { id: req.params.orgId }, data: { name } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.rename', { name })

    const summary = await getOrgSummaryForUser(req.user.id)
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('Org rename error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка переименования организации' })
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

    const seatsUsed = await prisma.orgMember.count({ where: { orgId: org.id, status: 'ACTIVE' } })
    if (seatsUsed >= org.seatLimit) {
      return res.status(409).json({ success: false, error: 'В организации больше нет свободных мест' })
    }

    await prisma.$transaction([
      prisma.orgMember.create({
        data: { orgId: org.id, userId: req.user.id, role: invite.role, status: 'ACTIVE' }
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
router.patch('/:orgId/members/:userId', memberActionLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const role = req.body?.role
    if (!['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Недопустимая роль' })
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

    await prisma.orgMember.update({
      where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
      data: { role }
    })

    await logOrgAudit(req.params.orgId, req.user.id, 'member.role', { userId: req.params.userId, role })

    res.json({ success: true, data: { userId: req.params.userId, role } })
  } catch (err) {
    console.error('Org member role error:', err.message)
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
    const seats = parseInt(req.body?.seats, 10)
    if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS_SELF_SERVICE) {
      return res.status(400).json({
        success: false,
        error: `Количество мест должно быть от ${MIN_SEATS} до ${MAX_SEATS_SELF_SERVICE}. Для большего числа мест напишите на sales@centrio.me`
      })
    }

    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })

    const totalAmount = (parseFloat(cfg.pricePerSeat) * seats).toFixed(2)
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
      metadata: { orgId: org.id, userId: req.user.id, seats, period, months: cfg.months },
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
        seats
      }
    })

    res.json({ success: true, data: { paymentId: yk.id, confirmationUrl: yk.confirmation.confirmation_url } })
  } catch (err) {
    console.error('Org seat payment create error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа' })
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

      const org = await prisma.organization.findUnique({ where: { id: req.params.orgId } })
      const now = new Date()
      const alreadyActive = org.seatsExpiresAt && org.seatsExpiresAt > now
      const base = alreadyActive ? org.seatsExpiresAt : now
      const exp = new Date(base)
      exp.setMonth(exp.getMonth() + payment.months)

      const updateData = {
        seatsExpiresAt: exp,
        autoRenewSeats: true,
        seatLimit: org.seatLimit + (payment.seats || 0)
      }
      if (yk.payment_method && yk.payment_method.saved) {
        updateData.autoRenewPayMethodId = yk.payment_method.id
      }
      await prisma.organization.update({ where: { id: org.id }, data: updateData })
      await logOrgAudit(org.id, payment.userId, 'seats.purchase', { seats: payment.seats, months: payment.months })
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

      const org = await prisma.organization.findUnique({ where: { id: payment.orgId } })
      const now = new Date()
      const alreadyActive = org.seatsExpiresAt && org.seatsExpiresAt > now
      const base = alreadyActive ? org.seatsExpiresAt : now
      const exp = new Date(base)
      exp.setMonth(exp.getMonth() + payment.months)

      const updateData = {
        seatsExpiresAt: exp,
        autoRenewSeats: true,
        // Seats purchased are ADDED to the existing limit, not replaced —
        // an org topping up mid-cycle keeps what it already had.
        seatLimit: org.seatLimit + (payment.seats || 0)
      }
      if (yk.payment_method && yk.payment_method.saved) {
        updateData.autoRenewPayMethodId = yk.payment_method.id
      }
      await prisma.organization.update({ where: { id: org.id }, data: updateData })

      await logOrgAudit(org.id, payment.userId, 'seats.purchase', { seats: payment.seats, months: payment.months })
      console.log(`Org seat payment OK: org=${org.id} seatLimit=${updateData.seatLimit} until ${exp.toISOString()}`)
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

// ══════════════════════════════════════════════════════════════════════
// Phase 2 (2026-09-10) — owner-control features
// ══════════════════════════════════════════════════════════════════════
// Real customer request (see chat log): an owner who splits staff across
// branches wants to (1) see whether employees are actually reading their
// assigned messengers — counts/timestamps only, never message content,
// (2) hand each employee a specific set of messenger tabs instead of
// employees adding their own, (3) brand the app with the company logo,
// (4) push one set of default/forced app settings to the whole team,
// (5) hand out one shared VPN config instead of everyone hunting their own.

// ── PATCH /api/org/:orgId/logo — upload/replace org logo (OWNER only) ──
router.patch('/:orgId/logo', orgLogoLimiter, authMiddleware, requireOrgRole(['OWNER']), (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
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
    await logOrgAudit(req.params.orgId, req.user.id, 'org.logo.update', {})
    res.json({ success: true, data: { logoUrl } })
  } catch (err) {
    console.error('Org logo upload error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка загрузки логотипа' })
  }
})

// ── DELETE /api/org/:orgId/logo — revert to default app logo ───────────
router.delete('/:orgId/logo', orgLogoLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    await prisma.organization.update({ where: { id: req.params.orgId }, data: { logoUrl: null } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.logo.remove', {})
    res.json({ success: true })
  } catch (err) {
    console.error('Org logo remove error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления логотипа' })
  }
})

// ── GET/PATCH /api/org/:orgId/settings — forced desktop settings ───────
// Deliberately separate from the personal SyncSettings table: sync.js
// destructively deleteMany+recreates a user's own settings row from
// whatever their device's local state is, so org-forced values can't live
// there without getting overwritten by the next routine sync.
router.get('/:orgId/settings', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { forcedSettingsJson: true }
    })
    res.json({ success: true, data: org?.forcedSettingsJson || null })
  } catch (err) {
    console.error('Org settings get error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения настроек' })
  }
})

router.patch('/:orgId/settings', orgSettingsLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const settings = req.body?.settings
    if (settings !== null && (typeof settings !== 'object' || Array.isArray(settings))) {
      return res.status(400).json({ success: false, error: 'Некорректные настройки' })
    }
    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { forcedSettingsJson: settings === null ? null : settings }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.settings.update', {})
    res.json({ success: true, data: settings })
  } catch (err) {
    console.error('Org settings update error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения настроек' })
  }
})

// ── GET/PATCH /api/org/:orgId/vpn — shared org VPN config ──────────────
router.get('/:orgId/vpn', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { vpnConfigName: true, vpnConfigLink: true }
    })
    if (!org || !org.vpnConfigLink) return res.json({ success: true, data: null })
    res.json({ success: true, data: { name: org.vpnConfigName, link: org.vpnConfigLink } })
  } catch (err) {
    console.error('Org VPN get error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения VPN' })
  }
})

router.patch('/:orgId/vpn', orgVpnLimiter, authMiddleware, requireOrgRole(['OWNER']), async (req, res) => {
  try {
    const name = req.body?.name === null ? null : String(req.body?.name || '').trim().slice(0, 80) || null
    const link = req.body?.link === null ? null : String(req.body?.link || '').trim().slice(0, 2000) || null
    await prisma.organization.update({
      where: { id: req.params.orgId },
      data: { vpnConfigName: link ? name : null, vpnConfigLink: link }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.vpn.update', { hasLink: !!link })
    res.json({ success: true, data: link ? { name, link } : null })
  } catch (err) {
    console.error('Org VPN update error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения VPN' })
  }
})

// ── Messenger assignments — "владелец распределяет мессенджеры по
// сотрудникам" ──────────────────────────────────────────────────────────
// OWNER/ADMIN manage the full list; a plain MEMBER can only read their own
// slice (GET below scopes by role). This table is intentionally separate
// from the personal Messenger model — see schema.prisma comment.

// GET /api/org/:orgId/messenger-assignments — OWNER/ADMIN: everyone's
// assignments; MEMBER: only their own.
router.get('/:orgId/messenger-assignments', authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const isManager = req.orgMembership.role === 'OWNER' || req.orgMembership.role === 'ADMIN'
    const where = isManager
      ? { orgId: req.params.orgId }
      : { orgId: req.params.orgId, userId: req.user.id }
    const assignments = await prisma.orgMessengerAssignment.findMany({
      where,
      orderBy: [{ userId: 'asc' }, { sortOrder: 'asc' }]
    })
    res.json({ success: true, data: assignments })
  } catch (err) {
    console.error('Org messenger assignments list error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения мессенджеров' })
  }
})

// POST /api/org/:orgId/messenger-assignments — OWNER/ADMIN create a slot
// for a specific member.
router.post('/:orgId/messenger-assignments', orgAssignLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { userId, name, url, icon, color, sortOrder } = req.body || {}
    if (!userId || !name || !url) {
      return res.status(400).json({ success: false, error: 'Не указаны обязательные поля' })
    }
    const targetMembership = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: req.params.orgId, userId } }
    })
    if (!targetMembership || targetMembership.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: 'Сотрудник не найден в организации' })
    }
    const created = await prisma.orgMessengerAssignment.create({
      data: {
        orgId: req.params.orgId,
        userId,
        name: String(name).trim().slice(0, 100),
        url: String(url).trim().slice(0, 500),
        icon: icon ? String(icon).slice(0, 500) : null,
        color: color ? String(color).slice(0, 20) : null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0
      }
    })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.messenger.assign', { userId, name: created.name })
    res.json({ success: true, data: created })
  } catch (err) {
    console.error('Org messenger assignment create error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка добавления мессенджера' })
  }
})

// PATCH /api/org/:orgId/messenger-assignments/:id — OWNER/ADMIN edit a slot.
router.patch('/:orgId/messenger-assignments/:id', orgAssignLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.orgMessengerAssignment.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    }
    const { name, url, icon, color, sortOrder } = req.body || {}
    const data = {}
    if (name !== undefined) data.name = String(name).trim().slice(0, 100)
    if (url !== undefined) data.url = String(url).trim().slice(0, 500)
    if (icon !== undefined) data.icon = icon ? String(icon).slice(0, 500) : null
    if (color !== undefined) data.color = color ? String(color).slice(0, 20) : null
    if (typeof sortOrder === 'number') data.sortOrder = sortOrder

    const updated = await prisma.orgMessengerAssignment.update({ where: { id: req.params.id }, data })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.messenger.update', { id: req.params.id })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Org messenger assignment update error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка обновления мессенджера' })
  }
})

// DELETE /api/org/:orgId/messenger-assignments/:id — OWNER/ADMIN remove a slot.
router.delete('/:orgId/messenger-assignments/:id', orgAssignLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.orgMessengerAssignment.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.orgId !== req.params.orgId) {
      return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    }
    await prisma.orgMessengerAssignment.delete({ where: { id: req.params.id } })
    // Orphan any read-status stats reported against this slot's key — the
    // slot itself is gone, so the aggregate table showing it would be a
    // dangling reference otherwise.
    await prisma.orgMessengerStat.deleteMany({ where: { orgId: req.params.orgId, messengerKey: req.params.id } })
    await logOrgAudit(req.params.orgId, req.user.id, 'org.messenger.remove', { id: req.params.id })
    res.json({ success: true })
  } catch (err) {
    console.error('Org messenger assignment delete error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления мессенджера' })
  }
})

// ── Read-status statistics — "Только статус — прочитано или нет" ───────
// Desktop app pushes counts/timestamps only, never message content.

// POST /api/org/:orgId/messenger-stats — any ACTIVE member reports their
// own read status for their own messengers (assigned or personal).
router.post('/:orgId/messenger-stats', orgStatsPushLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const stats = req.body?.stats
    if (!Array.isArray(stats) || stats.length === 0) {
      return res.status(400).json({ success: false, error: 'Нет данных для отправки' })
    }
    // Hard cap — a member reports their own messenger count, which is
    // already bounded (FREE_MESSENGER_LIMIT / org assignment count), so a
    // huge payload here can only be a bug or abuse, never a real use case.
    const capped = stats.slice(0, 200)
    await prisma.$transaction(
      capped.map((s) =>
        prisma.orgMessengerStat.upsert({
          where: {
            orgId_userId_messengerKey: {
              orgId: req.params.orgId,
              userId: req.user.id,
              messengerKey: String(s.messengerKey || '').slice(0, 200)
            }
          },
          create: {
            orgId: req.params.orgId,
            userId: req.user.id,
            messengerKey: String(s.messengerKey || '').slice(0, 200),
            messengerName: String(s.messengerName || '').slice(0, 100),
            unreadCount: typeof s.unreadCount === 'number' ? Math.max(0, s.unreadCount) : 0,
            lastReadAt: s.lastReadAt ? new Date(s.lastReadAt) : null,
            lastMessageAt: s.lastMessageAt ? new Date(s.lastMessageAt) : null
          },
          update: {
            messengerName: String(s.messengerName || '').slice(0, 100),
            unreadCount: typeof s.unreadCount === 'number' ? Math.max(0, s.unreadCount) : 0,
            lastReadAt: s.lastReadAt ? new Date(s.lastReadAt) : null,
            lastMessageAt: s.lastMessageAt ? new Date(s.lastMessageAt) : null
          }
        })
      )
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Org messenger stats push error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка отправки статистики' })
  }
})

// GET /api/org/:orgId/messenger-stats — OWNER/ADMIN: aggregate read-status
// table for the Team page (employee × messenger × unread × last-read).
router.get('/:orgId/messenger-stats', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const stats = await prisma.orgMessengerStat.findMany({
      where: { orgId: req.params.orgId },
      orderBy: [{ userId: 'asc' }, { messengerName: 'asc' }]
    })
    const userIds = [...new Set(stats.map((s) => s.userId))]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : []
    const usersById = Object.fromEntries(users.map((u) => [u.id, u]))
    res.json({
      success: true,
      data: stats.map((s) => ({ ...s, user: usersById[s.userId] || null }))
    })
  } catch (err) {
    console.error('Org messenger stats get error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения статистики' })
  }
})

module.exports = router
