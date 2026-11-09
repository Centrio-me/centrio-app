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
