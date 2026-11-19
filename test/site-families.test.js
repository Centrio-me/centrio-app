const test = require('node:test')
const assert = require('node:assert/strict')
const { isSignInHost, sameSiteFamily, leavesTheSite } = require('../shared/site-families')

test('the sign-in pages of identity providers are recognised by their exact host', () => {
    for (const h of ['id.vk.ru', 'id.vk.com', 'login.vk.com', 'oauth.vk.com', 'passport.yandex.ru', 'accounts.google.com', 'APPLEID.apple.com']) assert.equal(isSignInHost(h), true, h)
    for (const h of ['vk.com', 'mail.ru', 'id.vk.com.evil.example', 'xid.vk.com', '', null, undefined]) assert.equal(isSignInHost(h), false, String(h))
})

test('a site and its other own domain are one site', () => {
    assert.equal(sameSiteFamily('tilda.ru', 'tilda.cc'), true)
    assert.equal(sameSiteFamily('tilda.cc', 'tilda.ru'), true)
    assert.equal(sameSiteFamily('mail.ru', 'mail.ru'), true)
    assert.equal(sameSiteFamily('tilda.ru', 'evil.ru'), false)
})

// what the tab does when the page goes to another address: stays, or the address goes to the system browser
test('Mail.ru signs in through VK ID inside the tab, not in the browser (Lucil, 2026-11-19)', () => {
    const tab = 'https://e.mail.ru/inbox'
    for (const url of ['https://login.vk.com/?act=autologin', 'https://account.mail.ru/login', 'https://auth.mail.ru/api/v1/vkid_auth/start', 'https://id.vk.ru/auth?app_id=7539952'])
        assert.equal(leavesTheSite(url, tab), false, url)
})

test('Tilda signs in on its other domain inside the tab', () => {
    assert.equal(leavesTheSite('https://tilda.cc/login/', 'https://tilda.ru/projects/leads/?projectid=1'), false)
})

test('a link to another site, and one that only looks like a provider, still leaves the tab', () => {
    assert.equal(leavesTheSite('https://example.com/', 'https://e.mail.ru/inbox'), true)
    assert.equal(leavesTheSite('https://vk.com/some_profile', 'https://e.mail.ru/inbox'), true)
    assert.equal(leavesTheSite('https://id.vk.com.evil.example/auth', 'https://e.mail.ru/inbox'), true)
})

test('another subdomain of the same site, a local file and a broken address stay in the tab', () => {
    assert.equal(leavesTheSite('https://disk.yandex.ru/client', 'https://mail.yandex.ru/'), false)
    assert.equal(leavesTheSite('file:///C:/x.html', 'https://e.mail.ru/'), false)
    assert.equal(leavesTheSite('not a url', 'https://e.mail.ru/'), false)
})

// the sign-in window of VK ID that another site (Mail.ru) opens is a window of the app in its own style, with the way back to the tab
const { isVkIdPopupFor } = require('../shared/site-families')

test('a sign-in popup of VK ID opened by another site is the app\'s sign-in window (owner, 2026-11-19: Mail.ru «Войти»)', () => {
    assert.equal(isVkIdPopupFor('https://id.vk.ru/auth?app_id=7539952', 'https://account.mail.ru/login'), true)
    assert.equal(isVkIdPopupFor('https://id.vk.com/auth', 'https://e.mail.ru/inbox'), true)
})

test('VK\'s own tab and any other address are not touched by that rule', () => {
    assert.equal(isVkIdPopupFor('https://id.vk.ru/auth', 'https://vk.ru/im'), false)
    assert.equal(isVkIdPopupFor('https://id.vk.com/auth', 'https://vk.com/feed'), false)
    assert.equal(isVkIdPopupFor('https://example.com/', 'https://account.mail.ru/login'), false)
    assert.equal(isVkIdPopupFor('https://id.vk.com.evil.example/', 'https://account.mail.ru/'), false)
    assert.equal(isVkIdPopupFor('not a url', 'https://account.mail.ru/'), false)
})
