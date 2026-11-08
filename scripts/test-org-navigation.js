// Run with: node --test scripts/test-org-navigation.js
const test = require('node:test')
const assert = require('node:assert/strict')
const policy = require('../main/services/orgNavigationPolicy')

const WA = 'https://web.whatsapp.com/'
const MAIL = 'https://mail.yandex.ru/'

test('a personal messenger is never restricted', () => {
    policy.setState({ strict: true, assigned: { 'org:a1': WA } })
    assert.equal(policy.decideNavigation({ messengerId: 'm1', targetUrl: 'https://example.com/' }), 'allow')
})

test('without strict mode team tabs go anywhere, as before', () => {
    policy.setState({ strict: false, assigned: { 'org:a1': WA } })
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'https://example.com/' }), 'allow')
})

test('a link to another site from WhatsApp opens in the browser in strict mode', () => {
    policy.setState({ strict: true, assigned: { 'org:a1': WA } })
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'https://wa.me/79990000000' }), 'external')
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'https://example.com/' }), 'external')
})

test('the messenger own site stays inside the tab', () => {
    policy.setState({ strict: true, assigned: { 'org:a1': WA } })
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'https://web.whatsapp.com/some/path' }), 'allow')
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'https://static.whatsapp.com/x' }), 'allow')
})

test('a sign-in provider of the site is allowed', () => {
    policy.setState({ strict: true, assigned: { 'org:m': MAIL } })
    assert.equal(policy.decideNavigation({ messengerId: 'org:m', targetUrl: 'https://passport.yandex.ru/auth' }), 'allow')
})

test('non-web schemes and blank pages are never opened outside', () => {
    policy.setState({ strict: true, assigned: { 'org:a1': WA } })
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'about:blank' }), 'allow')
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'javascript:void(0)' }), 'block')
    assert.equal(policy.decideNavigation({ messengerId: 'org:a1', targetUrl: 'file:///C:/x' }), 'block')
})

test('a team tab whose address is unknown yet is left alone', () => {
    policy.setState({ strict: true, assigned: {} })
    assert.equal(policy.decideNavigation({ messengerId: 'org:zz', targetUrl: 'https://example.com/' }), 'allow')
})
