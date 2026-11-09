const test = require('node:test')
const assert = require('node:assert/strict')
const { settleSeatPayment } = require('../src/lib/seat-payment-settle')

function fakeDb(claimCount) {
    const calls = []
    return { calls, payment: { updateMany: async (args) => { calls.push(args); return { count: claimCount } } } }
}

test('a team seat payment is claimed once and credited to its organization', async () => {
    const db = fakeDb(1)
    const credited = []
    const ok = await settleSeatPayment({ id: 'p1', orgId: 'o1' }, { status: 'succeeded' }, 'yookassa', { db, credit: async (...a) => credited.push(a) })
    assert.equal(ok, true)
    assert.deepEqual(db.calls[0], { where: { id: 'p1', status: { not: 'SUCCEEDED' } }, data: { status: 'SUCCEEDED' } })
    assert.equal(credited.length, 1)
    assert.equal(credited[0][2], 'yookassa')
})

test('a seat payment already claimed by another path is not credited again', async () => {
    const credited = []
    const ok = await settleSeatPayment({ id: 'p1', orgId: 'o1' }, {}, 'yookassa', { db: fakeDb(0), credit: async (...a) => credited.push(a) })
    assert.equal(ok, false)
    assert.equal(credited.length, 0)
})
