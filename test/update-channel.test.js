// Beta testers (owner, 2026-11-12): the owner marks testers by hand on the server; their Centrio reads the beta channel
// and gets test versions first, everyone else stays on the ordinary releases
const test = require('node:test')
const assert = require('node:assert')
const { updateChannelFor } = require('../main/services/update-channel.js')

test('a tester reads the beta channel', () => {
    assert.strictEqual(updateChannelFor({ betaTester: true, version: '3.8.1' }), 'beta')
})

test('an ordinary user on an ordinary version is left alone', () => {
    assert.strictEqual(updateChannelFor({ betaTester: false, version: '3.8.1' }), null)
    assert.strictEqual(updateChannelFor({ version: '3.8.1' }), null)
})

test('someone taken off the list while on a test version goes back to the ordinary release', () => {
    assert.strictEqual(updateChannelFor({ betaTester: false, version: '3.8.2-beta.1' }), 'latest')
})

test('a test version installed by a link keeps reading the beta channel before the account is known', () => {
    assert.strictEqual(updateChannelFor({ betaTester: undefined, version: '3.8.2-beta.1' }), 'beta')
})
