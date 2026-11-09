'use strict'
// A new tab of a Russian service goes without the VPN by default (3.7.3): Yandex, VK, Mail.ru and others answer a
// foreign VPN address with "requests from your device look automatic" captchas (Yandex Wiki, user report).
const test = require('node:test')
const assert = require('node:assert/strict')
const { isRussianService, defaultVpnFor } = require('../shared/vpn-default')

test('Yandex, VK, Mail.ru, MAX and .ru/.рф/.su sites are Russian services', () => {
    for (const url of ['https://wiki.yandex.ru/homepage/', 'https://alice.yandex.ru/', 'https://ya.ru', 'https://vk.com/im',
        'https://web.max.ru', 'https://e.mail.ru/inbox', 'https://ok.ru', 'https://www.bitrix24.ru', 'https://xn--80ak6aa92e.xn--p1ai/',
        'https://site.su/', 'https://yandex.com/maps', 'https://tracker.yandex.com']) {
        assert.equal(isRussianService(url), true, url)
    }
})

test('foreign services are not', () => {
    for (const url of ['https://web.telegram.org/k/', 'https://web.whatsapp.com', 'https://chatgpt.com', 'https://www.youtube.com',
        'https://discord.com/app', 'https://myru.com', 'https://notyandex.com']) {
        assert.equal(isRussianService(url), false, url)
    }
})

test('the default VPN choice follows it, and junk keeps the old default (with VPN)', () => {
    assert.equal(defaultVpnFor('https://wiki.yandex.ru/'), false)
    assert.equal(defaultVpnFor('https://web.telegram.org/k/'), true)
    assert.equal(defaultVpnFor('not a url'), true)
    assert.equal(defaultVpnFor(undefined), true)
})
