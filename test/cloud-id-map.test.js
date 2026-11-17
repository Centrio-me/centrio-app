const test = require('node:test')
const assert = require('node:assert/strict')
const { keepLocalIds } = require('../renderer/cloud-id-map')

const local = [
    { id: 'L1', name: 'Рабочий', url: 'https://web.telegram.org/k/' },
    { id: 'L2', name: 'WA Рабочий', url: 'https://web.whatsapp.com/' }
]

test('a tab that is already here keeps its own id, so the messenger stays signed in', () => {
    const cloud = { messengers: [{ id: 'C1', name: 'Рабочий', url: 'https://web.telegram.org/k/' }, { id: 'C2', name: 'WA Рабочий', url: 'https://web.whatsapp.com/' }] }
    const r = keepLocalIds(cloud, local)
    assert.deepEqual(r.messengers.map((m) => m.id), ['L1', 'L2'])
})

test('a tab with the same id is left as it is', () => {
    const cloud = { messengers: [{ id: 'L1', name: 'Рабочий', url: 'https://web.telegram.org/k/' }] }
    assert.deepEqual(keepLocalIds(cloud, local).messengers.map((m) => m.id), ['L1'])
})

test('a tab that is new on this computer gets the cloud id', () => {
    const cloud = { messengers: [{ id: 'C9', name: 'VK', url: 'https://vk.com/' }] }
    assert.deepEqual(keepLocalIds(cloud, local).messengers.map((m) => m.id), ['C9'])
})

test('two tabs of one service are told apart by name, and one local tab is used once', () => {
    const two = [{ id: 'A', name: 'Личный', url: 'https://web.telegram.org/k/' }, { id: 'B', name: 'Рабочий', url: 'https://web.telegram.org/k/' }]
    const cloud = { messengers: [{ id: 'X', name: 'Рабочий', url: 'https://web.telegram.org/k/' }, { id: 'Y', name: 'Личный', url: 'https://web.telegram.org/k/' }] }
    assert.deepEqual(keepLocalIds(cloud, two).messengers.map((m) => m.id), ['B', 'A'])
})

test('a renamed tab still finds its own by the address when that is not ambiguous', () => {
    const cloud = { messengers: [{ id: 'C2', name: 'Мой WhatsApp', url: 'https://web.whatsapp.com/' }] }
    assert.deepEqual(keepLocalIds(cloud, local).messengers.map((m) => m.id), ['L2'])
})

test('where the ids lead elsewhere they follow: the open tab, the order, the split presets', () => {
    const cloud = {
        messengers: [{ id: 'C1', name: 'Рабочий', url: 'https://web.telegram.org/k/' }, { id: 'C2', name: 'WA Рабочий', url: 'https://web.whatsapp.com/' }],
        settings: { extra: { activeTabId: 'C2', sidebarOrder: ['C1', 'folder-7', 'C2'], splitPresets: [{ name: 'p', memberIds: ['C1', 'C2'] }] } }
    }
    const r = keepLocalIds(cloud, local)
    assert.equal(r.settings.extra.activeTabId, 'L2')
    assert.deepEqual(r.settings.extra.sidebarOrder, ['L1', 'folder-7', 'L2'])
    assert.deepEqual(r.settings.extra.splitPresets[0].memberIds, ['L1', 'L2'])
})

test('the cloud copy given in is not changed', () => {
    const cloud = { messengers: [{ id: 'C1', name: 'Рабочий', url: 'https://web.telegram.org/k/' }] }
    keepLocalIds(cloud, local)
    assert.equal(cloud.messengers[0].id, 'C1')
})

test('nothing local, or nothing from the cloud, changes nothing', () => {
    const cloud = { messengers: [{ id: 'C1', name: 'A', url: 'https://a.ru/' }] }
    assert.deepEqual(keepLocalIds(cloud, []).messengers.map((m) => m.id), ['C1'])
    assert.equal(keepLocalIds(null, local), null)
    assert.deepEqual(keepLocalIds({ folders: [] }, local), { folders: [] })
})
