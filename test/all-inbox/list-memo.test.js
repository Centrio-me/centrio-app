'use strict'
// node --test test/all-inbox
const test = require('node:test')
const assert = require('node:assert/strict')
const { withListMemo, resolveListAvatars } = require('../../renderer/all-inbox/list-memo')

// the page script runs in the tab; here a plain object stands in for its window
function runInTab(script, win) {
    return new Function('window', `return ${script}`)(win)
}

const PIC = 'data:image/jpeg;base64,AAAA'

test('an avatar crosses from the tab once; after that only its key comes', () => {
    const win = {}
    const script = withListMemo(`[{ key: "1", title: "A", avatar: ${JSON.stringify(PIC)} }]`, 's1')
    assert.equal(runInTab(script, win)[0].avatar, PIC)
    assert.equal(runInTab(script, win)[0].avatar, '@1')
})

test('a changed avatar crosses again', () => {
    const win = {}
    let pic = PIC
    win.pic = () => pic
    const script = withListMemo('[{ key: "1", title: "A", avatar: window.pic() }]', 's1')
    runInTab(script, win)
    pic = 'data:image/jpeg;base64,BBBBBB'
    assert.equal(runInTab(script, win)[0].avatar, pic)
})

test('a new session sends every avatar again', () => {
    const win = {}
    const run = (s) => runInTab(withListMemo(`[{ key: "1", title: "A", avatar: ${JSON.stringify(PIC)} }]`, s), win)
    run('s1')
    assert.equal(run('s2')[0].avatar, PIC)
})

test('keys are filled from what we already have; a key we do not have is reported', () => {
    const cache = new Map()
    const first = resolveListAvatars([{ key: '1', avatar: PIC }, { key: '2', avatar: '' }], cache)
    assert.equal(first.missing, false)
    assert.equal(first.chats[0].avatar, PIC)
    const again = resolveListAvatars([{ key: '1', avatar: '@1' }], cache)
    assert.equal(again.chats[0].avatar, PIC)
    const lost = resolveListAvatars([{ key: '3', avatar: '@3' }], cache)
    assert.equal(lost.missing, true)
    assert.equal(lost.chats[0].avatar, '')
})

test('a list that is not a list passes through untouched', () => {
    assert.deepEqual(resolveListAvatars(null, new Map()), { chats: null, missing: false })
})
