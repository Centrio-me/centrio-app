const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanClientId, cleanYclid, pendingSignups, buildUploadCsv } = require('../src/lib/metrika-offline')

test('only a Metrica client id made of digits is kept', () => {
    assert.equal(cleanClientId('1731000000123456789'), '1731000000123456789')
    assert.equal(cleanClientId(' 17310000001234 '), '17310000001234')
    assert.equal(cleanClientId('abc'), null)
    assert.equal(cleanClientId('1'.repeat(40)), null)
    assert.equal(cleanClientId(null), null)
})

test('a yclid is digits only', () => {
    assert.equal(cleanYclid('5948371112983745'), '5948371112983745')
    assert.equal(cleanYclid('x123'), null)
})

test('signups with a client id that were not sent yet are pending, others are skipped', () => {
    const users = [
        { id: 'a', createdAt: new Date('2026-11-08T10:00:00Z'), signupSource: JSON.stringify({ source: 'yandex', ymClientId: '1731000000111111111' }) },
        { id: 'b', createdAt: new Date('2026-11-08T11:00:00Z'), signupSource: JSON.stringify({ source: 'yandex', ymClientId: '1731000000222222222', offlineSentAt: '2026-11-08T12:00:00Z' }) },
        { id: 'c', createdAt: new Date('2026-11-08T11:30:00Z'), signupSource: JSON.stringify({ source: 'yandex' }) },
        { id: 'd', createdAt: new Date('2026-11-08T11:40:00Z'), signupSource: 'not json' }
    ]
    assert.deepEqual(pendingSignups(users).map((p) => p.userId), ['a'])
})

test('the upload is a CSV of client id, goal and unix time', () => {
    const csv = buildUploadCsv([{ userId: 'a', clientId: '1731000000111111111', at: new Date('2026-11-08T10:00:00Z') }], 'signup')
    assert.equal(csv, 'ClientId,Target,DateTime\n1731000000111111111,signup,1794132000\n')
})
