const test = require('node:test')
const assert = require('node:assert/strict')
const { serviceCategory, pickTabsToSleep, HIBERNATE_DEFAULTS } = require('../renderer/hibernation-logic')

const MIN = 60 * 1000
const now = 10_000_000_000
const base = (over = {}) => ({
    id: 'a', url: 'https://app.todoist.com', active: false, inSplit: false, detached: false,
    unread: 0, audible: false, orgAssigned: false, muted: false, lastActiveAt: now - 40 * MIN, ...over
})

test('a messenger is recognised by its host, an unknown site counts as a messenger', () => {
    assert.equal(serviceCategory('https://web.telegram.org/k/'), 'messengers')
    assert.equal(serviceCategory('https://app.todoist.com/app/today'), 'productivity')
    assert.equal(serviceCategory('https://my-crm.example.ru'), 'messengers')
    assert.equal(serviceCategory('not a url'), 'messengers')
})

test('by default a work service unused for 30 minutes falls asleep', () => {
    assert.deepEqual(pickTabsToSleep([base()], { ...HIBERNATE_DEFAULTS }, now), ['a'])
})

test('a service used recently stays awake', () => {
    assert.deepEqual(pickTabsToSleep([base({ lastActiveAt: now - 10 * MIN })], HIBERNATE_DEFAULTS, now), [])
})

test('messengers and mail keep receiving messages unless the person chose "all tabs"', () => {
    const tabs = [base({ id: 't', url: 'https://web.telegram.org/k/' }), base({ id: 'g', url: 'https://mail.google.com/mail/u/0/' })]
    assert.deepEqual(pickTabsToSleep(tabs, HIBERNATE_DEFAULTS, now), [])
    assert.deepEqual(pickTabsToSleep(tabs, { ...HIBERNATE_DEFAULTS, scope: 'all' }, now), ['t', 'g'])
})

test('a messenger with notifications turned off may sleep in the quiet scope', () => {
    const tabs = [base({ id: 't', url: 'https://web.telegram.org/k/', muted: true })]
    assert.deepEqual(pickTabsToSleep(tabs, HIBERNATE_DEFAULTS, now), ['t'])
})

test('open, split, detached, unread, playing sound and team tabs are never put to sleep', () => {
    const tabs = [
        base({ id: '1', active: true }), base({ id: '2', inSplit: true }), base({ id: '3', detached: true }),
        base({ id: '4', unread: 2 }), base({ id: '5', audible: true }), base({ id: '6', orgAssigned: true })
    ]
    assert.deepEqual(pickTabsToSleep(tabs, { ...HIBERNATE_DEFAULTS, scope: 'all' }, now), [])
})

test('the per-tab choice wins over the scope, and "off" stops everything', () => {
    const tabs = [base({ id: 'n', hibernate: 'never' }), base({ id: 'y', url: 'https://web.telegram.org/k/', hibernate: 'always' })]
    assert.deepEqual(pickTabsToSleep(tabs, HIBERNATE_DEFAULTS, now), ['y'])
    assert.deepEqual(pickTabsToSleep(tabs, { ...HIBERNATE_DEFAULTS, afterMin: 0 }, now), [])
})

test('a tab never opened in this session counts from the app start', () => {
    assert.deepEqual(pickTabsToSleep([base({ lastActiveAt: undefined })], HIBERNATE_DEFAULTS, now, now - 31 * MIN), ['a'])
    assert.deepEqual(pickTabsToSleep([base({ lastActiveAt: undefined })], HIBERNATE_DEFAULTS, now, now - 5 * MIN), [])
})

test('a short or bare host never borrows a catalog category', () => {
    assert.equal(serviceCategory('https://me/'), 'messengers')
    assert.equal(serviceCategory('https://com/'), 'messengers')
})
