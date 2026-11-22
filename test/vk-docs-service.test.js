const test = require('node:test')
const assert = require('node:assert/strict')
const { handles, open, takesImage } = require('../main/services/vkDocs')

const FILE = 'https://psv4.vkuserphoto.ru/s/v1/d2/abc/photo.jpg'
const LANDING = 'https://vk.ru/s/v1/doc/AbCdEf-123'
const page = (ext = 'jpg', url = FILE) => `<script>Docs.initDoc({"docExt":"${ext}","docTitle":"photo.${ext}","docUrl":${JSON.stringify(url)}});</script>`

function fakeGuest({ pageUrl = 'https://vk.ru/im', html = page(), status = 200, type = 'text/html; charset=windows-1251', fail = false } = {}) {
    const calls = { fetched: [], downloaded: [] }
    const bytes = new TextEncoder().encode(html)
    return {
        calls,
        getURL: () => pageUrl,
        downloadURL: (url) => calls.downloaded.push(url),
        session: {
            fetch: async (url) => {
                calls.fetched.push(url)
                if (fail) throw new Error('offline')
                return { ok: status === 200, status, headers: { get: (name) => (/content-type/i.test(name) ? type : null) }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
            }
        }
    }
}

test('a VK tab opening a VK document is ours; other tabs and other links are not', () => {
    assert.equal(handles(fakeGuest(), LANDING), true)
    assert.equal(handles(fakeGuest(), FILE), true)
    assert.equal(handles(fakeGuest(), 'https://vk.ru/im?sel=1'), false)
    assert.equal(handles(fakeGuest({ pageUrl: 'https://web.telegram.org/k/' }), LANDING), false)
})

test('the document page is read and the real file comes down through the tab (its own session)', async () => {
    const guest = fakeGuest()
    assert.equal(await open(guest, LANDING), true)
    assert.deepEqual(guest.calls.fetched, [LANDING])
    assert.deepEqual(guest.calls.downloaded, [FILE])
})

test('a file address is downloaded at once, without reading a page', async () => {
    const guest = fakeGuest()
    assert.equal(await open(guest, FILE), true)
    assert.deepEqual(guest.calls.fetched, [])
    assert.deepEqual(guest.calls.downloaded, [FILE])
})

test('when the page has no document data nothing is downloaded and the caller is told', async () => {
    const guest = fakeGuest({ html: '<html>login</html>' })
    assert.equal(await open(guest, LANDING), false)
    assert.deepEqual(guest.calls.downloaded, [])
})

test('a failed request, a server error or an oversized page is a plain «not handled», never a throw', async () => {
    assert.equal(await open(fakeGuest({ fail: true }), LANDING), false)
    assert.equal(await open(fakeGuest({ status: 500 }), LANDING), false)
    assert.equal(await open(fakeGuest({ html: 'x'.repeat(3 * 1024 * 1024 + 10) }), LANDING), false)
})

test('a page that points outside VK is not followed', async () => {
    const guest = fakeGuest({ html: page('pdf', 'https://evil.example.com/a.pdf') })
    assert.equal(await open(guest, LANDING), false)
    assert.deepEqual(guest.calls.downloaded, [])
})

test('a picture sent as a file is marked to open in the reader, once, and only that file', async () => {
    const guest = fakeGuest()
    await open(guest, LANDING)
    assert.equal(takesImage('https://psv4.vkuserphoto.ru/s/v1/d2/other/x.jpg'), false)
    assert.equal(takesImage(FILE), true)
    assert.equal(takesImage(FILE), false)
})

test('a PDF or an archive is not marked as a picture', async () => {
    const pdfUrl = 'https://psv4.vkuserphoto.ru/s/v1/d2/abc/a.pdf'
    await open(fakeGuest({ html: page('pdf', pdfUrl) }), LANDING)
    assert.equal(takesImage(pdfUrl), false)
})
