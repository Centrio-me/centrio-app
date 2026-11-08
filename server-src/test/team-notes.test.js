const test = require('node:test')
const assert = require('node:assert/strict')
const { noteReadSummary, parseNoteBody, notesForMember } = require('../src/lib/team-notes')

const members = [{ userId: 'boss' }, { userId: 'a' }, { userId: 'b' }]

test('a note to everyone counts all members except the author', () => {
    const note = { id: 'n1', toUserId: null, createdById: 'boss' }
    assert.deepEqual(noteReadSummary(note, members, [{ noteId: 'n1', userId: 'a' }]), { readBy: 1, total: 2 })
})

test('a note to one person counts only him', () => {
    const note = { id: 'n2', toUserId: 'b', createdById: 'boss' }
    assert.deepEqual(noteReadSummary(note, members, []), { readBy: 0, total: 1 })
})

test('parseNoteBody trims text, limits it to 1000 characters and checks the recipient', () => {
    const ids = new Set(['a', 'b'])
    assert.deepEqual(parseNoteBody({ text: '  Созвон в 15:00  ', toUserId: null }, ids), { text: 'Созвон в 15:00', toUserId: null })
    assert.deepEqual(parseNoteBody({ text: 'hi', toUserId: 'a' }, ids), { text: 'hi', toUserId: 'a' })
    assert.ok(parseNoteBody({ text: '   ' }, ids).error)
    assert.ok(parseNoteBody({ text: 'x'.repeat(1001) }, ids).error)
    assert.ok(parseNoteBody({ text: 'hi', toUserId: 'stranger' }, ids).error)
})

test('a member gets unread notes for him or for everyone, oldest first', () => {
    const notes = [
        { id: 'n3', toUserId: null, createdAt: new Date('2026-11-10T10:02:00Z') },
        { id: 'n1', toUserId: 'a', createdAt: new Date('2026-11-10T10:00:00Z') },
        { id: 'n2', toUserId: 'b', createdAt: new Date('2026-11-10T10:01:00Z') }
    ]
    assert.deepEqual(notesForMember(notes, 'a', new Set(['n3'])).map((n) => n.id), ['n1'])
    assert.deepEqual(notesForMember(notes, 'a', new Set()).map((n) => n.id), ['n1', 'n3'])
})

test('a manager asking for his own notes gets only notes meant for him', () => {
    const notes = [
        { id: 'n1', toUserId: null, createdById: 'boss', createdAt: new Date('2026-11-10T10:00:00Z') },
        { id: 'n2', toUserId: 'adm', createdById: 'boss', createdAt: new Date('2026-11-10T10:01:00Z') }
    ]
    // the author of a note to everyone does not get it back as his own
    assert.deepEqual(notesForMember(notes, 'boss', new Set()).map((n) => n.id), [])
    assert.deepEqual(notesForMember(notes, 'adm', new Set()).map((n) => n.id), ['n1', 'n2'])
})
