const test = require('node:test')
const assert = require('node:assert/strict')
const { visiblePoint } = require('../shared/visible-point')

// Oleg 2026-11-22: a long message in MAX could be neither edited nor deleted: the right click went to the middle of the bubble,
// which lies outside the window when the bubble is taller than it.
test('a bubble inside the window is clicked in its middle', () => {
    assert.deepEqual(visiblePoint({ left: 100, top: 200, right: 300, bottom: 260 }, 1000, 800), { x: 200, y: 230 })
})

test('a bubble taller than the window is clicked in the middle of the part that can be seen', () => {
    // 3000 px tall, its top 400 px above the window, the window 800 px
    assert.deepEqual(visiblePoint({ left: 100, top: -400, right: 300, bottom: 2600 }, 1000, 800), { x: 200, y: 400 })
    assert.deepEqual(visiblePoint({ left: 100, top: 300, right: 300, bottom: 5000 }, 1000, 800), { x: 200, y: 550 })
})

test('a bubble wider than the window is clicked inside it, and one that cannot be seen at all gives nothing', () => {
    assert.deepEqual(visiblePoint({ left: -200, top: 10, right: 2000, bottom: 50 }, 1000, 800), { x: 500, y: 30 })
    assert.equal(visiblePoint({ left: 100, top: 900, right: 300, bottom: 960 }, 1000, 800), null)
    assert.equal(visiblePoint({ left: 100, top: -90, right: 300, bottom: -10 }, 1000, 800), null)
})
