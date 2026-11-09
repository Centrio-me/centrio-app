'use strict'
// A popup one service opens for another service the person already has as a tab (Yandex Mail -> Alice) goes to that
// tab instead of a separate window (3.7.3).
const test = require('node:test')
const assert = require('node:assert/strict')
const { findTabForUrl } = require('../main/services/linkRouting')

const tabs = [
    { id: 'mail', url: 'https://mail.yandex.ru/' },
    { id: 'alice', url: 'https://alice.yandex.ru/' },
    { id: 'tg', url: 'https://web.telegram.org/k/' },
    { id: 'gh', url: 'https://www.github.com/' }
]

test('a link to a host the person has as a tab finds that tab', () => {
    assert.equal(findTabForUrl(tabs, 'https://alice.yandex.ru/chat/123', 'mail')?.id, 'alice')
})

test('the tab that opened the popup is never chosen', () => {
    assert.equal(findTabForUrl(tabs, 'https://mail.yandex.ru/compose', 'mail'), null)
})

test('www is ignored on both sides', () => {
    assert.equal(findTabForUrl(tabs, 'https://github.com/org/repo', 'mail')?.id, 'gh')
})

test('only an exact host matches: another subdomain of the same company does not', () => {
    assert.equal(findTabForUrl(tabs, 'https://disk.yandex.ru/d/abc', 'mail'), null)
})

test('only http(s) links and well-formed tabs are considered', () => {
    assert.equal(findTabForUrl(tabs, 'javascript:alert(1)', 'mail'), null)
    assert.equal(findTabForUrl([{ id: 'x', url: 'not a url' }], 'https://alice.yandex.ru/', 'mail'), null)
    assert.equal(findTabForUrl(null, 'https://alice.yandex.ru/', 'mail'), null)
})

// ── review fixes ──
const opener = { id: 'mail1', url: 'https://mail.yandex.ru/' }
const multi = [opener, { id: 'mail2', url: 'https://mail.yandex.ru/?uid=2' }, { id: 'alice', url: 'https://alice.yandex.ru/' }]

test('a link to the opener\'s own site is never sent to another account\'s tab', () => {
    assert.equal(findTabForUrl(multi, 'https://mail.yandex.ru/compose', 'mail1', opener.url), null)
})

test('two tabs of the target site: nothing is guessed', () => {
    const two = [opener, { id: 'a1', url: 'https://alice.yandex.ru/' }, { id: 'a2', url: 'https://alice.yandex.ru/' }]
    assert.equal(findTabForUrl(two, 'https://alice.yandex.ru/chat', 'mail1', opener.url), null)
})

test('the scheme and port must match the tab: an http link never goes into an https tab', () => {
    assert.equal(findTabForUrl(multi, 'http://alice.yandex.ru/chat', 'mail1', opener.url), null)
    assert.equal(findTabForUrl(multi, 'https://alice.yandex.ru:8443/chat', 'mail1', opener.url), null)
    assert.equal(findTabForUrl(multi, 'https://alice.yandex.ru/chat', 'mail1', opener.url)?.id, 'alice')
})
