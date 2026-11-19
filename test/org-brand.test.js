const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanBrandName, cleanOrgSettings, BRAND_NAME_MAX, THEMES } = require('../shared/org-brand')

test('a name keeps what was typed, with the spaces tidied', () => {
    assert.equal(cleanBrandName('  ООО   Ромашка  '), 'ООО Ромашка')
    assert.equal(cleanBrandName('Центр\tсвязи\nплюс'), 'Центр связи плюс')
})

test('a name too long is cut at the limit, never in the middle of an emoji or a joined letter', () => {
    assert.equal(Array.from(cleanBrandName('А'.repeat(100))).length, BRAND_NAME_MAX)
    const family = '👨‍👩‍👧'
    const cut = cleanBrandName('Х'.repeat(BRAND_NAME_MAX - 1) + family + 'конец')
    assert.ok(!/‍$/.test(cut), 'no half of a joined emoji at the end')
    assert.ok(cut.length > 0)
    assert.equal(cleanBrandName('Ё'.repeat(BRAND_NAME_MAX)), 'Ё'.repeat(BRAND_NAME_MAX))
})

test('a long word with no spaces and abbreviations with dots and quotes pass as they are', () => {
    assert.equal(cleanBrandName('ООО «Ромашка-Плюс»'), 'ООО «Ромашка-Плюс»')
    assert.equal(cleanBrandName('Юр.Фирма «Нерис» г.Омск'), 'Юр.Фирма «Нерис» г.Омск')
    assert.equal(cleanBrandName('Электроустановочные').length, 'Электроустановочные'.length)
})

test('invisible and direction-changing characters, control characters and angle brackets are removed', () => {
    assert.equal(cleanBrandName('Ком‮пания​'), 'Компания')
    assert.equal(cleanBrandName('A\u0000B\u0007C'), 'ABC')
    assert.equal(cleanBrandName('<b>Фирма</b>'), 'bФирма/b')
    assert.equal(cleanBrandName('⁦x⁩'), 'x')
})

test('nothing to show gives an empty name, so the program keeps its own', () => {
    assert.equal(cleanBrandName(''), '')
    assert.equal(cleanBrandName('   \n\t '), '')
    assert.equal(cleanBrandName('​‌'), '')
    assert.equal(cleanBrandName(null), '')
    assert.equal(cleanBrandName(42), '')
    assert.equal(cleanBrandName({ a: 1 }), '')
})

test('settings keep only a known theme and a clean name, and nothing else', () => {
    assert.deepEqual(cleanOrgSettings({ theme: 'aurora', brandName: ' Моя  команда ', evil: 'x' }), { theme: 'aurora', brandName: 'Моя команда' })
    assert.deepEqual(cleanOrgSettings({ theme: 'not-a-theme', brandName: 'Имя' }), { brandName: 'Имя' })
    assert.deepEqual(cleanOrgSettings({ theme: 'light' }), { theme: 'light' })
    assert.equal(cleanOrgSettings({ theme: 'nope', brandName: '   ' }), null)
    assert.equal(cleanOrgSettings(null), null)
    assert.equal(cleanOrgSettings([]), null)
    assert.equal(cleanOrgSettings('x'), null)
})

test('every theme of the program can be chosen', () => {
    for (const t of ['embedded', 'dock', 'light', 'adaptive', 'aurora', 'daytime']) assert.ok(THEMES.includes(t), t)
})
