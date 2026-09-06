const router = require('express').Router()
const axios  = require('axios')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')

// SECURITY: none of the payment-creation or webhook endpoints in this
// file had any throttling — an authenticated user could spam invoice
// creation against YooKassa/NOWPayments without limit, and the public
// webhook endpoints could be flooded with junk bodies. Self-contained
// in-memory limiter (single-instance only, same tradeoff documented in
// landing/lib/rateLimit.ts and landing/middleware/rateLimit.js — move
// to Redis/Upstash if this API is ever scaled horizontally).
const rlBuckets = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rlBuckets) {
    if (now - entry.windowStart > 10 * 60 * 1000) rlBuckets.delete(key)
  }
}, 60_000)
function rateLimit({ windowMs, max, name }) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown'
    const key = `${name}:${ip}`
    const now = Date.now()
    let entry = rlBuckets.get(key)
    if (!entry || now - entry.windowStart > windowMs) entry = { count: 0, windowStart: now }
    entry.count += 1
    rlBuckets.set(key, entry)
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000))
      res.set('Retry-After', String(retryAfterSec))
      return res.status(429).json({ error: 'Too many requests' })
    }
    next()
  }
}
const createPaymentLimiter   = rateLimit({ windowMs: 5 * 60 * 1000, max: 10,  name: 'payments-create' })
const cryptoCreateLimiter    = rateLimit({ windowMs: 5 * 60 * 1000, max: 10,  name: 'crypto-create' })
const webhookLimiter         = rateLimit({ windowMs: 60 * 1000,     max: 120, name: 'yk-webhook' })
const cryptoWebhookLimiter   = rateLimit({ windowMs: 60 * 1000,     max: 120, name: 'crypto-webhook' })

const YK_SHOP   = process.env.YUKASSA_SHOP_ID
const YK_SECRET = process.env.YUKASSA_SECRET_KEY
const YK_API    = 'https://api.yookassa.ru/v3'
const FRONT     = process.env.FRONTEND_URL || 'https://centrio.me'
const API_URL   = process.env.API_URL || 'https://api.centrio.me'

const NP_KEY    = process.env.NOWPAYMENTS_API_KEY
const NP_IPN    = process.env.NOWPAYMENTS_IPN_SECRET

const PLANS = {
  month: { price: '199.00', months: 1,  label: 'Centrio Pro — 1 месяц' },
  year:  { price: '1590.00', months: 12, label: 'Centrio Pro — 1 год'  }
}

const CRYPTO_PLANS = {
  month: { price: 2.99,  months: 1,  label: 'Centrio Pro — 1 месяц' },
  year:  { price: 17.99, months: 12, label: 'Centrio Pro — 1 год'  }
}

function ykAuth () { return { username: YK_SHOP, password: YK_SECRET } }

// Shared Pro activation logic
async function activateProForUser(userId, months) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return
  const now  = new Date()
  const alreadyPro = user.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > now
  const base = alreadyPro ? user.planExpiresAt : now
  const exp  = new Date(base)
  exp.setMonth(exp.getMonth() + months)
  await prisma.user.update({
    where: { id: userId },
    data:  { plan: 'PRO', planExpiresAt: exp }
  })
  console.log(`✅ PRO activated: user=${userId} until ${exp.toISOString()}`)
  return exp
}

// ── GET /api/payments/plans ────────────────────────────────────────
router.get('/plans', (_req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 'FREE', name: 'Бесплатный', price: 0,
        features: ['До 5 сервисов', 'Базовые функции', 'Уведомления']
      },
      {
        id: 'PRO_MONTH', name: 'Pro — Месяц', price: 199, per: 'month',
        features: ['Безлимит сервисов', 'Облачная синхронизация', 'Папки', 'Поддержка']
      },
      {
        id: 'PRO_YEAR', name: 'Pro — Год', price: 1590, pricePerMonth: 133, per: 'year',
        features: ['Всё из Pro Месяц', 'Приоритетная поддержка', 'Ранний доступ']
      }
    ]
  })
})

// ── POST /api/payments/create  (ЮКасса) ───────────────────────────
router.post('/create', createPaymentLimiter, authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body
    const cfg = PLANS[plan]
    if (!cfg) return res.status(400).json({ success: false, error: 'Неверный план' })

    const ikey = uuidv4()

    const { data: yk } = await axios.post(`${YK_API}/payments`, {
      amount:       { value: cfg.price, currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: `${FRONT}/payment/success?plan=${plan}` },
      capture:      true,
      description:  cfg.label,
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
        userId:        req.user.id,
        amount:        parseFloat(cfg.price),
        currency:      'RUB',
        status:        'PENDING',
        provider:      'yookassa',
        providerPayId: yk.id,
        plan:          'PRO',
        months:        cfg.months
      }
    })

    res.json({ success: true, data: { paymentId: yk.id, confirmationUrl: yk.confirmation.confirmation_url } })
  } catch (err) {
    console.error('Payment create:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания платежа' })
  }
})

// ── POST /api/payments/webhook  (ЮКасса → сервер) ─────────────────
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const { event, object: yk } = req.body || {}
    if (!yk?.id) return res.status(400).json({ error: 'Bad payload' })

    if (event === 'payment.succeeded') {
      const payment = await prisma.payment.findUnique({ where: { providerPayId: yk.id } })
      if (!payment) return res.status(404).json({ error: 'Payment not found' })

      // SECURITY: this endpoint had no authenticity check at all — no
      // signature, no IP allowlist. yk.id (the paymentId) is returned
      // directly to the authenticated user in /create's own response,
      // so any user could create a PENDING payment, never pay, then
      // POST { event: 'payment.succeeded', object: { id: <their own
      // paymentId> } } here and get Pro activated for free. Re-verify
      // the actual status against YooKassa's API before trusting the
      // webhook body, mirroring the existing safe pattern already used
      // in GET /status/:paymentId below.
      const { data: ykStatus } = await axios.get(`${YK_API}/payments/${yk.id}`, { auth: ykAuth() })
      if (ykStatus.status !== 'succeeded') {
        console.warn(`[Webhook] payment ${yk.id} claims succeeded but YooKassa reports '${ykStatus.status}' — ignoring`)
        return res.status(409).json({ error: 'Status mismatch' })
      }

      if (payment.status === 'SUCCEEDED') {
        return res.json({ ok: true, alreadyProcessed: true })
      }

      await prisma.payment.update({
        where: { providerPayId: yk.id },
        data:  { status: 'SUCCEEDED' }
      })

      await activateProForUser(payment.userId, payment.months)
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
      await activateProForUser(payment.userId, payment.months)
    }

    res.json({ success: true, data: { ykStatus: yk.status, payment } })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка проверки статуса' })
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

// ── POST /api/payments/crypto-create  (NOWPayments) ───────────────
router.post('/crypto-create', cryptoCreateLimiter, authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body
    const cfg = CRYPTO_PLANS[plan]
    if (!cfg) return res.status(400).json({ success: false, error: 'Неверный план' })

    const orderId = `${req.user.id}_${plan}_${Date.now()}`

    const { data: invoice } = await axios.post(
      'https://api.nowpayments.io/v1/invoice',
      {
        price_amount:    cfg.price,
        price_currency:  'usd',
        order_id:        orderId,
        order_description: cfg.label,
        ipn_callback_url:  `${API_URL}/api/payments/crypto-webhook`,
        success_url:       `${FRONT}/payment/success`,
        cancel_url:        `${FRONT}/pricing`,
      },
      { headers: { 'x-api-key': NP_KEY, 'Content-Type': 'application/json' } }
    )

    // NOTE: providerPayId stores OUR orderId (not NOWPayments' invoice.id).
    // The IPN webhook only reliably echoes back our own order_id, so this
    // is what crypto-webhook looks the row up by. Storing invoice.id here
    // made that lookup impossible to match correctly (see crypto-webhook).
    await prisma.payment.create({
      data: {
        userId:        req.user.id,
        amount:        cfg.price,
        currency:      'USD',
        status:        'PENDING',
        provider:      'nowpayments',
        providerPayId: orderId,
        plan:          'PRO',
        months:        cfg.months
      }
    })

    res.json({ success: true, data: { paymentId: invoice.id, confirmationUrl: invoice.invoice_url } })
  } catch (err) {
    console.error('Crypto create:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Ошибка создания крипто-платежа' })
  }
})

// ── POST /api/payments/crypto-webhook  (NOWPayments → сервер) ─────
router.post('/crypto-webhook', cryptoWebhookLimiter, async (req, res) => {
  try {
    // SECURITY: fail closed. Previously, if NP_IPN was unset OR the
    // x-nowpayments-sig header was simply absent, verification was
    // skipped entirely and the webhook body was trusted blindly —
    // anyone who knew (or guessed/enumerated) a userId could POST
    // { payment_status: 'finished', order_id: '<userId>_year_0' }
    // with no signature at all and get Pro activated for free/for
    // any victim account. Now both a configured secret AND a valid
    // signature are mandatory.
    if (!NP_IPN) {
      console.error('[Crypto webhook] NOWPAYMENTS_IPN_SECRET not configured — rejecting request')
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    const sig = req.headers['x-nowpayments-sig']
    if (!sig) {
      console.warn('[Crypto webhook] Missing signature header')
      return res.status(401).json({ error: 'Invalid signature' })
    }
    const sorted = JSON.stringify(
      Object.keys(req.body).sort().reduce((acc, k) => { acc[k] = req.body[k]; return acc }, {})
    )
    const expected = crypto.createHmac('sha512', NP_IPN).update(sorted).digest('hex')
    const sigBuf = Buffer.from(String(sig), 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const isValid = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
    if (!isValid) {
      console.warn('[Crypto webhook] Invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const { payment_status, order_id, payment_id } = req.body
    console.log(`[Crypto webhook] status=${payment_status} order=${order_id}`)

    if (payment_status === 'finished' || payment_status === 'confirmed') {
      const parts   = (order_id || '').split('_')
      const userId  = parts[0]
      const plan    = parts[1]
      const months  = plan === 'year' ? 12 : 1

      // IDEMPOTENCY: NOWPayments may send multiple IPN calls for the
      // same payment (e.g. 'confirmed' then 'finished'). Without this
      // check each retry would call activateProForUser again and
      // extend the user's expiry an extra `months` each time.
      // NOTE: also fixes a pre-existing bug where the update matched
      // on a non-existent `order_id` Prisma field (always silently
      // failing, .catch(() => {})) instead of `providerPayId` — the
      // field actually used everywhere else in this codebase. We now
      // match on providerPayId, which crypto-create stores as our
      // own orderId (see below) precisely so this lookup works.
      const existing = await prisma.payment.findFirst({
        where: { providerPayId: order_id, provider: 'nowpayments', status: 'SUCCEEDED' }
      })
      if (existing) {
        return res.json({ ok: true, alreadyProcessed: true })
      }

      await prisma.payment.updateMany({
        where: { providerPayId: order_id, provider: 'nowpayments' },
        data:  { status: 'SUCCEEDED' }
      }).catch(err => console.error('[Crypto webhook] payment status update failed:', err.message))

      await activateProForUser(userId, months)
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Crypto webhook error:', err.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

module.exports = router
