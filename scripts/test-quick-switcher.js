const test = require('node:test')
const assert = require('node:assert/strict')
const { rankItems, swapLayout } = require('../renderer/quick-switcher-logic')

const items = [
    { id: 's:tg', group: 'services', label: 'Telegram', keywords: ['телеграм', 'web.telegram.org'] },
    { id: 's:wa', group: 'services', label: 'WhatsApp Работа', keywords: ['ватсап'] },
    { id: 'p:1', group: 'presets', label: 'Утро: почта и чаты', keywords: [] },
    { id: 'a:dnd', group: 'actions', label: 'Не беспокоить', keywords: ['тишина', 'dnd'] },
    { id: 'a:rp', group: 'actions', label: 'Точки восстановления', keywords: ['откат', 'backup'] }
]

test('an empty query lists services first and keeps the given order inside a group', () => {
    const ids = rankItems(items, '').map((i) => i.id)
    assert.deepEqual(ids.slice(0, 2), ['s:tg', 's:wa'])
})

test('a word start ranks above a match in the middle, the label above keywords', () => {
    assert.equal(rankItems(items, 'tel')[0].id, 's:tg')
    assert.equal(rankItems(items, 'раб')[0].id, 's:wa')
    assert.equal(rankItems(items, 'откат')[0].id, 'a:rp')
})

test('typing in the wrong keyboard layout still finds the item', () => {
    assert.equal(swapLayout('ntktuhfv'), 'телеграм')
    assert.equal(swapLayout('ыуе'), 'set')
    assert.equal(rankItems(items, 'ntktuhfv')[0].id, 's:tg')
    assert.equal(rankItems(items, 'yt ,tcg')[0]?.id, 'a:dnd')
})

test('letters in order also match (initials, skipped letters)', () => {
    assert.equal(rankItems(items, 'тчк вст')[0]?.id, 'a:rp')
})

test('nothing matching gives an empty list', () => {
    assert.deepEqual(rankItems(items, 'zzzzqqq'), [])
})
