'use strict'
// Quick task text, Todoist style: the date and the priority are written right in the text and taken out of it.
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseQuickTask, isoDate, tasksByDate, dayTasks, overdueTasks } = require('../shared/task-parse')

// Monday 9 November 2026, 10:00
const NOW = new Date(2026, 10, 9, 10, 0, 0)

test('plain text stays as it is, without a date', () => {
    assert.deepEqual(parseQuickTask('Позвонить Олегу', NOW), { text: 'Позвонить Олегу', dueDate: null, priority: 'none' })
})

test('сегодня / завтра / послезавтра', () => {
    assert.equal(parseQuickTask('Отчёт сегодня', NOW).dueDate, '2026-11-09')
    assert.deepEqual(parseQuickTask('Отчёт завтра', NOW), { text: 'Отчёт', dueDate: '2026-11-10', priority: 'none' })
    assert.equal(parseQuickTask('послезавтра оплатить счёт', NOW).dueDate, '2026-11-11')
    assert.equal(parseQuickTask('послезавтра оплатить счёт', NOW).text, 'оплатить счёт')
})

test('English words work too', () => {
    assert.equal(parseQuickTask('Call Anna tomorrow', NOW).dueDate, '2026-11-10')
    assert.equal(parseQuickTask('Call Anna today', NOW).text, 'Call Anna')
})

test('a weekday means the next such day (today counts as next week)', () => {
    assert.equal(parseQuickTask('Созвон в пятницу', NOW).dueDate, '2026-11-13')
    assert.equal(parseQuickTask('Созвон в пт', NOW).dueDate, '2026-11-13')
    assert.equal(parseQuickTask('Созвон в пятницу', NOW).text, 'Созвон')
    assert.equal(parseQuickTask('Планёрка в понедельник', NOW).dueDate, '2026-11-16')
    assert.equal(parseQuickTask('Планёрка вс', NOW).dueDate, '2026-11-15')
})

test('через N дней / неделю', () => {
    assert.equal(parseQuickTask('Продлить домен через 3 дня', NOW).dueDate, '2026-11-12')
    assert.equal(parseQuickTask('Продлить домен через неделю', NOW).dueDate, '2026-11-16')
    assert.equal(parseQuickTask('Продлить домен через 3 дня', NOW).text, 'Продлить домен')
})

test('numeric dates: 12.11, 12.11.2027, past day this year goes to next year', () => {
    assert.equal(parseQuickTask('Сдать 12.11', NOW).dueDate, '2026-11-12')
    assert.equal(parseQuickTask('Сдать 12.11.2027', NOW).dueDate, '2027-11-12')
    assert.equal(parseQuickTask('Сдать 05.01', NOW).dueDate, '2027-01-05')
    assert.equal(parseQuickTask('Сдать 31.02', NOW).dueDate, null)
})

test('day and month name: 12 ноября, 3 янв', () => {
    assert.equal(parseQuickTask('ДР Ани 12 ноября', NOW).dueDate, '2026-11-12')
    assert.equal(parseQuickTask('ДР Ани 12 ноября', NOW).text, 'ДР Ани')
    assert.equal(parseQuickTask('Налоги 3 янв', NOW).dueDate, '2027-01-03')
})

test('priority: !1 high, !2 medium, !3 low, and p1..p3', () => {
    assert.deepEqual(parseQuickTask('Срочно счёт !1 завтра', NOW), { text: 'Срочно счёт', dueDate: '2026-11-10', priority: 'high' })
    assert.equal(parseQuickTask('Почта !2', NOW).priority, 'medium')
    assert.equal(parseQuickTask('Почта p3', NOW).priority, 'low')
})

test('version numbers and decimals are not dates', () => {
    assert.deepEqual(parseQuickTask('Выпустить 3.7.2', NOW), { text: 'Выпустить 3.7.2', dueDate: null, priority: 'none' })
    assert.deepEqual(parseQuickTask('Релиз 1.5.0 завтра', NOW), { text: 'Релиз 1.5.0', dueDate: '2026-11-10', priority: 'none' })
    assert.equal(parseQuickTask('Цена 12.50 руб', NOW).dueDate, null)
    // a date at the end of a sentence still counts
    assert.deepEqual(parseQuickTask('Сдать отчёт 12.11.', NOW), { text: 'Сдать отчёт', dueDate: '2026-11-12', priority: 'none' })
})

test('words that only contain a date word are left alone', () => {
    assert.deepEqual(parseQuickTask('Завтрак с командой', NOW), { text: 'Завтрак с командой', dueDate: null, priority: 'none' })
    assert.equal(parseQuickTask('Пятничный отчёт', NOW).dueDate, null)
})

test('only the date in the text: the task text is not left empty', () => {
    assert.deepEqual(parseQuickTask('завтра', NOW), { text: 'завтра', dueDate: '2026-11-10', priority: 'none' })
})

test('agenda helpers', () => {
    const items = [
        { id: 1, text: 'a', dueDate: '2026-11-09', done: false },
        { id: 2, text: 'b', dueDate: '2026-11-09', done: true },
        { id: 3, text: 'c', dueDate: '2026-11-02', done: false },
        { id: 4, text: 'd', dueDate: null, done: false },
    ]
    const byDate = tasksByDate(items)
    assert.deepEqual(byDate.get('2026-11-09'), { open: 1, done: 1 })
    assert.deepEqual(dayTasks(items, '2026-11-09').map(t => t.id), [1, 2])
    assert.deepEqual(overdueTasks(items, '2026-11-09').map(t => t.id), [3])
    assert.equal(isoDate(NOW), '2026-11-09')
})
