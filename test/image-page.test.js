const test = require('node:test')
const assert = require('node:assert/strict')
const { fitPageInches } = require('../shared/image-page')

// A picture shown in the reader is printed to a PDF page of its own shape: the longer side is as long as an A4 sheet, the page has
// the picture's proportions, so the picture fills it and nothing is cut or squeezed.
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`)

test('a landscape picture gets a landscape page with its proportions', () => {
    const p = fitPageInches(2000, 1000)
    close(p.width, 11.69)
    close(p.height, 5.845)
})

test('a portrait picture gets a portrait page', () => {
    const p = fitPageInches(1000, 3000)
    close(p.height, 11.69)
    close(p.width, 3.897)
})

test('a very thin picture does not become an unreadable sliver', () => {
    const p = fitPageInches(5000, 20)
    close(p.width, 11.69)
    assert.ok(p.height >= 1, String(p.height))
})

test('nonsense sizes fall back to a plain A4 page', () => {
    for (const bad of [[0, 0], [NaN, 10], [-5, 5], [undefined, undefined]]) {
        const p = fitPageInches(bad[0], bad[1])
        close(p.width, 8.27)
        close(p.height, 11.69)
    }
})
