'use strict'
// «Все мессенджеры»: the message field's attachments and recently used emoji
const test = require('node:test')
const assert = require('node:assert/strict')
const { addFiles, removeFile, formatSize, MAX_ATTACH } = require('../renderer/all-inbox/attachments')

const f = (path, size = 10) => ({ path, name: path.split('/').pop(), size, thumb: '' })

test('files are added once each and in order', () => {
    const list = addFiles([f('C:/a.png')], [f('C:/b.pdf'), f('C:/a.png')])
    assert.deepEqual(list.map((x) => x.name), ['a.png', 'b.pdf'])
})

test('no more than the limit, and the old list is not changed', () => {
    const before = [f('C:/a.png')]
    const many = Array.from({ length: MAX_ATTACH + 3 }, (_, i) => f(`C:/f${i}.txt`))
    const after = addFiles(before, many)
    assert.equal(after.length, MAX_ATTACH)
    assert.equal(before.length, 1)
})

test('broken entries from the main process are dropped', () => {
    assert.deepEqual(addFiles([], [null, { name: 'x' }, f('')]), [])
})

test('a file is removed by its path', () => {
    assert.deepEqual(removeFile([f('C:/a.png'), f('C:/b.pdf')], 'C:/a.png').map((x) => x.name), ['b.pdf'])
})

test('sizes read like in messengers', () => {
    assert.equal(formatSize(900), '900 Б')
    assert.equal(formatSize(24840), '24,3 КБ')
    assert.equal(formatSize(5 * 1024 * 1024), '5 МБ')
    assert.equal(formatSize(1.5 * 1024 * 1024 * 1024), '1,5 ГБ')
})

const { rememberRecent, RECENT_MAX } = require('../renderer/all-inbox/emoji-picker-recent')

test('a picked emoji moves to the front of the recent ones, the list stays short', () => {
    assert.deepEqual(rememberRecent(['😀', '👍', '❤️'], '👍'), ['👍', '😀', '❤️'])
    const full = Array.from({ length: RECENT_MAX }, (_, i) => String(i))
    assert.equal(rememberRecent(full, '🔥').length, RECENT_MAX)
    assert.equal(rememberRecent(full, '🔥')[0], '🔥')
})

const { pickBackground, BACKGROUNDS, DEFAULT_BG } = require('../renderer/all-inbox/chat-backgrounds')

test('a saved background is kept only while it is still on the list', () => {
    assert.equal(pickBackground('ocean'), 'ocean')
    assert.equal(pickBackground('removed-one'), DEFAULT_BG)
    assert.equal(pickBackground(null), DEFAULT_BG)
    assert.ok(BACKGROUNDS.some((b) => b.id === DEFAULT_BG))
})

const { createDrafts } = require('../renderer/all-inbox/drafts')

test('an unsent text stays with its chat while you look at another one', () => {
    const drafts = createDrafts()
    drafts.keep('tg::1', 'привет, как')
    drafts.keep('max::2', '')
    assert.equal(drafts.take('tg::1'), 'привет, как')
    assert.equal(drafts.take('max::2'), '')
    drafts.keep('tg::1', '   ')
    assert.equal(drafts.take('tg::1'), '')
})

test('a sent message leaves no draft behind, and there are not too many kept', () => {
    const drafts = createDrafts(3)
    drafts.keep('a', 'x'); drafts.keep('b', 'y'); drafts.keep('c', 'z'); drafts.keep('d', 'w')
    assert.equal(drafts.take('a'), '')
    drafts.forget('d')
    assert.equal(drafts.take('d'), '')
    assert.equal(drafts.take('c'), 'z')
})
