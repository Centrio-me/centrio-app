const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCampaign, audienceMatches, isActiveNow, publicView, tally } = require('../src/lib/announcements-logic')

const good = { title: 'Скидка к Новому году', body: 'Минус 30% на год ПРО', button: { label: 'Получить', action: 'link', url: 'https://centrio.me/pricing' }, theme: 'newyear', logoStyle: 'santa', audience: { type: 'all' } }

test('a good campaign is cleaned and given the defaults', () => {
    const r = normalizeCampaign(good)
    assert.equal(r.ok, true)
    assert.equal(r.value.title, 'Скидка к Новому году')
    assert.equal(r.value.theme, 'newyear')
    assert.equal(r.value.logoStyle, 'santa')
    assert.equal(r.value.enabled, true)
    assert.equal(r.value.imageUrl, '')
})

test('a title is required and kept short', () => {
    assert.equal(normalizeCampaign({ ...good, title: '  ' }).ok, false)
    assert.equal(normalizeCampaign({ ...good, title: 'я'.repeat(121) }).ok, false)
})

test('the text is limited', () => {
    assert.equal(normalizeCampaign({ ...good, body: 'я'.repeat(1501) }).ok, false)
})

test('a link must be https; other schemes are refused', () => {
    assert.equal(normalizeCampaign({ ...good, button: { label: 'Go', action: 'link', url: 'javascript:alert(1)' } }).ok, false)
    assert.equal(normalizeCampaign({ ...good, button: { label: 'Go', action: 'link', url: 'http://example.com' } }).ok, false)
    assert.equal(normalizeCampaign({ ...good, button: { label: 'Go', action: 'link', url: 'file:///c:/x' } }).ok, false)
})

test('a button needs its label, and a link button needs its address', () => {
    assert.equal(normalizeCampaign({ ...good, button: { label: '', action: 'link', url: 'https://a.ru' } }).ok, false)
    assert.equal(normalizeCampaign({ ...good, button: { label: 'Go', action: 'link', url: '' } }).ok, false)
})

test('a window without a button is allowed (the words and the cross only)', () => {
    const r = normalizeCampaign({ ...good, button: null })
    assert.equal(r.ok, true)
    assert.equal(r.value.button, null)
})

test('the pricing button needs no address', () => {
    const r = normalizeCampaign({ ...good, button: { label: 'Тарифы', action: 'pricing' } })
    assert.equal(r.ok, true)
    assert.equal(r.value.button.action, 'pricing')
})

test('a picture is an https address or one of our own uploads, nothing else', () => {
    assert.equal(normalizeCampaign({ ...good, imageUrl: 'https://api.centrio.me/uploads/announcements/a.png' }).ok, true)
    assert.equal(normalizeCampaign({ ...good, imageUrl: 'javascript:alert(1)' }).ok, false)
    assert.equal(normalizeCampaign({ ...good, imageUrl: 'data:image/png;base64,AAAA' }).ok, false)
})

test('an unknown theme or logo style falls back to the plain ones', () => {
    const r = normalizeCampaign({ ...good, theme: 'rainbow', logoStyle: 'sparkles' })
    assert.equal(r.value.theme, 'plain')
    assert.equal(r.value.logoStyle, 'none')
})

test('the promo code is kept in capitals, letters and digits only', () => {
    assert.equal(normalizeCampaign({ ...good, promoCode: 'ny-2027 ' }).value.promoCode, 'NY-2027')
    assert.equal(normalizeCampaign({ ...good, promoCode: '<b>x' }).ok, false)
})

test('the audience: a known type, a list of addresses for people', () => {
    assert.equal(normalizeCampaign({ ...good, audience: { type: 'moon' } }).ok, false)
    const r = normalizeCampaign({ ...good, audience: { type: 'users', users: [' A@B.ru ', 'a@b.ru', 'c@d.ru'] } })
    assert.deepEqual(r.value.audience.users, ['a@b.ru', 'c@d.ru'])
    assert.equal(normalizeCampaign({ ...good, audience: { type: 'users', users: [] } }).ok, false)
})

test('the dates must be real and the end after the start', () => {
    assert.equal(normalizeCampaign({ ...good, startsAt: 'nonsense' }).ok, false)
    assert.equal(normalizeCampaign({ ...good, startsAt: '2026-12-10T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }).ok, false)
    assert.equal(normalizeCampaign({ ...good, startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' }).ok, true)
})

const guest = { kind: 'guest' }
const free = { kind: 'user', plan: 'FREE', email: 'free@x.ru', tester: false }
const pro = { kind: 'user', plan: 'PRO', email: 'pro@x.ru', tester: false }
const team = { kind: 'user', plan: 'TEAM', email: 'team@x.ru', tester: false }
const tester = { kind: 'user', plan: 'FREE', email: 'beta@x.ru', tester: true }

test('everyone means everyone, the people without an account too', () => {
    for (const w of [guest, free, pro, team, tester]) assert.equal(audienceMatches({ type: 'all' }, w), true)
})

test('only the people without an account', () => {
    assert.equal(audienceMatches({ type: 'guests' }, guest), true)
    assert.equal(audienceMatches({ type: 'guests' }, free), false)
})

test('only the people with an account', () => {
    assert.equal(audienceMatches({ type: 'registered' }, guest), false)
    assert.equal(audienceMatches({ type: 'registered' }, free), true)
})

test('free, pro and team', () => {
    assert.equal(audienceMatches({ type: 'free' }, free), true)
    assert.equal(audienceMatches({ type: 'free' }, pro), false)
    assert.equal(audienceMatches({ type: 'free' }, guest), false)
    assert.equal(audienceMatches({ type: 'pro' }, pro), true)
    assert.equal(audienceMatches({ type: 'pro' }, team), true)
    assert.equal(audienceMatches({ type: 'pro' }, free), false)
    assert.equal(audienceMatches({ type: 'team' }, team), true)
    assert.equal(audienceMatches({ type: 'team' }, pro), false)
})

test('testers, whatever their plan', () => {
    assert.equal(audienceMatches({ type: 'testers' }, tester), true)
    assert.equal(audienceMatches({ type: 'testers' }, free), false)
    assert.equal(audienceMatches({ type: 'testers' }, guest), false)
})

test('named people, by address, without regard to capitals', () => {
    const a = { type: 'users', users: ['pro@x.ru'] }
    assert.equal(audienceMatches(a, { ...pro, email: 'PRO@x.ru' }), true)
    assert.equal(audienceMatches(a, free), false)
    assert.equal(audienceMatches(a, guest), false)
})

test('a campaign is on between its dates, and only while enabled', () => {
    const now = Date.parse('2026-12-15T12:00:00Z')
    assert.equal(isActiveNow({ enabled: true }, now), true)
    assert.equal(isActiveNow({ enabled: false }, now), false)
    assert.equal(isActiveNow({ enabled: true, startsAt: '2026-12-20T00:00:00Z' }, now), false)
    assert.equal(isActiveNow({ enabled: true, endsAt: '2026-12-10T00:00:00Z' }, now), false)
    assert.equal(isActiveNow({ enabled: true, startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' }, now), true)
})

test('the app gets only what it draws, not the audience or the dates', () => {
    const c = normalizeCampaign({ ...good, audience: { type: 'users', users: ['secret@x.ru'] }, promoCode: 'ny27' }).value
    const v = publicView({ id: 'a1', updatedAt: '2026-12-01T00:00:00Z', ...c })
    assert.equal(v.id, 'a1')
    assert.equal(v.title, 'Скидка к Новому году')
    assert.equal(v.promoCode, 'NY27')
    assert.equal(v.audience, undefined)
    assert.equal(v.startsAt, undefined)
    assert.equal(JSON.stringify(v).includes('secret@x.ru'), false)
})

test('the events are counted by campaign, each person once for each kind', () => {
    const events = [
        { id: 'a1', event: 'shown', who: 'u1' }, { id: 'a1', event: 'shown', who: 'u1' }, { id: 'a1', event: 'shown', who: 'u2' },
        { id: 'a1', event: 'click', who: 'u1' }, { id: 'a1', event: 'close', who: 'u2' }, { id: 'a1', event: 'reopen', who: 'u2' },
        { id: 'a2', event: 'shown', who: 'u1' }, { id: 'a1', event: 'bogus', who: 'u1' }
    ]
    const t = tally(events)
    assert.deepEqual(t.a1, { shown: 2, click: 1, close: 1, reopen: 1 })
    assert.deepEqual(t.a2, { shown: 1, click: 0, close: 0, reopen: 0 })
})
