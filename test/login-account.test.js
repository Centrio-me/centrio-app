const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeLogin, forgotPasswordAction, shouldOfferEmailAttach, profileAddressLine } = require('../shared/login-account')

test('a sign-in field without @ is a login, with @ an email', () => {
    assert.equal(looksLikeLogin('ivan.ivanov'), true)
    assert.equal(looksLikeLogin('  ivan  '), true)
    assert.equal(looksLikeLogin('ivan@mail.ru'), false)
    assert.equal(looksLikeLogin(''), false)
    assert.equal(looksLikeLogin(null), false)
})

test('«Забыли пароль» opens the site for an email and tells to ask the manager for a login', () => {
    assert.equal(forgotPasswordAction('ivan@mail.ru'), 'site')
    assert.equal(forgotPasswordAction(''), 'site')
    assert.equal(forgotPasswordAction('ivan.ivanov'), 'ask-manager')
})

test('the «attach an email» card is offered only to an account that has just a login', () => {
    assert.equal(shouldOfferEmailAttach({ loginOnly: true, login: 'ivan' }), true)
    assert.equal(shouldOfferEmailAttach({ loginOnly: false, login: 'ivan' }), false)
    assert.equal(shouldOfferEmailAttach({ email: 'a@b.ru' }), false)
    assert.equal(shouldOfferEmailAttach(null), false)
})

test('the profile address line: Telegram stand-in, login-only account, ordinary email', () => {
    const t = (login) => `Логин: ${login}`
    assert.equal(profileAddressLine({ email: 'tg_12345@centrio.me' }, t), 'Telegram')
    assert.equal(profileAddressLine({ loginOnly: true, login: 'ivan', email: 'ivan' }, t), 'Логин: ivan')
    assert.equal(profileAddressLine({ email: 'a@b.ru' }, t), 'a@b.ru')
    assert.equal(profileAddressLine(null, t), '')
})
