// «Друзья Centrio»: the server list of beta testers — the owner adds people by hand, people can also tick it themselves
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beta-')), 'beta-testers.json')
process.env.BETA_TESTERS_FILE = FILE
const { isBetaTester, setSelf } = require('../server-src/src/lib/beta-testers.js')

test('nobody is a tester without the list', () => {
    assert.strictEqual(isBetaTester('u1'), false)
})

test('a person the owner added is a tester', () => {
    fs.writeFileSync(FILE, JSON.stringify({ testers: [{ userId: 'oleg', name: 'Олег', source: 'owner' }] }))
    assert.strictEqual(isBetaTester('oleg'), true)
    assert.strictEqual(isBetaTester('u1'), false)
})

test('ticking the box adds the person once and keeps the others', () => {
    assert.strictEqual(setSelf('u1', true, 'Анна'), true)
    assert.strictEqual(setSelf('u1', true, 'Анна'), true)
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8')).testers
    assert.deepStrictEqual(list.map((t) => [t.userId, t.source]), [['oleg', 'owner'], ['u1', 'self']])
    assert.strictEqual(isBetaTester('u1'), true)
})

test('unticking takes the person off, also when the owner added them', () => {
    assert.strictEqual(setSelf('u1', false), false)
    assert.strictEqual(setSelf('oleg', false), false)
    assert.strictEqual(isBetaTester('u1'), false)
    assert.strictEqual(isBetaTester('oleg'), false)
})
