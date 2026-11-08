const test = require('node:test')
const assert = require('node:assert/strict')
const { statusFor, pickPersonBeat, activeMinutesOf, buildLivePerson, summarizeLive, parseBeat } = require('../src/lib/team-presence')

const NOW = new Date('2026-11-10T10:00:00Z')
const ago = (sec) => new Date(NOW.getTime() - sec * 1000)

test('a fresh open beat with little idle time is working', () => {
    assert.equal(statusFor({ at: ago(10), open: true, idleSec: 20 }, NOW, true), 'working')
})

test('no beat for 91 seconds is offline', () => {
    assert.equal(statusFor({ at: ago(91), open: true, idleSec: 0 }, NOW, true), 'offline')
    assert.equal(statusFor(null, NOW, true), 'offline')
})

test('a closed app is offline', () => {
    assert.equal(statusFor({ at: ago(5), open: false, idleSec: 0 }, NOW, true), 'offline')
})

test('idle for 300 seconds is away', () => {
    assert.equal(statusFor({ at: ago(5), open: true, idleSec: 300 }, NOW, true), 'away')
})

test('outside work hours, anyone not working is off hours', () => {
    assert.equal(statusFor({ at: ago(5), open: true, idleSec: 900 }, NOW, false), 'off_hours')
    assert.equal(statusFor(null, NOW, false), 'off_hours')
    assert.equal(statusFor({ at: ago(5), open: true, idleSec: 0 }, NOW, false), 'working')
})

test('pickPersonBeat prefers the open device with less idle time', () => {
    const beats = [
        { deviceKeyId: 'a', at: ago(5), open: true, idleSec: 600 },
        { deviceKeyId: 'b', at: ago(20), open: true, idleSec: 10 },
        { deviceKeyId: 'c', at: ago(1), open: false, idleSec: 0 }
    ]
    assert.equal(pickPersonBeat(beats).deviceKeyId, 'b')
    assert.equal(pickPersonBeat([]), null)
})

test('a beat adds half a minute of work only when the person is at the computer', () => {
    assert.equal(activeMinutesOf({ open: true, idleSec: 10 }), 0.5)
    assert.equal(activeMinutesOf({ open: true, idleSec: 300 }), 0)
    assert.equal(activeMinutesOf({ open: false, idleSec: 0 }), 0)
})

test('parseBeat keeps only team messengers and clamps numbers', () => {
    const beat = parseBeat({ open: true, idleSec: -5, frontAssignmentId: 'x', unread: { a1: 3, zz: 9, a2: -1 }, deviceKeyId: 'k' }, new Set(['a1', 'a2']))
    assert.deepEqual(beat, { open: true, idleSec: 0, frontAssignmentId: null, unreadTotal: 3, deviceKeyId: 'k' })
    assert.equal(parseBeat({ open: true, idleSec: 10, frontAssignmentId: 'a1' }, new Set(['a1'])).frontAssignmentId, 'a1')
})

test('buildLivePerson shows the front messenger, unread, the longest wait and sign-in problems', () => {
    const person = buildLivePerson({
        member: { userId: 'u1', name: 'Анна' },
        beats: [{ deviceKeyId: 'd1', at: ago(10), open: true, idleSec: 5, frontAssignmentId: 'a1' }],
        stats: [
            { messengerKey: 'a1', messengerName: 'WhatsApp', unreadCount: 2, waitingSince: ago(600), loginState: 'in' },
            { messengerKey: 'a2', messengerName: 'Avito', unreadCount: 1, waitingSince: ago(1500), loginState: 'in' },
            { messengerKey: 'a3', messengerName: 'MAX', unreadCount: 0, waitingSince: null, loginState: 'out' }
        ],
        assignments: [{ id: 'a1', name: 'WhatsApp', paused: false }, { id: 'a2', name: 'Avito', paused: false }, { id: 'a3', name: 'MAX', paused: false }],
        daily: { firstAt: ago(3600), activeMin: 55 },
        now: NOW,
        inHours: true
    })
    assert.equal(person.status, 'working')
    assert.equal(person.frontName, 'WhatsApp')
    assert.equal(person.unreadTotal, 3)
    assert.deepEqual(person.longestWait, { assignmentName: 'Avito', minutes: 25 })
    assert.equal(person.signInProblems, 1)
    assert.equal(person.devices, 1)
    assert.equal(person.activeMinToday, 55)
})

test('a paused messenger does not count towards unread or waiting', () => {
    const person = buildLivePerson({
        member: { userId: 'u1', name: 'Анна' },
        beats: [],
        stats: [{ messengerKey: 'a1', messengerName: 'WhatsApp', unreadCount: 4, waitingSince: ago(600), loginState: 'in' }],
        assignments: [{ id: 'a1', name: 'WhatsApp', paused: true }],
        daily: null, now: NOW, inHours: true
    })
    assert.equal(person.unreadTotal, 0)
    assert.equal(person.longestWait, null)
    assert.equal(person.status, 'offline')
    // the owner still sees it in the panel, to turn it back on
    assert.deepEqual(person.messengers, [{ id: 'a1', name: 'WhatsApp', paused: true, unread: 0, waitingMin: null, loginState: null }])
})

test('summarizeLive counts people on shift, clients waiting and the longest wait', () => {
    const s = summarizeLive([
        { status: 'working', waitingCount: 2, longestWait: { minutes: 12 } },
        { status: 'away', waitingCount: 1, longestWait: { minutes: 30 } },
        { status: 'offline', waitingCount: 0, longestWait: null }
    ])
    assert.deepEqual(s, { onShift: 2, waitingNow: 3, longestWaitMin: 30 })
})
