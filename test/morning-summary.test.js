// Morning summary: who wrote while the person was away. A customer (2026-11-11): «телеграм рабочий: --телеграм рабочий.
// петр - привет» — the service's name came back as a sender. The owner (2026-11-12): wider, with more of what people wrote.
const test = require('node:test')
const assert = require('node:assert')
const { buildMorningSummary } = require('../renderer/morning-summary-logic.js')

const SERVICE = { id: 'tg', name: 'Telegram рабочий' }
const at = (min) => new Date(Date.UTC(2026, 10, 12, 6, min)).toISOString()
const build = (notifications, unread = { tg: 2 }) => buildMorningSummary({ messengers: [SERVICE], unread, notifications, since: 0 })

test('the service name in a notice title is not a sender', () => {
    const s = build([{ messengerId: 'tg', title: 'Telegram рабочий: Пётр', body: 'Привет', createdAt: at(1) }])
    assert.deepStrictEqual(s.services[0].senders.map((x) => x.name), ['Пётр'])
})

test('a notice titled by the service alone takes the sender from «Имя: текст»', () => {
    const s = build([{ messengerId: 'tg', title: 'Telegram рабочий', body: 'Пётр: привет, когда созвон?', createdAt: at(1) }])
    assert.deepStrictEqual(s.services[0].senders, [{ name: 'Пётр', count: 1, last: 'привет, когда созвон?' }])
})

test('a notice that only counts messages names nobody, the service stays by its unread count', () => {
    const s = build([{ messengerId: 'tg', title: 'Telegram рабочий', body: '3 новых сообщения', kind: 'count', createdAt: at(1) }])
    assert.strictEqual(s.services.length, 1)
    assert.deepStrictEqual(s.services[0].senders, [])
    assert.strictEqual(s.services[0].unread, 2)
})

test('each sender keeps the count and the latest message, shortened to one line', () => {
    const long = 'Добрый день! '.repeat(30)
    const s = build([
        { messengerId: 'tg', title: 'Telegram рабочий: Анна', body: 'первое', createdAt: at(1) },
        { messengerId: 'tg', title: 'Telegram рабочий: Анна', body: long + '\nвторая строка', createdAt: at(5) },
    ])
    const anna = s.services[0].senders[0]
    assert.strictEqual(anna.count, 2)
    assert.ok(anna.last.startsWith('Добрый день!'))
    assert.ok(anna.last.length <= 141)
    assert.ok(!anna.last.includes('\n'))
})

test('messages for the analysis keep who wrote what, newest last', () => {
    const s = build([
        { messengerId: 'tg', title: 'Telegram рабочий: Анна', body: 'нужен счёт', createdAt: at(1) },
        { messengerId: 'tg', title: 'Telegram рабочий: Пётр', body: 'когда доставка?', createdAt: at(3) },
    ])
    assert.deepStrictEqual(s.messages.map((m) => [m.service, m.sender, m.text]), [['Telegram рабочий', 'Анна', 'нужен счёт'], ['Telegram рабочий', 'Пётр', 'когда доставка?']])
})
