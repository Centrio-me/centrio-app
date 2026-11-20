const test = require('node:test')
const assert = require('node:assert/strict')
const { sniffImage, extFromMime, pickFileName, uniqueName, obtainFirst, failure, codeForStatus, MAX_BYTES } = require('../shared/image-save')

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(30)])
const HTML = Buffer.from('<!doctype html><html><body>Please sign in</body></html>' + ' '.repeat(40))

test('the kind of a picture is read from its bytes, not from the address (a .jpg that holds a WebP: MAX, Telegram)', () => {
    assert.equal(sniffImage(PNG).ext, 'png')
    assert.equal(sniffImage(JPG).ext, 'jpg')
    assert.equal(sniffImage(WEBP).ext, 'webp')
    assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>   ')).ext, 'svg')
    assert.equal(sniffImage(HTML), null)
    assert.equal(sniffImage(Buffer.alloc(3)), null)
})

test('a file name keeps the real extension and never leaves the folder', () => {
    const now = new Date(2026, 10, 20, 14, 5, 9)
    assert.equal(pickFileName({ url: 'https://i.example.com/p/photo.jpg?x=1', ext: 'webp', now }), 'photo.webp')
    assert.equal(pickFileName({ url: 'https://i.oneme.ru/i?r=abc', ext: 'webp', now }), 'image_2026-11-20_14-05-09.webp')
    assert.equal(pickFileName({ url: 'data:image/png;base64,AAAA', ext: 'png', now }), 'image_2026-11-20_14-05-09.png')
    const evil = pickFileName({ contentDisposition: 'attachment; filename="../../evil:name.png"', url: 'https://x.test/y', ext: 'png', now })
    assert.ok(!/[\\/:]/.test(evil) && evil.endsWith('.png'), evil)
    assert.equal(pickFileName({ contentDisposition: "attachment; filename*=UTF-8''%D0%A1%D0%BD%D0%B8%D0%BC%D0%BE%D0%BA.png", url: 'https://x.test/y', ext: 'png', now }), 'Снимок.png')
    assert.equal(extFromMime('image/webp; charset=x'), 'webp')
})

test('a name that is taken gets a number, the existing file is never overwritten', () => {
    const taken = new Set(['a.png', 'a (1).png'])
    assert.equal(uniqueName('a.png', (n) => taken.has(n)), 'a (2).png')
    assert.equal(uniqueName('b.png', (n) => taken.has(n)), 'b.png')
})

test('the first way that gives a real picture wins, later ways are not tried', async () => {
    let tried = 0
    const r = await obtainFirst([
        async () => { tried++; throw failure('network') },
        async () => { tried++; return { buffer: PNG, via: 'page' } },
        async () => { tried++; return { buffer: JPG, via: 'screen' } }
    ])
    assert.equal(r.ok, true); assert.equal(r.via, 'page'); assert.equal(r.ext, 'png'); assert.equal(tried, 2)
})

test('an HTML page instead of a picture (a sign-in wall) is not a picture: the next way is tried', async () => {
    const r = await obtainFirst([async () => ({ buffer: HTML, via: 'net' }), async () => ({ buffer: JPG, via: 'screen' })])
    assert.equal(r.ok, true); assert.equal(r.via, 'screen')
})

test('when every way fails the message is about the most telling cause', async () => {
    assert.equal((await obtainFirst([async () => { throw failure('network') }, async () => { throw failure('denied') }])).code, 'denied')
    assert.equal((await obtainFirst([async () => ({ buffer: HTML }), async () => { throw failure('gone') }])).code, 'notImage')
    assert.equal((await obtainFirst([async () => { throw new Error('boom') }])).code, 'generic')
    assert.equal((await obtainFirst([async () => ({ buffer: Buffer.concat([PNG, Buffer.alloc(MAX_BYTES)]) })])).code, 'tooBig')
})

test('HTTP statuses map to what the person can understand', () => {
    assert.equal(codeForStatus(403), 'denied'); assert.equal(codeForStatus(401), 'denied')
    assert.equal(codeForStatus(404), 'gone'); assert.equal(codeForStatus(500), 'network')
})

// A channel the window uses but the bridge (preload.js) does not allow answers «blocked_channel» and the feature silently
// does nothing: exactly how this had to be found. Every channel the saving uses must be in the lists.
test('the channels used for saving pictures and the message about downloads are allowed by the bridge', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
    for (const channel of ['pagemenu:save-image', 'pagemenu:probe-image', 'pagemenu:action', 'download-toast']) {
        assert.ok(preload.includes(`'${channel}'`), channel)
    }
})
