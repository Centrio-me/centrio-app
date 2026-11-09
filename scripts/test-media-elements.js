'use strict'
// The mini-player must see <video>/<audio> that a site keeps inside a shadow root (VK Video does): it used to look
// only at document.querySelectorAll('video, audio') and said "nothing is playing" while a VK video played.
const test = require('node:test')
const assert = require('node:assert/strict')
const { findMediaElements, pickResumeTarget, FIND_MEDIA_SOURCE } = require('../shared/media-elements')

// a tiny fake DOM: nodes with tagName, children and an optional open shadowRoot
function el(tag, extra = {}, children = []) { return { tagName: tag.toUpperCase(), children, ...extra } }
function root(children) {
    const all = []
    const walk = (n) => { all.push(n); (n.children || []).forEach(walk) }
    children.forEach(walk)
    return {
        children,
        querySelectorAll(sel) {
            if (sel === '*') return all
            return all.filter(n => n.tagName === 'VIDEO' || n.tagName === 'AUDIO')
        }
    }
}

test('finds plain media elements', () => {
    const v = el('video', { paused: false })
    const doc = root([el('div', {}, [v])])
    assert.deepEqual(findMediaElements(doc), [v])
})

test('finds a video inside a shadow root (VK Video)', () => {
    const inner = el('video', { paused: false })
    const host = el('vk-video-player', { shadowRoot: root([el('div', {}, [inner])]) })
    const doc = root([el('main', {}, [host])])
    assert.deepEqual(findMediaElements(doc), [inner])
})

test('finds media in nested shadow roots too', () => {
    const deep = el('audio', { paused: true })
    const host2 = el('x-inner', { shadowRoot: root([deep]) })
    const host1 = el('x-outer', { shadowRoot: root([host2]) })
    assert.deepEqual(findMediaElements(root([host1])), [deep])
})

test('resume picks the paused video that was already watched, not an untouched ad slot', () => {
    const adSlot = el('video', { paused: true, currentTime: 0, readyState: 0 })
    const main = el('video', { paused: true, currentTime: 42, readyState: 4 })
    assert.equal(pickResumeTarget([adSlot, main]), main)
    assert.equal(pickResumeTarget([adSlot]), adSlot)
    assert.equal(pickResumeTarget([]), null)
})

test('the injected source still defines __centrioFindMedia after the release minifier renames functions', () => {
    // release builds minify the renderer bundle: a function's own name does not survive, so the source must bind
    // the page-side name itself
    const esbuild = require('esbuild')
    const out = esbuild.buildSync({
        stdin: { contents: "const m = require('./shared/media-elements'); module.exports = m.FIND_MEDIA_SOURCE", resolveDir: require('node:path').resolve(__dirname, '..') },
        bundle: true, minify: true, write: false, format: 'cjs', platform: 'node'
    })
    const mod = { exports: {} }
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
    const source = mod.exports
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${source}; return __centrioFindMedia`)()
    const inner = el('video', { paused: false })
    assert.deepEqual(fn(root([el('x', { shadowRoot: root([inner]) })])), [inner])
})

test('the injectable source defines the same function for page scripts', () => {
    assert.match(FIND_MEDIA_SOURCE, /var __centrioFindMedia = /)
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${FIND_MEDIA_SOURCE}; return __centrioFindMedia`)()
    const inner = el('video', { paused: false })
    assert.deepEqual(fn(root([el('x', { shadowRoot: root([inner]) })])), [inner])
})

// ── 3.7.3: volume per source in the mini-player ──
const { setMediaVolume, readMediaLevel, clampVolume, SET_VOLUME_SOURCE, READ_LEVEL_SOURCE } = require('../shared/media-elements')

test('volume is set on every media element of the page, shadow roots included', () => {
    const a = el('video', { volume: 1, muted: true })
    const b = el('audio', { volume: 1, muted: false })
    const doc = root([el('x', { shadowRoot: root([a, b]) })])
    assert.equal(setMediaVolume(doc, 0.35), 2)
    assert.equal(a.volume, 0.35)
    assert.equal(b.volume, 0.35)
    // moving the slider up from zero also brings the sound back
    assert.equal(a.muted, false)
})

test('volume is clamped to 0..1 and junk becomes no change', () => {
    assert.equal(clampVolume(1.7), 1)
    assert.equal(clampVolume(-3), 0)
    assert.equal(clampVolume('0.5'), 0.5)
    assert.equal(clampVolume('abc'), null)
    const v = el('video', { volume: 0.8, muted: false })
    assert.equal(setMediaVolume(root([v]), 'abc'), 0)
    assert.equal(v.volume, 0.8)
})

test('the level shown is the playing element, else the first one; none means the page has no element', () => {
    const quiet = el('video', { paused: true, volume: 0.2, muted: false })
    const loud = el('video', { paused: false, volume: 0.9, muted: true })
    assert.deepEqual(readMediaLevel(root([quiet, loud])), { hasElement: true, volume: 0.9, muted: true })
    assert.deepEqual(readMediaLevel(root([quiet])), { hasElement: true, volume: 0.2, muted: false })
    assert.deepEqual(readMediaLevel(root([])), { hasElement: false, volume: 1, muted: false })
})

test('the injectable volume sources work without the module (as in a page)', () => {
    // eslint-disable-next-line no-new-func
    const api = new Function(`${FIND_MEDIA_SOURCE}; ${SET_VOLUME_SOURCE}; ${READ_LEVEL_SOURCE}; return { set: __centrioSetVolume, read: __centrioReadLevel }`)()
    const v = el('video', { paused: false, volume: 1, muted: false })
    assert.equal(api.set(root([v]), 0.4), 1)
    assert.deepEqual(api.read(root([v])), { hasElement: true, volume: 0.4, muted: false })
})

test('volume sources survive the release minifier', () => {
    const esbuild = require('esbuild')
    const out = esbuild.buildSync({
        stdin: { contents: "const m = require('./shared/media-elements'); module.exports = m.FIND_MEDIA_SOURCE + m.SET_VOLUME_SOURCE + m.READ_LEVEL_SOURCE", resolveDir: require('node:path').resolve(__dirname, '..') },
        bundle: true, minify: true, write: false, format: 'cjs', platform: 'node'
    })
    const mod = { exports: {} }
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
    // eslint-disable-next-line no-new-func
    const api = new Function(`${mod.exports}; return { set: __centrioSetVolume, read: __centrioReadLevel }`)()
    const v = el('video', { paused: false, volume: 1, muted: true })
    assert.equal(api.set(root([el('x', { shadowRoot: root([v]) })]), 0.3), 1)
    assert.deepEqual(api.read(root([v])), { hasElement: true, volume: 0.3, muted: false })
})
