const test = require('node:test')
const assert = require('node:assert/strict')
const { classify, stripEmoji, parseHighlights, formatDate, versionTag, buildEntry } = require('../renderer/changelog-parse')

test('a line that starts with «Новое» is new, and the label is taken off', () => {
    assert.deepEqual(classify('Новое: у групп Telegram с темами появились вкладки'), { kind: 'new', text: 'У групп Telegram с темами появились вкладки' })
    assert.deepEqual(classify('Новое в заметках: жирный и курсив'), { kind: 'new', text: 'В заметках: жирный и курсив' })
    assert.deepEqual(classify('Новое во «Всех мессенджерах»: ссылки открываются в окне'), { kind: 'new', text: 'Во «Всех мессенджерах»: ссылки открываются в окне' })
})

test('«Исправлено» is a fix, «Улучшено» and «Изменено» are changes', () => {
    assert.equal(classify('Исправлено: поиск без результатов пишет «Ничего не найдено»').kind, 'fix')
    assert.equal(classify('Улучшено: проверка работает быстрее').kind, 'change')
    assert.equal(classify('Изменено: окна оформлены так же').kind, 'change')
})

test('a line with no label stays as it is, in the group of changes', () => {
    assert.deepEqual(classify('Добавлена диагностика отказа в журнал'), { kind: 'new', text: 'Диагностика отказа в журнал' })
    assert.deepEqual(classify('Просто строка без пометки'), { kind: 'change', text: 'Просто строка без пометки' })
})

test('coloured emoji never reach the window, arrows and letters stay', () => {
    assert.equal(stripEmoji('Готово ✅ и 🎉 вот так'), 'Готово и вот так')
    assert.equal(stripEmoji('Настройки → Внешний вид'), 'Настройки → Внешний вид')
    assert.equal(stripEmoji('☑ список'), 'список')
    assert.equal(classify('Новое: 🎄 акции в окне').text, 'Акции в окне')
})

test('the highlights are optional and read as icon, title, text', () => {
    assert.deepEqual(parseHighlights(''), [])
    assert.deepEqual(parseHighlights(undefined), [])
    const hl = parseHighlights('megaphone|Окна от Centrio|Акции и новости; messages|Темы в Telegram|Вкладки тем')
    assert.equal(hl.length, 2)
    assert.deepEqual(hl[0], { icon: 'megaphone', title: 'Окна от Centrio', text: 'Акции и новости' })
    assert.equal(parseHighlights('a|b|c;d|e|f;g|h|i;j|k|l').length, 3)
    assert.deepEqual(parseHighlights('только заголовок'), [])
})

test('the date is written the way it is said', () => {
    assert.equal(formatDate('2026-11-17'), '17 ноября 2026')
    assert.equal(formatDate('2026-02-03', { short: true }), '3 фев')
    assert.equal(formatDate(''), '')
    assert.equal(formatDate('not a date'), '')
})

test('a beta is told from a version by the number of the app', () => {
    assert.equal(versionTag('3.8.7', '3.8.7-beta.4'), 'Бета 4')
    assert.equal(versionTag('3.8.6', '3.8.7-beta.4'), '')
    assert.equal(versionTag('3.8.7', '3.8.7'), '')
    assert.equal(versionTag('3.8.7', ''), '')
})

test('an entry is counted by what it holds, and the lines are in groups', () => {
    const e = buildEntry({ version: 'v3.8.7', date: '2026-11-17', hl: '', items: ['Новое: а', 'Новое: б', 'Исправлено: в', 'Улучшено: г'] })
    assert.equal(e.version, '3.8.7')
    assert.deepEqual(e.counts, { new: 2, fix: 1, change: 1, all: 4 })
    assert.deepEqual(e.groups.map((g) => g.kind), ['new', 'fix', 'change'])
    assert.equal(e.groups[0].items.length, 2)
    assert.deepEqual(e.highlights, [])
})

test('an entry with no lines is kept with empty groups, not dropped', () => {
    const e = buildEntry({ version: 'v1.0.0', items: [] })
    assert.equal(e.counts.all, 0)
    assert.deepEqual(e.groups, [])
})
