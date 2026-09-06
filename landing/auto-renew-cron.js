// Cron-задача для автопродления подписок
// Запускается в src/cron/autoRenew.js на сервере

const cron = require('node-cron')
const axios = require('axios')
const { v4: uuidv4 } = require('uuid')
const prisma = require('../utils/prisma')
const { sendAutoRenewFailedEmail, sendOrgSeatsRenewFailedEmail } = require('../lib/email')

const YK_SHOP   = process.env.YUKASSA_SHOP_ID
const YK_SECRET = process.env.YUKASSA_SECRET_KEY
const YK_API    = 'https://api.yookassa.ru/v3'

function ykAuth () { return { username: YK_SHOP, password: YK_SECRET } }

async function runAutoRenew () {
  console.log('[AutoRenew] Checking subscriptions...')

  const now      = new Date()
  const deadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) // +3 дня

  // Найти PRO-пользователей у которых истекает через ≤3 дня и включено автопродление
  const users = await prisma.user.findMany({
    where: {
      plan:             'PRO',
      autoRenew:        true,
      autoRenewPayMethodId: { not: null },
      planExpiresAt:    { lte: deadline, gt: now }
    },
    select: {
      id: true, email: true, plan: true,
      planExpiresAt: true, autoRenewPayMethodId: true,
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { months: true, amount: true }
      }
    }
  })

  console.log('[AutoRenew] Found ' + users.length + ' subscriptions to renew')

  for (const user of users) {
    try {
      // Определяем период продления по последнему платежу (1 мес или 12 мес)
      const lastPayment = user.payments[0]
      const months  = lastPayment?.months || 1
      const amount  = months === 12 ? '1590.00' : '199.00'
      const label   = months === 12 ? 'Centrio Pro — 1 год (автопродление)' : 'Centrio Pro — 1 месяц (автопродление)'

      // Проверяем: не было ли уже попытки продления в последние 24 часа
      const recentLog = await prisma.autoRenewLog.findFirst({
        where: {
          userId:    user.id,
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        }
      })
      if (recentLog) {
        console.log('[AutoRenew] Skipping ' + user.email + ' — already attempted in 24h')
        continue
      }

      const ikey = uuidv4()

      // Создаём платёж с сохранённым методом оплаты
      const { data: yk } = await axios.post(`${YK_API}/payments`, {
        amount:            { value: amount, currency: 'RUB' },
        capture:           true,
        description:       label,
        payment_method_id: user.autoRenewPayMethodId,
        metadata:          { userId: user.id, plan: 'PRO', months, autoRenew: true },
        receipt: {
          customer: { email: user.email },
          items: [{
            description:     label,
            quantity:        '1.00',
            amount:          { value: amount, currency: 'RUB' },
            vat_code:        1,
            payment_mode:    'full_payment',
            payment_subject: 'service'
          }]
        }
      }, {
        auth:    ykAuth(),
        headers: { 'Idempotence-Key': ikey }
      })

      // Запись в БД
      const payment = await prisma.payment.create({
        data: {
          userId:        user.id,
          amount:        parseFloat(amount),
          currency:      'RUB',
          status:        yk.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
          provider:      'yookassa',
          providerPayId: yk.id,
          plan:          'PRO',
          months
        }
      })

      await prisma.autoRenewLog.create({
        data: { userId: user.id, paymentId: payment.id, status: yk.status }
      })

      // Если сразу succeeded (при сохранённом методе обычно так)
      if (yk.status === 'succeeded') {
        const base = user.planExpiresAt && user.planExpiresAt > now ? user.planExpiresAt : now
        const exp  = new Date(base)
        exp.setMonth(exp.getMonth() + months)
        await prisma.user.update({
          where: { id: user.id },
          data:  { plan: 'PRO', planExpiresAt: exp }
        })
        console.log('[AutoRenew] Renewed ' + user.email + ' until ' + exp.toISOString())
      } else if (yk.status === 'canceled') {
        // Soft failure (e.g. declined card) — YooKassa returns a normal
        // response here, not an error, so this never hit the catch block
        // and the user was never told their card was declined.
        console.log('[AutoRenew] Payment declined for ' + user.email + ' status=' + yk.status)
        sendAutoRenewFailedEmail(user, yk.cancellation_details?.reason || 'payment declined')
          .catch(e => console.error('[AutoRenew] failure email send failed:', e.message))
      } else {
        console.log('[AutoRenew] Payment created for ' + user.email + ' status=' + yk.status)
      }

    } catch (err) {
      console.error('[AutoRenew] Error for ' + user.email + ':', err.response?.data || err.message)
      await prisma.autoRenewLog.create({
        data: { userId: user.id, status: 'ERROR', error: String(err.message).slice(0, 200) }
      }).catch(() => {})
      // Previously silent beyond the log row — the user had no idea their
      // subscription failed to renew until Pro access just stopped working.
      sendAutoRenewFailedEmail(user, err.response?.data?.description || err.message)
        .catch(e => console.error('[AutoRenew] failure email send failed:', e.message))
    }
  }

  // Понизить план истёкших PRO-пользователей без автопродления
  const expired = await prisma.user.updateMany({
    where: { plan: 'PRO', planExpiresAt: { lt: now } },
    data:  { plan: 'FREE', autoRenew: false }
  })
  if (expired.count > 0) {
    console.log('[AutoRenew] Downgraded ' + expired.count + ' expired PRO users to FREE')
  }
}

// Корпоративная версия (TEAM) — Phase 1 seat auto-renew (см. Obsidian →
// Centrio → Корпоративная версия). Mirrors runAutoRenew() above almost
// exactly (same YooKassa saved-payment-method flow, same 24h dedupe window,
// same soft-failure vs. hard-error split) but operates on Organization rows
// instead of User rows, and logs to OrgAuditLog instead of AutoRenewLog —
// AutoRenewLog.userId is a required field in the current schema, so reusing
// it here would need its own migration; OrgAuditLog already exists for
// exactly this per-org activity trail and the org's OWNER can see renewal
// attempts there via GET /api/org/:orgId/audit.
async function runOrgSeatAutoRenew () {
  console.log('[AutoRenew] Checking organization seats...')

  const now      = new Date()
  const deadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) // +3 дня

  const orgs = await prisma.organization.findMany({
    where: {
      autoRenewSeats: true,
      autoRenewPayMethodId: { not: null },
      seatsExpiresAt: { lte: deadline, gt: now }
    },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      payments: {
        where: { status: 'SUCCEEDED', orgId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { months: true, seats: true }
      }
    }
  })

  console.log('[AutoRenew] Found ' + orgs.length + ' organizations to renew seats for')

  for (const org of orgs) {
    try {
      const lastPayment = org.payments[0]
      const months = lastPayment?.months || 1
      const seats  = lastPayment?.seats || org.seatLimit
      // Same TEAM Старт per-seat pricing as landing/org-routes.js's
      // SEAT_PLANS — kept in sync manually since this file and org-routes.js
      // are deployed as separate route/cron modules (see deploy-path notes
      // in both files); if pricing changes, update both.
      const pricePerSeat = months === 12 ? 149 * 12 : 179
      const amount = (pricePerSeat * seats).toFixed(2)
      const label  = months === 12
        ? `Centrio TEAM Старт — ${seats} мест, 1 год (автопродление)`
        : `Centrio TEAM Старт — ${seats} мест, 1 месяц (автопродление)`

      const recentLog = await prisma.orgAuditLog.findFirst({
        where: {
          orgId: org.id,
          action: { startsWith: 'seats.autorenew' },
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        }
      })
      if (recentLog) {
        console.log('[AutoRenew] Skipping org ' + org.id + ' — already attempted in 24h')
        continue
      }

      const ikey = uuidv4()
      const { data: yk } = await axios.post(`${YK_API}/payments`, {
        amount:            { value: amount, currency: 'RUB' },
        capture:           true,
        description:       label,
        payment_method_id: org.autoRenewPayMethodId,
        metadata:          { orgId: org.id, plan: 'TEAM', seats, months, autoRenew: true },
        receipt: {
          customer: { email: org.owner.email },
          items: [{
            description:     label,
            quantity:        '1.00',
            amount:          { value: amount, currency: 'RUB' },
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
          userId:        org.ownerId,
          amount:        parseFloat(amount),
          currency:      'RUB',
          status:        yk.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
          provider:      'yookassa',
          providerPayId: yk.id,
          plan:          'TEAM',
          months,
          orgId:         org.id,
          seats
        }
      })

      if (yk.status === 'succeeded') {
        const base = org.seatsExpiresAt && org.seatsExpiresAt > now ? org.seatsExpiresAt : now
        const exp  = new Date(base)
        exp.setMonth(exp.getMonth() + months)
        await prisma.organization.update({ where: { id: org.id }, data: { seatsExpiresAt: exp } })
        await prisma.orgAuditLog.create({
          data: { orgId: org.id, actorUserId: org.ownerId, action: 'seats.autorenew.success', metaJson: { seats, months, expiresAt: exp } }
        })
        console.log('[AutoRenew] Renewed seats for org ' + org.id + ' until ' + exp.toISOString())
      } else if (yk.status === 'canceled') {
        // Soft failure (e.g. declined card) — same YooKassa behavior as the
        // personal-plan branch above: a normal response, not a thrown error.
        console.log('[AutoRenew] Seat payment declined for org ' + org.id + ' status=' + yk.status)
        await prisma.orgAuditLog.create({
          data: { orgId: org.id, actorUserId: org.ownerId, action: 'seats.autorenew.failed', metaJson: { reason: yk.cancellation_details?.reason || 'payment declined' } }
        })
        sendOrgSeatsRenewFailedEmail(org.owner, org.name, yk.cancellation_details?.reason || 'payment declined')
          .catch(e => console.error('[AutoRenew] org failure email send failed:', e.message))
      } else {
        console.log('[AutoRenew] Seat payment created for org ' + org.id + ' status=' + yk.status)
      }
    } catch (err) {
      console.error('[AutoRenew] Error for org ' + org.id + ':', err.response?.data || err.message)
      await prisma.orgAuditLog.create({
        data: { orgId: org.id, actorUserId: org.ownerId, action: 'seats.autorenew.error', metaJson: { error: String(err.message).slice(0, 200) } }
      }).catch(() => {})
      sendOrgSeatsRenewFailedEmail(org.owner, org.name, err.response?.data?.description || err.message)
        .catch(e => console.error('[AutoRenew] org failure email send failed:', e.message))
    }
  }

  // Понизить организации с истёкшими местами и без автопродления — членство
  // и данные не удаляются (Phase 1 намеренно не реализует блокировку
  // доступа участников при истечении, это UI-предупреждение уровня Phase 2+
  // вместе с остальной org-policy механикой), но autoRenewSeats/токен оплаты
  // сбрасываются так же, как это делается для личных PRO-подписок выше.
  const expiredOrgs = await prisma.organization.updateMany({
    where: { seatsExpiresAt: { lt: now }, autoRenewSeats: true },
    data:  { autoRenewSeats: false }
  })
  if (expiredOrgs.count > 0) {
    console.log('[AutoRenew] Disabled auto-renew for ' + expiredOrgs.count + ' expired organizations')
  }
}

function startAutoRenewCron () {
  // Каждый день в 10:00 UTC
  cron.schedule('0 10 * * *', async () => {
    try { await runAutoRenew() }
    catch (e) { console.error('[AutoRenew] Cron error:', e.message) }
    try { await runOrgSeatAutoRenew() }
    catch (e) { console.error('[AutoRenew] Org seats cron error:', e.message) }
  })
  console.log('[AutoRenew] Cron scheduled: daily at 10:00 UTC')
}

module.exports = { startAutoRenewCron, runAutoRenew, runOrgSeatAutoRenew }
