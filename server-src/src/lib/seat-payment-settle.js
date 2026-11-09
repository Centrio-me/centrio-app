// A TEAM seat payment (Payment.orgId set) must credit its organization, never the payer's personal Pro.
// YooKassa sends every notification to /api/payments/webhook, so the personal payment paths hand seat
// payments here (2026-11-09: this branch was lost in the server move and a paid 5-seat order credited nothing).
// The status flip is the atomic claim: only the path that flips it credits, so a payment counts once.
async function settleSeatPayment(payment, yk, provider, deps = {}) {
    const db = deps.db || require('../utils/prisma')
    const credit = deps.credit || require('./org').creditSeatPayment
    const claim = await db.payment.updateMany({ where: { id: payment.id, status: { not: 'SUCCEEDED' } }, data: { status: 'SUCCEEDED' } })
    if (claim.count !== 1) return false
    await credit(payment, yk, provider)
    return true
}

module.exports = { settleSeatPayment }
