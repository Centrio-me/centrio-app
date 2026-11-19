const test = require('node:test')
const assert = require('node:assert/strict')
const policy = require('../main/services/orgNavigationPolicy')

const MAIL = 'org:mail'
const TILDA = 'org:tilda'
const SITE = 'org:site'
function strict() {
    policy.setState({
        strict: true,
        assigned: { [MAIL]: 'https://e.mail.ru/inbox', [TILDA]: 'https://tilda.ru/projects/leads/?projectid=1', [SITE]: 'https://crm.example.ru/app' }
    })
}
const go = (id, url) => policy.decideNavigation({ messengerId: id, targetUrl: url })

test('the sign-in of Mail.ru, which goes through VK ID, stays in the tab (Lucil, 2026-11-19: «в браузер кидает на вход»)', () => {
    strict()
    for (const url of [
        'https://login.vk.com/?act=autologin&app_id=7539952&redirect_uri=https%3A%2F%2Faccount.mail.ru%2Flogin',
        'https://account.mail.ru/login?page=https%3A%2F%2Fe.mail.ru%2Finbox',
        'https://auth.mail.ru/api/v1/vkid_auth/start?flow=login',
        'https://id.vk.ru/auth?app_id=7539952&response_type=silent_token',
        'https://id.vk.com/auth?app_id=7539952',
        'https://oauth.vk.com/authorize?client_id=1'
    ]) assert.equal(go(MAIL, url), 'allow', url)
})

test('the sign-in of Tilda, on its own second domain, stays in the tab', () => {
    strict()
    assert.equal(go(TILDA, 'https://tilda.cc/login/'), 'allow')
    assert.equal(go(TILDA, 'https://tilda.ru/projects/'), 'allow')
})

test('a sign-in through Google, Yandex or VK ID works from any team tab', () => {
    strict()
    for (const url of ['https://accounts.google.com/o/oauth2/auth?client_id=x', 'https://passport.yandex.ru/auth', 'https://oauth.yandex.ru/authorize', 'https://id.vk.com/auth']) {
        assert.equal(go(SITE, url), 'allow', url)
    }
})

test('everything else still opens in the system browser, and lookalike hosts are no providers', () => {
    strict()
    assert.equal(go(MAIL, 'https://example.com/'), 'external')
    assert.equal(go(SITE, 'https://vk.com/some_profile'), 'external')
    assert.equal(go(SITE, 'https://id.vk.com.evil.example/auth'), 'external')
    assert.equal(go(SITE, 'https://evilaccounts.google.com.example.org/'), 'external')
    assert.equal(go(TILDA, 'https://tilda.cc.evil.example/login'), 'external')
    assert.equal(go(SITE, 'javascript:alert(1)'), 'block')
})

test('outside strict mode, and for tabs that are not the team\'s, nothing is held back', () => {
    policy.setState({ strict: false, assigned: { [MAIL]: 'https://e.mail.ru/inbox' } })
    assert.equal(go(MAIL, 'https://example.com/'), 'allow')
    strict()
    assert.equal(go('own-tab', 'https://example.com/'), 'allow')
})
