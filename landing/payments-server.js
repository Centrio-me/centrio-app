const router  = require('express').Router()
const axios   = require('axios')
const crypto  = require('crypto')
const { v4: uuidv4 } = require('uuid')
const authMiddleware = require('../middleware/auth')
const prisma  = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
// NOTE on deploy path: this file is deployed to
// /var/www/centrio-api/src/routes/payments.js (see scripts/deploy-*.js),
// so `../lib/email` resolves to /var/www/centrio-api/src/lib/email.js.
// landing/lib/email.js must be deployed there — update the deploy script
// to add that upload step when wiring this up (not yet automated).
const { sendPaymentReceiptEmail, sendRefundConfirmationEmail } = require('../lib/email')
const { grantReferralBonusIfEligible } = require('../lib/referral')

// SECURITY: these routes had no rate limiting at all — an attacker could
// flood /create (DB-write + external payment-provider API amplification) or
// spam the webhook endpoints without any throttle.
const createPaymentLimiter = rateLimit({ name: 'payments-create',  windowMs: 5 * 60 * 1000, max: 10 })
const webhookLimiter       = rateLimit({ name: 'payments-webhook', windowMs: 60 * 1000,     max: 60 })
const refundLimiter        = rateLimit({ name: 'payments-refund',  windowMs: 60 * 60 * 1000, max: 5 })

// Self-service refund requests are only accepted within this window of the
// original payment date — mirrors a standard consumer-protection cooling-off
// period. Older payments still show up in /my but must go through support.
const REFUND_WINDOW_DAYS = 14

const YK_SHOP   = process.env.YUKASSA_SHOP_ID
const YK_SECRET = process.env.YUKASSA_SECRET_KEY
const YK_API    = 'https://api.yookassa.ru/v3'
const FRONT     = process.env.FRONTEND_URL || 'https://centrio.me'

// YooKassa rejects the ENTIRE payment-creation call with 403
// "This store can't make recurring payments" when save_payment_method
// is sent but the merchant account hasn't been approved by YooKassa for
// recurring/saved-card charges. That approval is an account-level status,
// not something this code controls. Gate the flag behind an env var
// (defaults OFF) so payments work today; flip YOOKASSA_RECURRING=true
// once the merchant account is approved. Mirrors the same pattern used
// in the Cliqly Billing project for the identical YooKassa limitation.
const YOOKASSA_RECURRING = process.env.YOOKASSA_RECURRING === 'true'

// SECURITY: these previously had hardcoded plaintext fallback secrets
// (a real FRIDE API key, merchant ID, and webhook HMAC key), so even
// deployments that forgot to set the env vars — or anyone reading this
// source file — got a live, working set of production credentials.
// Now required from env only; FRIDE routes fail closed if unset (see
// the `if (!FRIDE_MERCHANT_ID)` / `if (!FRIDE_WEBHOOK_KEY)` checks below).
const FRIDE_API_KEY      = process.env.FRIDE_API_KEY
const FRIDE_MERCHANT_ID  = process.env.FRIDE_MERCHANT_ID
const FRIDE_WEBHOOK_KEY  = process.env.FRIDE_WEBHOOK_KEY
const FRIDE_API          = 'https://api.fride.io'

const PLANS = {
  month: { price: '199.00', months: 1,  label: 'Centrio Pro — 1 месяц' },
  year:  { price: '1590.00', months: 12, label: 'Centrio Pro — 1 год'  }
}

// YooKassa payment_method_data.type values we expose in our own UI's
// method-selector, shown before the redirect to YooKassa's page (see
// dashboard-server.tsx). save_payment_method (recurring/card-binding) only
// works for bank_card — silently dropped for every other method below,
// same as YooKassa itself would do.
const PAYMENT_METHODS = new Set(['bank_card', 'sbp', 'yoo_money', 'sberbank'])

function ykAuth () { return { username: YK_SHOP, password: YK_SECRET } }

// ── GET /api/payments/plans ────────────────────────────────────────
router.get('/plans', (_req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'FREE', name: 'Бесплатный', price: 0,
        features: ['До 5 сервисов', 'Базовые функции', 'Уведомления'] },
      { id: 'PRO_MONTH', name: 'Pro — Месяц', price: 199, per: 'month',
        features: ['Безлимит сервисов', 'Облачная синхронизация', 'Папки', 'Поддержка'] },
      { id: 'PRO_YEAR', name: 'Pro — Год', price: 1590, pricePerMonth: 133, per: 'year',
        features: ['Всё из Pro Месяц', 'Приоритетная поддержка', 'Ранний доступ'] }
    ]
  })
})

// ── POST /api/payments/create ──────────────────────────────────────
router.post('/create', createPaymentLimiter, authMiddleware, async (req, res) => {
  try {
    const { plan, method } = req.body
    const cfg = PLANS[plan]
    if (!cfg) return res.status(400).json({ success: false, error: 'Неверный план' })
    if (method !== undefined && !PAYMENT_METHODS.has(method)) {
      return res.status(400).json({ success: false, error: 'Неверный способ оплаты' })
    }

    const ikey = uuidv4()

    const { data: yk } = await axios.post(`${YK_API}/payments`, {
      amount:       { value: cfg.price, currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: `${FRONT}/payment/success?plan=${plan}` },
      capture:      true,
      description:  cfg.label,
      // No payment_method_data at all => YooKassa's hosted page shows every
      // method enabled on the merchant account. When the user picked a
      // specific method in our own selector, we pin it so YooKassa's page
      // skips straight to that method's flow instead of showing the picker
      // again.
      ...(method ? { payment_method_data: { type: method } } : {}),
      ...(YOOKASSA_RECURRING && (!method || method === 'bank_card') ? { save_payment_method: true } : {}),
      metadata:     { userId: req.user.id, plan, months: cfg.months },
      receipt: {
        customer: { email: req.user.email },
        items: [{
          description:     cfg.label,
          quantity:        '1.00',
          amount:          { value: cfg.price, currency: 'RUB' },
          vat_code:        1,
          payment_mode:    'full_payment',
          payment_subject: 'service'
        }]
      }
    }, {
      auth:    ykAuth(),
      headers: { 'Idempotence-Key': ikey }
    })

    await prisma.payment.create({
      data: {
        userId:       req.user.id,
        amount:       parseFloat(cfg.price),
        currency:     'RUB',
        status:       'PENDING',
        provider:     'yookassa',
        providerPayId: yk.id,
        plan:         'PRO',
        months:       cfg.months
      }
    })

    res.json({ success: true, data: { paymentId: yk.id, confirmationUrl: yk.confirmation.confirmation_url } })
  } catch (err) {
    console.error('Payment create:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа' })
  }
})

// ── POST /api/payments/webhook ─────────────────────────────────────
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const { event, object: yk } = req.body || {}
    if (!yk?.id) return res.status(400).json({ error: 'Bad payload' })

    if (event === 'payment.succeeded') {
      const payment = await prisma.payment.findUnique({ where: { providerPayId: yk.id } })
      if (!payment) return res.status(404).json({ error: 'Payment not found' })

      // SECURITY: this endpoint had no authenticity check at all — no
      // signature, no IP allowlist. yk.id (the paymentId) is returned
      // directly to the authenticated user in /create's own response, so
      // any user could create a PENDING payment, never pay, then POST
      // { event: 'payment.succeeded', object: { id: <their own paymentId> } }
      // here and get Pro activated for free. Re-verify the real status
      // against YooKassa's API before trusting the webhook body, mirroring
      // the existing safe pattern already used in GET /status/:paymentId.
      const { data: ykStatus } = await axios.get(`${YK_API}/payments/${yk.id}`, { auth: ykAuth() })
      if (ykStatus.status !== 'succeeded') {
        console.warn(`[Webhook] payment ${yk.id} claims succeeded but YooKassa reports '${ykStatus.status}' — ignoring`)
        return res.status(409).json({ error: 'Status mismatch' })
      }

      // Idempotency: YooKassa retries webhook delivery. Without this,
      // a retried 'payment.succeeded' would extend the subscription again.
      if (payment.status === 'SUCCEEDED') {
        return res.json({ ok: true, alreadyProcessed: true })
      }

      await prisma.payment.update({
        where: { providerPayId: yk.id },
        data:  { status: 'SUCCEEDED' }
      })

      const user = await prisma.user.findUnique({ where: { id: payment.userId } })
      const now  = new Date()
      const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
      const base = alreadyPro ? user.planExpiresAt : now
      const exp  = new Date(base)
      exp.setMonth(exp.getMonth() + payment.months)

      const updateData = { plan: 'PRO', planExpiresAt: exp, autoRenew: true }
      // Новый период подписки (не продление уже активного) — фиксируем
      // дату начала для отображения "с какого дня оплачена" в приложении.
      if (!alreadyPro) updateData.planStartedAt = now
      if (yk.payment_method && yk.payment_method.saved) {
        updateData.autoRenewPayMethodId = yk.payment_method.id
      }

      await prisma.user.update({ where: { id: payment.userId }, data: updateData })
      console.log('Payment OK: user=' + payment.userId + ' PRO until ' + exp.toISOString())
      sendPaymentReceiptEmail(user, payment).catch(e => console.error('[email] receipt send failed:', e.message))
      grantReferralBonusIfEligible(prisma, payment.userId, payment.id).catch(e => console.error('[referral] grant failed:', e.message))
    }

    if (event === 'payment.canceled') {
      await prisma.payment.updateMany({
        where: { providerPayId: yk.id },
        data:  { status: 'CANCELLED' }
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

// ── GET /api/payments/status/:paymentId ───────────────────────────
router.get('/status/:paymentId', authMiddleware, async (req, res) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { providerPayId: req.params.paymentId, userId: req.user.id }
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Не найден' })

    const { data: yk } = await axios.get(`${YK_API}/payments/${req.params.paymentId}`, { auth: ykAuth() })

    if (yk.status === 'succeeded' && payment.status !== 'SUCCEEDED') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
      const user = await prisma.user.findUnique({ where: { id: payment.userId } })
      const now  = new Date()
      const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
      const base = alreadyPro ? user.planExpiresAt : now
      const exp  = new Date(base)
      exp.setMonth(exp.getMonth() + payment.months)
      const updateData = { plan: 'PRO', planExpiresAt: exp, autoRenew: true }
      // Новый период подписки (не продление уже активного) — фиксируем
      // дату начала для отображения "с какого дня оплачена" в приложении.
      if (!alreadyPro) updateData.planStartedAt = now
      if (yk.payment_method && yk.payment_method.saved) {
        updateData.autoRenewPayMethodId = yk.payment_method.id
      }
      await prisma.user.update({ where: { id: payment.userId }, data: updateData })
      grantReferralBonusIfEligible(prisma, payment.userId, payment.id).catch(e => console.error('[referral] grant failed:', e.message))
    }

    res.json({ success: true, data: { ykStatus: yk.status, payment } })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка проверки статуса' })
  }
})

// ── POST /api/payments/promo/redeem ────────────────────────────────
// Promo codes grant free Pro months directly — no YooKassa/FRIDE/crypto
// provider involved, unlike every other route in this file. The code
// catalogue itself (create/deactivate/delete) is admin-only, managed via
// /api/admin/promo-codes (see admin-routes.js); this is the only
// user-facing entry point, gated to one redemption per user per code via
// the PromoRedemption unique constraint (not a rate limit — a real
// second attempt with the same code must fail every time, not just be
// throttled).
router.post('/promo/redeem', authMiddleware, async (req, res) => {
  try {
    const raw = String(req.body?.code || '').trim().toUpperCase().slice(0, 40)
    if (!raw) return res.status(400).json({ success: false, error: 'Введите промокод' })

    const promo = await prisma.promoCode.findUnique({ where: { code: raw } })
    if (!promo || !promo.isActive) {
      return res.status(404).json({ success: false, error: 'Промокод не найден или неактивен' })
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return res.status(400).json({ success: false, error: 'Срок действия промокода истёк' })
    }
    if (promo.maxUses != null && promo.usesCount >= promo.maxUses) {
      return res.status(400).json({ success: false, error: 'Промокод исчерпан' })
    }

    // SECURITY (trial-farming fix): day-based codes (e.g. PRO14) grant the
    // same kind of free trial as the anonymous /device-trial-redeem route
    // below, just keyed by userId instead of hardwareId. Without also
    // gating these on the device, "skip onboarding" (device trial) and
    // "create account with a disposable email → redeem PRO14" are two
    // independent free-14-days grants, and the second one can be farmed
    // forever from one machine since account creation is unlimited.
    // Month-based codes (subscription/discount grants, not trial-style)
    // are intentionally left ungated here — only `days != null` codes
    // are cross-checked against DeviceTrial.
    const isTrialStyle = promo.days != null
    const hardwareId = isTrialStyle
      ? String(req.body?.hardwareId || '').trim().slice(0, 128)
      : null
    if (isTrialStyle && !hardwareId) {
      return res.status(400).json({ success: false, error: 'Missing hardwareId' })
    }
    if (isTrialStyle) {
      const deviceUsed = await prisma.deviceTrial.findUnique({ where: { hardwareId } })
      if (deviceUsed) {
        return res.status(409).json({ success: false, error: 'Пробный период уже использован на этом устройстве' })
      }
    }

    const already = await prisma.promoRedemption.findUnique({
      where: { promoCodeId_userId: { promoCodeId: promo.id, userId: req.user.id } }
    })
    if (already) return res.status(409).json({ success: false, error: 'Вы уже использовали этот промокод' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const now  = new Date()
    const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
    const base = alreadyPro ? user.planExpiresAt : now
    const exp  = new Date(base)
    // Codes grant either whole months (subscription-style) or a fixed number
    // of days (e.g. the PRO14 trial) — never both, enforced at creation time
    // in admin-routes.js.
    if (promo.days != null) exp.setDate(exp.getDate() + promo.days)
    else exp.setMonth(exp.getMonth() + promo.months)

    // Same-transaction: redemption row (enforces the unique constraint),
    // uses-counter bump, plan extension, and a $0 Payment row so the
    // redemption shows up in the existing payment-history UI (GET /my)
    // alongside real charges. For trial-style codes, also record a
    // DeviceTrial row in the same transaction so this device can't repeat
    // the grant via either this route or /device-trial-redeem again.
    // If any step fails, nothing partially applies.
    await prisma.$transaction([
      prisma.promoRedemption.create({ data: { promoCodeId: promo.id, userId: req.user.id } }),
      prisma.promoCode.update({ where: { id: promo.id }, data: { usesCount: { increment: 1 } } }),
      prisma.user.update({ where: { id: req.user.id }, data: { plan: 'PRO', planExpiresAt: exp, ...(alreadyPro ? {} : { planStartedAt: now }) } }),
      prisma.payment.create({
        data: {
          userId:   req.user.id,
          amount:   0,
          currency: 'RUB',
          status:   'SUCCEEDED',
          provider: 'promo',
          plan:     'PRO',
          months:   promo.months ?? 0,
          days:     promo.days ?? null
        }
      }),
      ...(isTrialStyle ? [prisma.deviceTrial.create({ data: { hardwareId, expiresAt: exp } })] : [])
    ])

    res.json({ success: true, data: { planExpiresAt: exp, months: promo.months ?? null, days: promo.days ?? null } })
  } catch (err) {
    // Unique-constraint race: two concurrent redeem calls with the same
    // code (or same hardwareId, for trial-style codes) from the same user
    // can both pass the checks above before either commits — the DB
    // constraints (PromoRedemption, DeviceTrial) are the real guard.
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Вы уже использовали этот промокод' })
    }
    console.error('Promo redeem error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка активации промокода' })
  }
})

// ── POST /api/payments/device-trial-redeem ──────────────────────────
// Onboarding 14-day Pro trial for desktop users who skip account creation
// (see renderer/onboarding-auth.js) — same idea as PRO14 above, but there's
// no userId to gate on, so it's keyed by a hashed hardware id instead via
// the DeviceTrial.hardwareId unique constraint. No auth — this is reached
// before the user has any account or token. Since there's no server-side
// User row to extend, this only *records* the grant; the desktop app is
// responsible for treating a locally-cached, unexpired grant as Pro.
const deviceTrialLimiter = rateLimit({ name: 'device-trial-redeem', windowMs: 60 * 60 * 1000, max: 5 })
const DEVICE_TRIAL_DAYS = 14
router.post('/device-trial-redeem', deviceTrialLimiter, async (req, res) => {
  try {
    const hardwareId = String(req.body?.hardwareId || '').trim().slice(0, 128)
    if (!hardwareId) return res.status(400).json({ success: false, error: 'Missing hardwareId' })

    const exp = new Date()
    exp.setDate(exp.getDate() + DEVICE_TRIAL_DAYS)

    await prisma.deviceTrial.create({ data: { hardwareId, expiresAt: exp } })
    res.json({ success: true, data: { expiresAt: exp } })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Trial already used on this device' })
    }
    console.error('Device trial redeem error:', err.message)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── GET /api/payments/my ──────────────────────────────────────────
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    20
    })
    res.json({ success: true, data: payments })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка получения платежей' })
  }
})

// ── GET /api/payments/auto-renew ─────────────────────────────────
router.get('/auto-renew', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.id },
      select: { autoRenew: true, autoRenewPayMethodId: true, planExpiresAt: true }
    })
    res.json({
      success: true,
      data: {
        autoRenew: user.autoRenew,
        hasMethod: !!user.autoRenewPayMethodId,
        expiresAt: user.planExpiresAt
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка' })
  }
})

// ── PATCH /api/payments/auto-renew ───────────────────────────────
// YooKassa's recurring-payments approval process requires that unlinking
// a saved card is a real deletion of the stored payment-method token, not
// just a UI toggle ("В рамках нашего протокола... при нажатии удалять
// данные привязки из вашей системы"). Previously this only flipped the
// `autoRenew` boolean and left `autoRenewPayMethodId` (the saved YooKassa
// card token) untouched — so a user who "disabled" auto-renew still had
// their card token sitting in the DB, and re-enabling would have silently
// reused it without them ever re-entering card details. Now disabling
// always clears the token too; the user must complete a new payment with
// "Запомнить данные карты" to re-link.
router.patch('/auto-renew', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body
    await prisma.user.update({
      where: { id: req.user.id },
      data:  enabled
        ? { autoRenew: true }
        : { autoRenew: false, autoRenewPayMethodId: null }
    })
    res.json({ success: true, data: { autoRenew: !!enabled } })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка' })
  }
})

// ── POST /api/payments/fride-create ──────────────────────────────
router.post('/fride-create', createPaymentLimiter, authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body
    const cfg = PLANS[plan]
    if (!cfg) return res.status(400).json({ success: false, error: 'Неверный план' })
    if (!FRIDE_MERCHANT_ID) return res.status(503).json({ success: false, error: 'FRIDE не настроен' })

    const orderId = uuidv4()
    const amount  = Math.round(parseFloat(cfg.price))

    const { data: fr } = await axios.post(`${FRIDE_API}/invoices/create`, {
      merchant_id:  FRIDE_MERCHANT_ID,
      amount,
      currency:     'RUB',
      order_id:     orderId,
      description:  cfg.label,
      success_url:  `${FRONT}/payment/success?plan=${plan}`,
      fail_url:     `${FRONT}/payment/fail`
    }, {
      headers: { 'X-Api-Key': FRIDE_API_KEY, 'Content-Type': 'application/json' }
    })

    await prisma.payment.create({
      data: {
        userId:        req.user.id,
        amount:        parseFloat(cfg.price),
        currency:      'RUB',
        status:        'PENDING',
        provider:      'fride',
        providerPayId: fr.invoice_id || orderId,
        plan:          'PRO',
        months:        cfg.months
      }
    })

    res.json({ success: true, data: { paymentUrl: fr.payment_url || fr.url, invoiceId: fr.invoice_id } })
  } catch (err) {
    console.error('FRIDE create:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа FRIDE' })
  }
})

// ── POST /api/payments/crypto-activate ────────────────────────────
// Internal-only endpoint. The Next.js route handler at
// landing/api/crypto-webhook/route.ts has already verified the NOWPayments
// HMAC signature before calling this — it has no direct Prisma/DB access of
// its own, so it hops over here to actually persist the plan upgrade.
// Protected by a shared secret (never exposed to the browser) instead of
// authMiddleware, since this call is service-to-service, not user-initiated.
const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET
router.post('/crypto-activate', webhookLimiter, async (req, res) => {
  try {
    if (!INTERNAL_WEBHOOK_SECRET || req.headers['x-internal-secret'] !== INTERNAL_WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { userId, plan, providerPayId, amount, currency } = req.body || {}
    const cfg = PLANS[plan]
    if (!userId || !cfg) return res.status(400).json({ error: 'Bad payload' })

    // Idempotency: NOWPayments retries IPN callbacks on non-2xx / timeout.
    // Without this check a retried webhook would extend the subscription twice.
    if (providerPayId) {
      const existing = await prisma.payment.findFirst({
        where: { providerPayId, status: 'SUCCEEDED' }
      })
      if (existing) return res.json({ ok: true, alreadyProcessed: true })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const now = new Date()
    const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
    const base = alreadyPro ? user.planExpiresAt : now
    const exp = new Date(base)
    exp.setMonth(exp.getMonth() + cfg.months)

    // Crypto payments are one-off (no saved payment method), unlike YooKassa
    // — do not set autoRenew here.
    await prisma.user.update({ where: { id: userId }, data: { plan: 'PRO', planExpiresAt: exp, ...(alreadyPro ? {} : { planStartedAt: now }) } })

    // Captured (rather than fire-and-forget) so grantReferralBonusIfEligible
    // below can pass this payment's own id as the exclusion filter — without
    // it, this very row would count as a "prior payment" and block a
    // legitimate first-payment referral bonus.
    let createdPaymentId = null
    if (providerPayId) {
      try {
        const created = await prisma.payment.create({
          data: {
            userId,
            amount:        parseFloat(amount) || 0,
            currency:      currency || 'USD',
            status:        'SUCCEEDED',
            provider:      'nowpayments',
            providerPayId: String(providerPayId),
            plan:          'PRO',
            months:        cfg.months
          }
        })
        createdPaymentId = created.id
      } catch (err) {
        console.error('crypto-activate: payment log insert failed:', err.message)
      }
    }

    console.log('Crypto payment OK: user=' + userId + ' PRO until ' + exp.toISOString())
    sendPaymentReceiptEmail(user, { amount: parseFloat(amount) || 0, currency: currency || 'USD', months: cfg.months })
      .catch(e => console.error('[email] receipt send failed:', e.message))
    grantReferralBonusIfEligible(prisma, userId, createdPaymentId).catch(e => console.error('[referral] grant failed:', e.message))
    res.json({ ok: true, expiresAt: exp })
  } catch (err) {
    console.error('crypto-activate error:', err.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

// ── POST /api/payments/fride-webhook ─────────────────────────────
router.post('/fride-webhook', webhookLimiter, async (req, res) => {
  try {
    // SECURITY: `if (sig && sig !== expected)` skipped verification
    // entirely whenever the signature header was simply absent — an
    // attacker could POST { status: 'paid', invoice_id: '<any existing
    // pending invoice>' } with no signature at all and get Pro activated
    // for free. Fail closed instead: a configured secret and a valid,
    // timing-safe-compared signature are both mandatory.
    if (!FRIDE_WEBHOOK_KEY) {
      console.error('[FRIDE webhook] FRIDE_WEBHOOK_KEY not configured — rejecting request')
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    const sig = req.headers['x-fride-signature'] || req.headers['x-signature'] || ''
    if (!sig) {
      console.warn('[FRIDE webhook] Missing signature header')
      return res.status(401).json({ error: 'Invalid signature' })
    }
    const body = JSON.stringify(req.body)
    const expected = crypto.createHmac('sha256', FRIDE_WEBHOOK_KEY).update(body).digest('hex')
    const sigBuf = Buffer.from(String(sig), 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const isValid = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
    if (!isValid) {
      console.warn('[FRIDE webhook] Invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const { status, invoice_id, metadata } = req.body || {}
    if (!invoice_id) return res.status(400).json({ error: 'Bad payload' })

    if (status === 'paid' || status === 'succeeded') {
      const payment = await prisma.payment.findFirst({ where: { providerPayId: invoice_id } })
      if (!payment) return res.status(404).json({ error: 'Payment not found' })

      // Idempotency: guard against duplicate webhook delivery re-extending
      // the subscription.
      if (payment.status === 'SUCCEEDED') {
        return res.json({ ok: true, alreadyProcessed: true })
      }

      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })

      const user = await prisma.user.findUnique({ where: { id: payment.userId } })
      const now  = new Date()
      const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
      const base = alreadyPro ? user.planExpiresAt : now
      const exp  = new Date(base)
      exp.setMonth(exp.getMonth() + payment.months)

      await prisma.user.update({ where: { id: payment.userId }, data: { plan: 'PRO', planExpiresAt: exp, ...(alreadyPro ? {} : { planStartedAt: now }) } })
      console.log('FRIDE payment OK: user=' + payment.userId + ' PRO until ' + exp.toISOString())
      sendPaymentReceiptEmail(user, payment).catch(e => console.error('[email] receipt send failed:', e.message))
      grantReferralBonusIfEligible(prisma, payment.userId, payment.id).catch(e => console.error('[referral] grant failed:', e.message))
    }

    if (status === 'cancelled' || status === 'failed') {
      await prisma.payment.updateMany({ where: { providerPayId: invoice_id }, data: { status: 'CANCELLED' } })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('FRIDE webhook error:', err.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

// ── POST /api/payments/:paymentId/refund ──────────────────────────
// Self-service refund request. Only handles YooKassa payments automatically
// (it's the only provider with a documented, well-understood refund API
// among the three integrated here) — FRIDE/NOWPayments payments are routed
// to manual support instead of guessing at an undocumented refund flow.
router.post('/:paymentId/refund', refundLimiter, authMiddleware, async (req, res) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { providerPayId: req.params.paymentId, userId: req.user.id }
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Платёж не найден' })

    if (payment.status === 'REFUNDED') {
      return res.status(409).json({ success: false, error: 'Уже возвращён' })
    }
    if (payment.status !== 'SUCCEEDED') {
      return res.status(409).json({ success: false, error: 'Возврат возможен только для успешно оплаченных платежей' })
    }

    const ageMs = Date.now() - new Date(payment.createdAt).getTime()
    if (ageMs > REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return res.status(409).json({
        success: false,
        error: `Возврат доступен только в течение ${REFUND_WINDOW_DAYS} дней с момента оплаты. Обратитесь в поддержку: support@centrio.me`
      })
    }

    if (payment.provider !== 'yookassa') {
      return res.status(501).json({
        success: false,
        error: 'Автоматический возврат для этого способа оплаты пока не поддерживается. Напишите на support@centrio.me — оформим вручную.'
      })
    }

    const ikey = uuidv4()
    const { data: refund } = await axios.post(`${YK_API}/refunds`, {
      payment_id: payment.providerPayId,
      amount: { value: payment.amount.toFixed(2), currency: payment.currency }
    }, {
      auth:    ykAuth(),
      headers: { 'Idempotence-Key': ikey }
    })

    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
    await prisma.user.update({ where: { id: req.user.id }, data: { autoRenew: false } }).catch(() => {})

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    sendRefundConfirmationEmail(user, payment).catch(e => console.error('[email] refund confirmation failed:', e.message))

    res.json({ success: true, data: { refundId: refund.id, status: refund.status } })
  } catch (err) {
    console.error('Refund error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка оформления возврата' })
  }
})

// ── GET /api/payments/health ───────────────────────────────────────
// Lightweight liveness/readiness probe for external uptime monitoring
// (UptimeRobot/BetterStack/etc.) — checks the process is up and the DB is
// reachable. Deliberately unauthenticated (monitoring services can't do
// OAuth), so it must never leak anything beyond a boolean + latency.
router.get('/health', async (_req, res) => {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true, db: 'up', latencyMs: Date.now() - startedAt })
  } catch (err) {
    console.error('[health] DB check failed:', err.message)
    res.status(503).json({ ok: false, db: 'down' })
  }
})

module.exports = router
