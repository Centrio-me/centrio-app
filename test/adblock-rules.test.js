'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseLists, isHostListed, selectorsFor, toCss } = require('../shared/adblock-rules')

const LIST = [
    '[Adblock Plus 2.0]',
    '! Title: test',
    '||ads.example.com^',
    '||tracker.net^$third-party',
    '||cdn.good.org^$domain=a.com',
    '||path.example.com/ads/banner.js',
    '||regex.com^*/ad.gif',
    '@@||ads.example.com^',
    '||Banners.Site.RU^',
    '##.ad-banner',
    '###top-ad',
    'news.example.com##.promo',
    'a.com,b.org##div[data-ad="1"]',
    '~c.com##.skipped',
    'x.com##div:has-text(Sponsored)',
    'y.com#@#.ad',
    '##.a{color:red}'
].join('\n')

test('takes whole-domain network rules and their options, and drops the rest', () => {
    const { domains } = parseLists([LIST])
    assert.equal(domains.has('tracker.net'), true)
    assert.equal(domains.has('banners.site.ru'), true)
    assert.equal(domains.has('cdn.good.org'), false, 'a rule limited by $domain is not applied')
    assert.equal(domains.has('path.example.com'), false, 'a path rule is not a domain rule')
    assert.equal(domains.has('regex.com'), false)
})

test('an exception removes the domain', () => {
    assert.equal(parseLists([LIST]).domains.has('ads.example.com'), false)
})

test('matches a host and every host below a listed domain', () => {
    const { domains } = parseLists([LIST])
    assert.equal(isHostListed(domains, 'tracker.net'), true)
    assert.equal(isHostListed(domains, 'cdn.tracker.net'), true)
    assert.equal(isHostListed(domains, 'nottracker.net'), false)
    assert.equal(isHostListed(domains, 'example.com'), false)
})

test('reads general and per-domain cosmetic rules, and leaves extended and exception ones out', () => {
    const rules = parseLists([LIST])
    assert.deepEqual(rules.generic.sort(), ['#top-ad', '.ad-banner'])
    assert.deepEqual(rules.byHost.get('news.example.com'), ['.promo'])
    assert.deepEqual(rules.byHost.get('a.com'), ['div[data-ad="1"]'])
    assert.equal(rules.byHost.has('c.com'), false)
    assert.equal(rules.byHost.has('x.com'), false)
    assert.equal(rules.byHost.has('y.com'), false)
    assert.equal(rules.generic.some((s) => s.includes('{')), false)
})

test('selectors for a host include the general ones and those of the domains above it', () => {
    const rules = parseLists([LIST])
    assert.deepEqual(selectorsFor(rules, 'sub.news.example.com').sort(), ['#top-ad', '.ad-banner', '.promo'])
    assert.deepEqual(selectorsFor(rules, 'sub.news.example.com', { skipGeneric: true }), ['.promo'])
    assert.deepEqual(selectorsFor(rules, 'other.org').sort(), ['#top-ad', '.ad-banner'])
})

test('each selector gets a rule of its own', () => {
    assert.equal(toCss(['.a', '#b']), '.a{display:none!important}\n#b{display:none!important}')
})
