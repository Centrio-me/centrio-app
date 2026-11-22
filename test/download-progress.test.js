const test = require('node:test')
const assert = require('node:assert/strict')
const { progressView, applyUpdate } = require('../shared/download-progress')

const strings = { one: 'Скачивается «{name}»…', oneWithPercent: 'Скачивается «{name}»: {percent}%', many: 'Скачивается файлов: {count}' }

test('one file of known size shows its name, percent and a fraction for the bar', () => {
    const view = progressView([{ name: 'report.pdf', received: 250, total: 1000 }], strings)
    assert.equal(view.text, 'Скачивается «report.pdf»: 25%')
    assert.equal(view.fraction, 0.25)
})

test('one file of unknown size shows the name without a percent and no fraction', () => {
    const view = progressView([{ name: 'a.docx', received: 4096, total: 0 }], strings)
    assert.equal(view.text, 'Скачивается «a.docx»…')
    assert.equal(view.fraction, null)
})

test('several files show a count, not a single name', () => {
    const view = progressView([{ name: 'a', received: 1, total: 10 }, { name: 'b', received: 2, total: 10 }], strings)
    assert.equal(view.text, 'Скачивается файлов: 2')
    assert.equal(view.fraction, null)
})

test('percent never goes past 100 or below 0', () => {
    assert.equal(progressView([{ name: 'x', received: 5000, total: 1000 }], strings).fraction, 1)
    assert.equal(progressView([{ name: 'x', received: -5, total: 1000 }], strings).fraction, 0)
})

test('nothing active gives no view', () => {
    assert.equal(progressView([], strings), null)
})

test('applyUpdate adds a started download, updates it, and drops it when finished', () => {
    let active = new Map()
    active = applyUpdate(active, { id: '1', state: 'started', name: 'a.pdf', received: 0, total: 100 })
    assert.equal(active.size, 1)
    active = applyUpdate(active, { id: '1', state: 'progress', name: 'a.pdf', received: 50, total: 100 })
    assert.equal(active.get('1').received, 50)
    active = applyUpdate(active, { id: '1', state: 'completed', name: 'a.pdf' })
    assert.equal(active.size, 0)
})

test('applyUpdate does not mutate the map it was given', () => {
    const before = new Map()
    const after = applyUpdate(before, { id: '1', state: 'started', name: 'a', received: 0, total: 0 })
    assert.equal(before.size, 0)
    assert.equal(after.size, 1)
})

test('a progress tick for a download that was never started is ignored', () => {
    const after = applyUpdate(new Map(), { id: 'zzz', state: 'progress', name: 'a', received: 1, total: 2 })
    assert.equal(after.size, 0)
})
