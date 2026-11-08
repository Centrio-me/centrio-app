const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { planCommands, parseCommandBody, verifyDeviceProof, proofMessage, isAllowedAssignmentUrl, deliverySummary } = require('../src/lib/team-commands')

function deviceKey() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    return {
        spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        pkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
    }
}
function sign(pkcs8, msg) {
    const key = crypto.createPrivateKey({ key: Buffer.from(pkcs8, 'base64'), format: 'der', type: 'pkcs8' })
    return crypto.sign('sha256', Buffer.from(msg), key).toString('base64')
}

test('wipe for a user with two devices makes two commands', () => {
    const cmds = planCommands('wipe', { orgId: 'o', userId: 'u', deviceKeyIds: ['d1', 'd2'], payload: { assignmentIds: 'all' }, createdById: 'boss' })
    assert.equal(cmds.length, 2)
    assert.deepEqual(cmds.map((c) => c.deviceKeyId), ['d1', 'd2'])
    assert.deepEqual(cmds[0], { orgId: 'o', userId: 'u', deviceKeyId: 'd1', kind: 'wipe', payload: { assignmentIds: 'all' }, createdById: 'boss' })
})

test('a person without registered devices still gets one command for his account', () => {
    const cmds = planCommands('reload', { orgId: 'o', userId: 'u', deviceKeyIds: [], payload: { assignmentId: 'a' }, createdById: 'boss' })
    assert.deepEqual(cmds.map((c) => c.deviceKeyId), ['user:u'])
})

test('parseCommandBody accepts known kinds and checks the messenger belongs to the person', () => {
    const own = new Set(['a1'])
    assert.deepEqual(parseCommandBody({ kind: 'pause', assignmentId: 'a1' }, own), { kind: 'pause', payload: { assignmentId: 'a1' } })
    assert.deepEqual(parseCommandBody({ kind: 'wipe' }, own), { kind: 'wipe', payload: { assignmentIds: 'all' } })
    assert.ok(parseCommandBody({ kind: 'pause', assignmentId: 'zz' }, own).error)
    assert.ok(parseCommandBody({ kind: 'pause' }, own).error)
    assert.ok(parseCommandBody({ kind: 'format-disk' }, own).error)
})

test('a fresh proof signed by the device key is accepted', () => {
    const k = deviceKey()
    const now = new Date('2026-11-10T10:00:30Z')
    const proof = sign(k.pkcs8, proofMessage('dk1', now))
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof, now }), true)
})

test('a proof from one minute ago is still accepted, older than 2 minutes is rejected', () => {
    const k = deviceKey()
    const now = new Date('2026-11-10T10:05:10Z')
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof: sign(k.pkcs8, proofMessage('dk1', new Date(now - 60000))), now }), true)
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof: sign(k.pkcs8, proofMessage('dk1', new Date(now - 180000))), now }), false)
})

test('a proof for another device or from another key is rejected', () => {
    const k = deviceKey()
    const other = deviceKey()
    const now = new Date()
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof: sign(k.pkcs8, proofMessage('dk2', now)), now }), false)
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof: sign(other.pkcs8, proofMessage('dk1', now)), now }), false)
    assert.equal(verifyDeviceProof({ publicKey: k.spki, deviceKeyId: 'dk1', proof: 'garbage', now }), false)
})

test('only web addresses can be assigned to an employee', () => {
    assert.equal(isAllowedAssignmentUrl('https://web.whatsapp.com/'), true)
    assert.equal(isAllowedAssignmentUrl('http://intranet.local/crm'), true)
    for (const bad of ['file:///C:/x', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://x', 'not a url', '']) {
        assert.equal(isAllowedAssignmentUrl(bad), false, bad)
    }
})

test('deliverySummary counts devices that confirmed the latest command of a kind', () => {
    const at = (s) => new Date(`2026-11-10T10:00:${s}Z`)
    const rows = [
        { kind: 'wipe', deviceKeyId: 'd1', createdAt: at('01'), doneAt: at('05') },
        { kind: 'wipe', deviceKeyId: 'd2', createdAt: at('01'), doneAt: null },
        { kind: 'reload', deviceKeyId: 'd1', createdAt: at('00'), doneAt: at('02') }
    ]
    assert.deepEqual(deliverySummary(rows, 'wipe'), { done: 1, total: 2 })
    assert.deepEqual(deliverySummary(rows, 'pause'), { done: 0, total: 0 })
})

const { passwordSurvivesUrlChange } = require('../src/lib/team-commands')

test('a saved password is dropped when the messenger moves to another site', () => {
    assert.equal(passwordSurvivesUrlChange('https://web.whatsapp.com/', 'https://web.whatsapp.com/?lang=ru'), true)
    assert.equal(passwordSurvivesUrlChange('https://web.whatsapp.com/', 'https://evil.example/'), false)
    assert.equal(passwordSurvivesUrlChange('https://web.whatsapp.com/', 'http://web.whatsapp.com/'), false)
    assert.equal(passwordSurvivesUrlChange('https://mail.yandex.ru/', 'https://passport.yandex.ru/'), false)
})
