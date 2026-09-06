// Referral program: +14 days of Pro granted to BOTH the referrer and the
// referee, triggered on the referee's FIRST successful real payment (never
// at signup — signup-triggered bonuses are trivially farmable with burner
// email addresses; requiring a real payment bounds the cost of abuse to
// "actually pay for Pro once per burner account").
//
// Deliberately excludes provider: 'referral' rows from the "prior payment"
// count below — those are the $0 audit-trail rows this same function
// creates when it grants a bonus, not real purchases, so they must never
// count as someone's "first payment".
//
// Called from every real-money success path in payments-server.js
// (YooKassa webhook, YooKassa status poll, FRIDE webhook, crypto-activate)
// — deliberately NOT called from /promo/redeem, since a free promo code is
// not "a successful payment" in the sense this program means to reward.
const REFERRAL_BONUS_DAYS = 14

async function grantReferralBonusIfEligible(prisma, refereeUserId, currentPaymentId) {
  try {
    const referee = await prisma.user.findUnique({ where: { id: refereeUserId } })
    if (!referee || !referee.referredById || referee.referralBonusGranted) return

    const priorPaymentsWhere = {
      userId: refereeUserId,
      status: 'SUCCEEDED',
      provider: { not: 'referral' }
    }
    if (currentPaymentId) priorPaymentsWhere.id = { not: currentPaymentId }

    const priorPayments = await prisma.payment.count({ where: priorPaymentsWhere })
    if (priorPayments > 0) return // not the referee's first real payment — no bonus

    const referrer = await prisma.user.findUnique({ where: { id: referee.referredById } })
    if (!referrer) return // referrer account no longer exists (e.g. GDPR self-deleted) — nothing to grant

    const now = new Date()
    const extend = (user) => {
      const base = user.planExpiresAt && user.planExpiresAt > now ? user.planExpiresAt : now
      const exp = new Date(base)
      exp.setDate(exp.getDate() + REFERRAL_BONUS_DAYS)
      return exp
    }
    const refereeExp = extend(referee)
    const referrerExp = extend(referrer)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: referee.id },
        data: { plan: 'PRO', planExpiresAt: refereeExp, referralBonusGranted: true }
      }),
      prisma.user.update({
        where: { id: referrer.id },
        data: { plan: 'PRO', planExpiresAt: referrerExp }
      }),
      prisma.payment.create({
        data: { userId: referee.id, amount: 0, currency: 'RUB', status: 'SUCCEEDED', provider: 'referral', plan: 'PRO', months: 0 }
      }),
      prisma.payment.create({
        data: { userId: referrer.id, amount: 0, currency: 'RUB', status: 'SUCCEEDED', provider: 'referral', plan: 'PRO', months: 0 }
      })
    ])

    console.log(`[Referral] bonus granted: referrer=${referrer.id} referee=${referee.id} +${REFERRAL_BONUS_DAYS}d each`)
  } catch (err) {
    // Never let a referral-bonus failure break the payment flow that
    // triggered it — the payment itself already succeeded and the user's
    // own plan was already extended before this function is called.
    console.error('[Referral] bonus grant failed:', err.message)
  }
}

module.exports = { grantReferralBonusIfEligible, REFERRAL_BONUS_DAYS }
