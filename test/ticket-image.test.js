const test = require('node:test')
const assert = require('node:assert/strict')
const { fitSize, needsConversion } = require('../renderer/ticket-image')

test('a picture smaller than the limit keeps its size', () => {
    assert.deepEqual(fitSize(1920, 1080, 2560), { width: 1920, height: 1080 })
})

test('a 4K screenshot is made smaller by the longest side, the proportions stay', () => {
    const s = fitSize(3840, 2160, 2560)
    assert.equal(s.width, 2560)
    assert.equal(s.height, 1440)
})

test('a tall picture is limited by its height', () => {
    const s = fitSize(1080, 5000, 2500)
    assert.equal(s.height, 2500)
    assert.equal(s.width, 540)
})

test('nonsense sizes give at least one pixel', () => {
    const s = fitSize(0, 0, 100)
    assert.ok(s.width >= 1 && s.height >= 1)
})

test('a big file or a type the server does not take needs work, a good small one does not', () => {
    const MB = 1024 * 1024
    assert.equal(needsConversion({ type: 'image/png', size: 2 * MB }, 5 * MB), false)
    assert.equal(needsConversion({ type: 'image/png', size: 7 * MB }, 5 * MB), true)
    assert.equal(needsConversion({ type: 'image/bmp', size: 1 * MB }, 5 * MB), true)
})
