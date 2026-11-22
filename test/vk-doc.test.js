const test = require('node:test')
const assert = require('node:assert/strict')
const { isVkPage, isVkDocLanding, isVkDocFile, parseDocPage, kindOfExt } = require('../shared/vk-doc')

// What VK really sends (read from vk.ru on 2026-11-22): a click on a document opens vk.ru/s/v1/doc/<token>, a page with a «Скачать файл»
// button whose script holds the real file address in Docs.initDoc({...}); the button then goes to psv4.vkuserphoto.ru/s/v1/d2/…
const PAGE_HTML = `<html><script>var a = 1;</script><body>
<script>Docs.initDoc({"docOwnerId":9341784,"docId":696727485,"docExt":"pdf","docTitle":"CURVES.pdf","docSize":617663,"docUrl":"https:\\/\\/psv4.vkuserphoto.ru\\/s\\/v1\\/d2\\/r3y_9HlvhF\\/CURVES.pdf","docBuyLink":"\\/doclinks.php?link=&hash=c2","userAgent":"Mozilla\\/5.0 {x}"});</script></body></html>`

test('only VK pages count as a place where documents come from', () => {
    assert.equal(isVkPage('https://vk.ru/im'), true)
    assert.equal(isVkPage('https://vk.com/im?sel=1'), true)
    assert.equal(isVkPage('https://m.vk.com/'), true)
    assert.equal(isVkPage('https://vk.com.evil.ru/im'), false)
    assert.equal(isVkPage('https://evilvk.ru/'), false)
    assert.equal(isVkPage('http://vk.ru/im'), false)
    assert.equal(isVkPage('nonsense'), false)
})

test('a VK document page is recognised, in both of its address shapes', () => {
    assert.equal(isVkDocLanding('https://vk.ru/s/v1/doc/7Rx7YuFhKMJJI-_ae7wWAo7GmXVejZ0fYDuyyhL8k980Lwo3x70'), true)
    assert.equal(isVkDocLanding('https://vk.com/doc9341784_696727485?hash=abc&dl=xyz'), true)
    assert.equal(isVkDocLanding('https://vk.com/doc-123_456'), true)
    assert.equal(isVkDocLanding('https://vk.com/docs'), false)
    assert.equal(isVkDocLanding('https://vk.com/im'), false)
    assert.equal(isVkDocLanding('https://example.com/s/v1/doc/abc'), false)
    assert.equal(isVkDocLanding('http://vk.ru/s/v1/doc/abc'), false)
})

test('the file server of VK documents is recognised, photo servers are not', () => {
    assert.equal(isVkDocFile('https://psv4.vkuserphoto.ru/s/v1/d2/r3y_9H/CURVES.pdf'), true)
    assert.equal(isVkDocFile('https://psv4.userapi.com/s/v1/d/abc/file.docx'), true)
    assert.equal(isVkDocFile('https://sun9-1.userapi.com/impg/abc.jpg'), false)
    assert.equal(isVkDocFile('https://psv4.vkuserphoto.ru/other/path'), false)
    assert.equal(isVkDocFile('https://psv4.evil.ru/s/v1/d2/abc'), false)
})

test('the file address, name and type are read from the document page', () => {
    assert.deepEqual(parseDocPage(PAGE_HTML), { url: 'https://psv4.vkuserphoto.ru/s/v1/d2/r3y_9HlvhF/CURVES.pdf', title: 'CURVES.pdf', ext: 'pdf' })
})

test('a page without the document data, or with a damaged one, gives nothing', () => {
    assert.equal(parseDocPage('<html>nothing here</html>'), null)
    assert.equal(parseDocPage('Docs.initDoc({"docUrl": '), null)
    assert.equal(parseDocPage(''), null)
    assert.equal(parseDocPage(undefined), null)
})

test('a file address outside VK is never followed', () => {
    const evil = PAGE_HTML.replace('psv4.vkuserphoto.ru', 'evil.example.com')
    assert.equal(parseDocPage(evil), null)
    assert.equal(parseDocPage(PAGE_HTML.replace('https:\\/\\/psv4', 'http:\\/\\/psv4')), null)
})

test('the type decides how a document is shown', () => {
    assert.equal(kindOfExt('pdf'), 'pdf')
    assert.equal(kindOfExt('DOCX'), 'word')
    for (const ext of ['jpg', 'JPEG', 'png', 'webp', 'gif', 'bmp']) assert.equal(kindOfExt(ext), 'image', ext)
    for (const ext of ['zip', 'cdr', 'xlsx', 'doc', '']) assert.equal(kindOfExt(ext), 'other', ext)
})
