// Run with: node --test scripts/test-team-device.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { signProof } = require('../main/services/teamDeviceProof')
const { verifyDeviceProof } = require('../server-src/src/lib/team-commands')
const vaultCrypto = require('../main/services/vaultCrypto')
const { orgPartitionIds } = require('../main/services/teamWipePlan')

test('the proof made with the vault device key is accepted by the server check', async () => {
    const pair = await vaultCrypto.generateDeviceKeyPair()
    const now = new Date('2026-11-10T10:00:20Z')
    const proof = signProof(pair.privateKey, 'dk-1', now)
    assert.equal(verifyDeviceProof({ publicKey: pair.publicKey, deviceKeyId: 'dk-1', proof, now }), true)
    assert.equal(verifyDeviceProof({ publicKey: pair.publicKey, deviceKeyId: 'dk-2', proof, now }), false)
})

test('all team sessions are found from the registered tabs and the partition folders on disk', () => {
    const ids = orgPartitionIds(['org%3Aa1', 'm123', 'org%3Ab2', 'org%3Aa1'], ['org:c3'])
    assert.deepEqual(ids.sort(), ['org:a1', 'org:b2', 'org:c3'])
})

test('a wipe for chosen messengers touches only those', () => {
    assert.deepEqual(orgPartitionIds(['org%3Aa1', 'org%3Ab2'], [], ['a1']), ['org:a1'])
})
