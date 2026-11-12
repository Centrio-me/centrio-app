// Own folders in «Все мессенджеры» (Oleg, 2026-11-12: «сделать ручные папки как в ТГ или Максе»)
const test = require('node:test')
const assert = require('node:assert')
const F = require('../../renderer/all-inbox/folders.js')

test('a folder is made with a trimmed name and a fresh id, an empty name makes nothing', () => {
    const a = F.addFolder([], '  Клиенты  ', () => 'f1')
    assert.deepStrictEqual(a, [{ id: 'f1', name: 'Клиенты', chats: [] }])
    assert.deepStrictEqual(F.addFolder(a, '   ', () => 'f2'), a)
})

test('a chat goes into a folder once and can be taken out; the old list is not changed', () => {
    const a = [{ id: 'f1', name: 'Клиенты', chats: [] }]
    const b = F.addChat(a, 'f1', 'tg::1')
    const c = F.addChat(b, 'f1', 'tg::1')
    assert.deepStrictEqual(c[0].chats, ['tg::1'])
    assert.deepStrictEqual(a[0].chats, [])
    assert.deepStrictEqual(F.removeChat(c, 'f1', 'tg::1')[0].chats, [])
})

test('a folder can be renamed and deleted', () => {
    const a = [{ id: 'f1', name: 'Клиенты', chats: ['x'] }, { id: 'f2', name: 'Склад', chats: [] }]
    assert.strictEqual(F.renameFolder(a, 'f1', 'VIP')[0].name, 'VIP')
    assert.strictEqual(F.renameFolder(a, 'f1', '  ')[0].name, 'Клиенты')
    assert.deepStrictEqual(F.deleteFolder(a, 'f1').map((f) => f.id), ['f2'])
})

test('broken saved data becomes an empty list, names are cut to a sane length', () => {
    assert.deepStrictEqual(F.cleanFolders(null), [])
    assert.deepStrictEqual(F.cleanFolders([{ id: 'f1', name: 'x'.repeat(100), chats: ['a', 5, 'a'] }, { nope: 1 }]),
        [{ id: 'f1', name: 'x'.repeat(F.MAX_NAME), chats: ['a'] }])
})

test('the folders a chat is in', () => {
    const a = [{ id: 'f1', name: 'A', chats: ['c'] }, { id: 'f2', name: 'B', chats: [] }]
    assert.deepStrictEqual(F.foldersOf(a, 'c'), ['f1'])
})
