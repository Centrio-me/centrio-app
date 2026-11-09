const test = require('node:test')
const assert = require('node:assert/strict')
const { describeOrgAudit } = require('../src/lib/org-audit-text')

const who = (id) => ({ u1: 'anna@firma.ru', u2: 'oleg@firma.ru' })[id] || null

test('a role change reads as a sentence with the person and the new role', () => {
    const d = describeOrgAudit({ action: 'member.role', metaJson: { userId: 'u1', role: 'ADMIN' } }, who)
    assert.equal(d.title, 'Изменена роль')
    assert.equal(d.details, 'anna@firma.ru → администратор')
})

test('strict mode on and off are told apart', () => {
    assert.equal(describeOrgAudit({ action: 'member.strict', metaJson: { userId: 'u1', strictMode: true } }, who).title, 'Строгий режим включён')
    assert.equal(describeOrgAudit({ action: 'member.strict', metaJson: { userId: 'u1', strictMode: false } }, who).title, 'Строгий режим выключен')
})

test('a seat purchase shows seats, months and the new end date', () => {
    const d = describeOrgAudit({ action: 'seats.purchase', metaJson: { mode: 'new', seats: 5, months: 1, expiresAt: '2026-12-09T05:21:31.427Z' } }, who)
    assert.equal(d.title, 'Оплачены места')
    assert.equal(d.details, '5 мест · 1 мес. · до 09.12.2026')
})

test('old action names from before the rename are translated too', () => {
    assert.equal(describeOrgAudit({ action: 'org.messenger.assign', metaJson: { name: 'WhatsApp', userId: 'u2' } }, who).title, 'Назначен мессенджер')
    assert.equal(describeOrgAudit({ action: 'org.messenger.assign', metaJson: { name: 'WhatsApp', userId: 'u2' } }, who).details, 'WhatsApp → oleg@firma.ru')
})

test('an unknown action keeps its code instead of disappearing', () => {
    const d = describeOrgAudit({ action: 'something.new', metaJson: null }, who)
    assert.equal(d.title, 'something.new')
    assert.equal(d.details, null)
})
