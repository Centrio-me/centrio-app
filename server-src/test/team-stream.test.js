const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { streamOrgEvents } = require('../src/lib/team-stream')
const { emitOrgEvent } = require('../src/lib/team-events')

function fakeRes() {
    return {
        chunks: [], ended: false, code: 0, headers: {},
        status(c) { this.code = c; return this },
        set(h) { Object.assign(this.headers, h); return this },
        flushHeaders() {},
        write(s) { this.chunks.push(s) },
        end() { this.ended = true }
    }
}

const tick = () => new Promise((r) => setImmediate(r))

test('opens an event stream and delivers the member his own events only', async () => {
    const req = new EventEmitter()
    const res = fakeRes()
    streamOrgEvents(req, res, { orgId: 's1', viewer: { userId: 'u1', role: 'MEMBER' }, findMember: async () => ({ status: 'ACTIVE' }) })
    emitOrgEvent('s1', 'assignments', { userId: 'u1' })
    emitOrgEvent('s1', 'assignments', { userId: 'u2' })
    req.emit('close')
    assert.equal(res.code, 200)
    assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8')
    assert.equal(res.headers['X-Accel-Buffering'], 'no')
    const body = res.chunks.join('')
    assert.match(body, /^: connected/)
    assert.equal(body.match(/event: assignments/g).length, 1)
    assert.match(body, /data: {"userId":"u1"}/)
})

test('closing the request stops delivery', async () => {
    const req = new EventEmitter()
    const res = fakeRes()
    streamOrgEvents(req, res, { orgId: 's2', viewer: { userId: 'o', role: 'OWNER' }, findMember: async () => null })
    req.emit('close')
    emitOrgEvent('s2', 'settings')
    assert.equal(res.ended, true)
    assert.doesNotMatch(res.chunks.join(''), /event: settings/)
})

test('a removed member gets his member event and then the stream closes', async () => {
    const req = new EventEmitter()
    const res = fakeRes()
    streamOrgEvents(req, res, { orgId: 's3', viewer: { userId: 'u5', role: 'MEMBER' }, findMember: async () => ({ status: 'SUSPENDED' }) })
    emitOrgEvent('s3', 'member', { userId: 'u5' })
    await tick(); await tick()
    assert.match(res.chunks.join(''), /event: member/)
    assert.equal(res.ended, true)
})

test('any change to the viewer membership ends his stream, so a demoted admin reconnects as a member', async () => {
    const req = new EventEmitter()
    const res = fakeRes()
    streamOrgEvents(req, res, { orgId: 's4', viewer: { userId: 'adm', role: 'ADMIN' }, findMember: async () => ({ status: 'ACTIVE', role: 'MEMBER' }) })
    emitOrgEvent('s4', 'member', { userId: 'adm' })
    await tick(); await tick()
    assert.equal(res.ended, true)
})
