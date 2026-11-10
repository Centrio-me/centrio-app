'use strict'
// «Удалил программу» (3.7.4, Windows): the app leaves its anonymous install id where the uninstaller can read it
// (build/installer.nsh), and links that id to the account once per launch while signed in.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { uninstallFilePayload, shouldWriteUninstallFile, writeUninstallFile, UNINSTALL_FILE, createLinker } = require('../main/services/uninstallMark')

const ID = '2f1c9a4e-8b7d-4c3a-9e1f-0a2b3c4d5e6f'

test('the file holds only the install id and the version', () => {
    assert.deepStrictEqual(uninstallFilePayload(ID, '3.7.4'), { visitorId: ID, appVersion: '3.7.4' })
    assert.strictEqual(uninstallFilePayload('not-an-id', '3.7.4'), null)
})

test('only a real Windows install leaves the file', () => {
    assert.strictEqual(shouldWriteUninstallFile({ platform: 'win32', countsAsVisitor: true }), true)
    assert.strictEqual(shouldWriteUninstallFile({ platform: 'darwin', countsAsVisitor: true }), false)
    assert.strictEqual(shouldWriteUninstallFile({ platform: 'win32', countsAsVisitor: false }), false)
})

test('the file is written next to the profile and rewritten when the version changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-'))
    assert.strictEqual(writeUninstallFile(dir, ID, '3.7.4'), true)
    const file = path.join(dir, UNINSTALL_FILE)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { visitorId: ID, appVersion: '3.7.4' })
    assert.strictEqual(writeUninstallFile(dir, ID, '3.7.4'), false) // same content: no write
    assert.strictEqual(writeUninstallFile(dir, ID, '3.7.5'), true)
    assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).appVersion, '3.7.5')
})

test('the account link is sent once per launch and only after a successful sign-in check', async () => {
    const sent = []
    const link = createLinker((token, body) => { sent.push([token, body]); return Promise.resolve({}) })
    await link('t1', ID, '3.7.4')
    await link('t1', ID, '3.7.4')
    assert.strictEqual(sent.length, 1)
    assert.deepStrictEqual(sent[0], ['t1', { visitorId: ID, appVersion: '3.7.4', platform: process.platform }])
})

test('a failed link is tried again next time, a missing token never sends', async () => {
    let calls = 0
    const link = createLinker(() => { calls++; return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({}) })
    await link('', ID, '3.7.4')
    assert.strictEqual(calls, 0)
    await link('t', ID, '3.7.4')
    await link('t', ID, '3.7.4')
    await link('t', ID, '3.7.4')
    assert.strictEqual(calls, 2)
})
