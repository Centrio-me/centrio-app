const test = require('node:test')
const assert = require('node:assert/strict')
const { createSidebarDndApi } = require('../renderer/sidebar-dnd-bind')

// Lucille (TEAM, 2026-11-22): she made dividers and put the tabs in her order, restarted, and everything was back as it was. The saved
// order is applied once at start, but the tabs a team gives (org:...) are added to the sidebar LATER, at the end, and nothing put them
// back in the saved order. The order is applied again after a team tab arrives.
function fakeSidebar(savedOrder) {
    const children = []
    const byId = new Map()
    const list = {
        appendChild: (el) => { const i = children.indexOf(el); if (i >= 0) children.splice(i, 1); children.push(el); el.parentElement = list },
        querySelectorAll: () => []
    }
    const make = (id) => { const el = { id, parentElement: null }; byId.set(id, el); list.appendChild(el); return el }
    global.document = { getElementById: (id) => byId.get(id) || null }
    const store = { get: (key, fallback) => (key === 'sidebarOrder' ? savedOrder : fallback), set() {} }
    const api = createSidebarDndApi({ state: {}, store, messengerList: list, moveMessengerToFolder() {}, saveData() {} })
    return { api, make, ids: () => children.map((c) => c.id) }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SAVED = [
    { type: 'divider', id: 'd1' }, { type: 'messenger', id: 'org:a' }, { type: 'messenger', id: 'org:b' },
    { type: 'divider', id: 'd2' }, { type: 'messenger', id: 'own' }
]

test('a team tab that arrives after the start goes to the place the person gave it', async () => {
    const { api, make, ids } = fakeSidebar(SAVED)
    make('divider-d1'); make('divider-d2'); make('sidebar-own')
    api.loadOrder()
    make('sidebar-org:b'); make('sidebar-org:a') // the team's tabs come in the order the team has, at the end
    assert.notDeepEqual(ids(), ['divider-d1', 'sidebar-org:a', 'sidebar-org:b', 'divider-d2', 'sidebar-own'])
    api.reapplyOrderSoon()
    await wait(450)
    assert.deepEqual(ids(), ['divider-d1', 'sidebar-org:a', 'sidebar-org:b', 'divider-d2', 'sidebar-own'])
})

test('several team tabs arriving one after another are put in order once, not once each', async () => {
    const { api, make } = fakeSidebar(SAVED)
    let applied = 0
    const original = global.document.getElementById
    global.document.getElementById = (id) => { if (id === 'divider-d1') applied++; return original(id) }
    make('divider-d1'); make('divider-d2'); make('sidebar-own')
    make('sidebar-org:a'); make('sidebar-org:b')
    for (let i = 0; i < 5; i++) api.reapplyOrderSoon()
    await wait(450)
    assert.equal(applied, 1)
})

test('a tab that is not in the saved order stays where it came in, and a saved entry whose tab is gone is skipped', async () => {
    const { api, make, ids } = fakeSidebar([{ type: 'messenger', id: 'gone' }, { type: 'messenger', id: 'org:a' }])
    make('sidebar-org:a'); make('sidebar-new')
    api.reapplyOrderSoon()
    await wait(450)
    assert.deepEqual(ids(), ['sidebar-new', 'sidebar-org:a'])
})
