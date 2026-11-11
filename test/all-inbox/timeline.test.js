'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTimeline } = require('../../renderer/all-inbox/timeline')

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)
const msgs = (list) => buildTimeline(list, NOW).filter((r) => r.type === 'msg')

test('a file size shows the file, not Telegram\'s download progress', () => {
    const [row] = msgs([{ id: '1', kind: 'file', name: 'a.png', size: '0 Б / 25 КБ', at: NOW }])
    assert.equal(row.size, '25 КБ')
    const [plain] = msgs([{ id: '2', kind: 'file', name: 'b.pdf', size: '1.2 MB', at: NOW }])
    assert.equal(plain.size, '1.2 MB')
})

test('messages get a day divider and keep their order', () => {
    const rows = buildTimeline([{ id: '1', text: 'а', at: NOW - 1000 }, { id: '2', text: 'б', at: NOW }], NOW)
    assert.equal(rows[0].type, 'day')
    assert.deepEqual(rows.filter((r) => r.type === 'msg').map((r) => r.text), ['а', 'б'])
})
