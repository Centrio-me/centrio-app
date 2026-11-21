// Routes of routes/org-accounts.js against an in-memory stand-in for the database (the real one is not touched).
// Needs express and bcryptjs: run where they are installed (the server: NODE_PATH=/var/www/centrio-api/node_modules).
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

let express, bcrypt
try { express = require('express'); bcrypt = require('bcryptjs') } catch { /* skipped below */ }
const hasDeps = !!(express && bcrypt)

const SRC = path.join(__dirname, '..', 'src')
const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000)
const PAST = new Date(Date.now() - 24 * 3600 * 1000)

function matches(where, row, db) {
    return Object.entries(where || {}).every(([key, cond]) => {
        if (key === 'OR') return cond.some((w) => matches(w, row, db))
        if (key === 'user') return matches(cond, db.users.find((u) => u.id === row.userId) || {}, db)
        const value = row[key]
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('equals' in cond) return cond.mode === 'insensitive' ? String(value || '').toLowerCase() === String(cond.equals).toLowerCase() : value === cond.equals
            if ('gt' in cond) return value > cond.gt
            if ('startsWith' in cond) return String(value || '').startsWith(cond.startsWith)
            if ('in' in cond) return cond.in.includes(value)
            if ('not' in cond) return value !== cond.not
        }
        return value === cond
    })
}

function makeDb() {
    const db = { users: [], members: [], invites: [], sessions: [], orgs: [], audit: [], sent: [], seq: 0 }
    const id = (p) => `${p}${++db.seq}`
    let chain = Promise.resolve()
    const client = {
        $queryRaw: async () => [],
        $transaction: (arg) => {
            if (Array.isArray(arg)) return Promise.all(arg)
            const run = chain.then(() => arg(client))
            chain = run.catch(() => {})
            return run
        },
        organization: { findUnique: async ({ where }) => db.orgs.find((o) => o.id === where.id) || null },
        user: {
            findFirst: async ({ where }) => db.users.find((u) => matches(where, u, db)) || null,
            findUnique: async ({ where }) => db.users.find((u) => matches(where, u, db)) || null,
            findMany: async ({ where }) => db.users.filter((u) => matches(where, u, db)),
            create: async ({ data }) => {
                if (data.login && db.users.some((u) => u.login === data.login)) { const e = new Error('dup'); e.code = 'P2002'; throw e }
                const row = { id: id('u'), isActive: true, ...data }
                db.users.push(row)
                return row
            },
            update: async ({ where, data }) => { const u = db.users.find((x) => x.id === where.id); Object.assign(u, data); return u }
        },
        orgMember: {
            findUnique: async ({ where, include }) => {
                const k = where.orgId_userId
                const m = db.members.find((x) => x.orgId === k.orgId && x.userId === k.userId) || null
                return m && include ? { ...m, user: db.users.find((u) => u.id === m.userId) } : m
            },
            findFirst: async ({ where }) => db.members.find((m) => matches(where, m, db)) || null,
            count: async ({ where }) => db.members.filter((m) => matches(where, m, db)).length,
            create: async ({ data }) => { const row = { id: id('m'), ...data }; db.members.push(row); return row }
        },
        orgInvite: {
            findFirst: async ({ where }) => db.invites.find((i) => matches(where, i, db)) || null,
            findUnique: async ({ where, include }) => {
                const i = db.invites.find((x) => x.id === where.id) || null
                return i && include ? { ...i, organization: db.orgs.find((o) => o.id === i.orgId) } : i
            },
            count: async ({ where }) => db.invites.filter((i) => matches(where, i, db)).length,
            create: async ({ data }) => { const row = { id: id('i'), acceptedAt: null, ...data }; db.invites.push(row); return row },
            update: async ({ where, data }) => { const i = db.invites.find((x) => x.id === where.id); Object.assign(i, data); return i }
        },
        session: { deleteMany: async ({ where }) => { db.sessions = db.sessions.filter((s) => !matches(where, s, db)); return {} } }
    }
    return { db, client }
}

function boot() {
    const { db, client } = makeDb()
    const stubs = {
        '../utils/prisma': client,
        '../middleware/auth': (req, res, next) => { req.user = db.users.find((u) => u.id === req.headers['x-user']); req.user ? next() : res.status(401).json({ error: 'no' }) },
        '../lib/email': { sendOrgInviteEmail: async (m) => { db.sent.push(m); return { ok: true } } }
    }
    const original = Module._load
    Module._load = function (request, parent, ...rest) {
        if (parent && parent.filename && parent.filename.startsWith(SRC) && stubs[request]) return stubs[request]
        return original.call(this, request, parent, ...rest)
    }
    delete require.cache[require.resolve('../src/routes/org-accounts')]
    delete require.cache[require.resolve('../src/lib/org')]
    const mount = require('../src/routes/org-accounts')
    const { requireOrgRole } = require('../src/lib/org')
    Module._load = original

    const router = express.Router()
    mount(router, {
        requireOrgRole,
        logOrgAudit: async (orgId, actor, action, meta) => { db.audit.push({ orgId, actor, action, meta }) },
        orgActionKey: (req) => 'u:' + req.headers['x-user'],
        memberActionLimiter: (req, res, next) => next()
    })
    const app = express()
    app.use(express.json())
    app.use('/api/org', router)
    return new Promise((resolve) => {
        const server = app.listen(0, () => resolve({ db, server, base: `http://127.0.0.1:${server.address().port}/api/org` }))
    })
}

function seed(db, { seatLimit = 5, expires = FUTURE, members = 1 } = {}) {
    db.users.push({ id: 'owner', email: 'owner@x.ru', name: 'Owner', isActive: true }, { id: 'admin', email: 'admin@x.ru', name: 'Admin', isActive: true })
    db.orgs.push({ id: 'org1', name: 'Team', seatLimit, seatsExpiresAt: expires })
    db.members.push({ id: 'm-owner', orgId: 'org1', userId: 'owner', role: 'OWNER', status: 'ACTIVE' })
    db.members.push({ id: 'm-admin', orgId: 'org1', userId: 'admin', role: 'ADMIN', status: 'ACTIVE' })
    for (let i = 0; i < members - 1; i++) {
        db.users.push({ id: `e${i}`, email: `e${i}@x.ru`, name: `E${i}`, isActive: true })
        db.members.push({ id: `m-e${i}`, orgId: 'org1', userId: `e${i}`, role: 'MEMBER', status: 'ACTIVE' })
    }
}

const call = async (base, user, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-user': user }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: await res.json() }
}

test('prepare: logins for names, no repeats, passwords generated, free seats reported', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 5, members: 2 }) // owner + admin + 1 employee = 3 used
    db.users.push({ id: 'old', email: 'ivan.ivanov@login.centrio.invalid', login: 'ivan.ivanov', name: 'Old' })
    const r = await call(base, 'owner', 'POST', '/org1/accounts/prepare', { names: ['Иван Иванов', 'Иван Иванов', 'Анна'] })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.data.rows.map((x) => x.login), ['ivan.ivanov2', 'ivan.ivanov3', 'anna'])
    assert.ok(r.body.data.rows.every((x) => x.password.length === 10))
    assert.equal(r.body.data.freeSeats, 2)
    server.close()
})

test('create: only as many as there are free seats, the rest report «no seats»; passwords are hashed, stand-in email is set', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 4 }) // owner + admin used, 2 free
    const accounts = ['aa1', 'aa2', 'aa3'].map((l) => ({ name: l.toUpperCase(), login: l, password: 'Secret-' + l }))
    const r = await call(base, 'owner', 'POST', '/org1/accounts', { accounts })
    assert.equal(r.status, 200)
    assert.equal(r.body.data.created.length, 2)
    assert.equal(r.body.data.failed.length, 1)
    assert.equal(r.body.data.failed[0].code, 'no_seats')
    const user = db.users.find((u) => u.login === 'aa1')
    assert.equal(user.email, 'aa1@login.centrio.invalid')
    assert.notEqual(user.passwordHash, 'Secret-aa1')
    assert.ok(await bcrypt.compare('Secret-aa1', user.passwordHash))
    const member = db.members.find((m) => m.userId === user.id)
    assert.equal(member.role, 'MEMBER'); assert.equal(member.status, 'ACTIVE')
    assert.equal(db.audit.filter((a) => a.action === 'member.create_login').length, 2)
    assert.ok(!JSON.stringify(db.audit).includes('Secret-'), 'passwords never reach the journal')
    server.close()
})

test('create: a taken login, a bad login and a short password are reported one by one, the others are created', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 10 })
    db.users.push({ id: 'x', email: 'taken@login.centrio.invalid', login: 'taken', name: 'T' })
    const r = await call(base, 'owner', 'POST', '/org1/accounts', { accounts: [
        { name: 'A', login: 'taken', password: 'longenough1' },
        { name: 'B', login: 'bad login', password: 'longenough1' },
        { name: 'C', login: 'shortpw', password: '123' },
        { name: 'D', login: 'fine', password: 'longenough1' },
        { name: 'E', login: 'fine', password: 'longenough1' }
    ] })
    assert.deepEqual(r.body.data.created.map((c) => c.login), ['fine'])
    assert.deepEqual(r.body.data.failed.map((f) => f.code).sort(), ['login_chars', 'login_taken', 'login_taken', 'password_short'].sort())
    server.close()
})

test('create: two requests at once for the last seat — exactly one account is made', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 3 }) // one free
    const [a, b] = await Promise.all([
        call(base, 'owner', 'POST', '/org1/accounts', { accounts: [{ name: 'A', login: 'racea', password: 'longenough1' }] }),
        call(base, 'owner', 'POST', '/org1/accounts', { accounts: [{ name: 'B', login: 'raceb', password: 'longenough1' }] })
    ])
    assert.equal(a.body.data.created.length + b.body.data.created.length, 1)
    assert.equal(db.members.filter((m) => m.orgId === 'org1' && m.status === 'ACTIVE').length, 3)
    server.close()
})

test('create: an admin cannot make another admin; a team without a paid period creates nothing', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 10 })
    const r = await call(base, 'admin', 'POST', '/org1/accounts', { accounts: [{ name: 'A', login: 'wannaadmin', password: 'longenough1', role: 'ADMIN' }] })
    assert.equal(db.members.find((m) => m.userId === r.body.data.created[0].userId).role, 'MEMBER')
    const o = await call(base, 'owner', 'POST', '/org1/accounts', { accounts: [{ name: 'B', login: 'makesadmin', password: 'longenough1', role: 'ADMIN' }] })
    assert.equal(db.members.find((m) => m.userId === o.body.data.created[0].userId).role, 'ADMIN')
    db.orgs[0].seatsExpiresAt = PAST
    const expired = await call(base, 'owner', 'POST', '/org1/accounts', { accounts: [{ name: 'C', login: 'toolate', password: 'longenough1' }] })
    assert.equal(expired.status, 409)
    server.close()
})

test('a stranger (not in the team) and an ordinary member cannot use any of the routes', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 10, members: 2 })
    db.users.push({ id: 'out', email: 'out@x.ru', isActive: true })
    for (const user of ['out', 'e0']) {
        assert.equal((await call(base, user, 'POST', '/org1/accounts', { accounts: [{ name: 'A', login: 'nope1', password: 'longenough1' }] })).status, 403)
        assert.equal((await call(base, user, 'POST', '/org1/accounts/prepare', { names: ['A'] })).status, 403)
        assert.equal((await call(base, user, 'POST', '/org1/invites/batch', { emails: 'a@b.ru' })).status, 403)
        assert.equal((await call(base, user, 'POST', '/org1/members/owner/reset-password', {})).status, 403)
    }
    assert.equal(db.users.length, 4)
    server.close()
})

test('reset password: only for an account with a login and no real email; sessions end; owner and email accounts are refused', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 10, members: 2 })
    const made = await call(base, 'owner', 'POST', '/org1/accounts', { accounts: [{ name: 'L', login: 'lena', password: 'longenough1' }] })
    const userId = made.body.data.created[0].userId
    db.sessions.push({ id: 's1', userId }, { id: 's2', userId }, { id: 's3', userId: 'owner' })
    const r = await call(base, 'owner', 'POST', `/org1/members/${userId}/reset-password`, {})
    assert.equal(r.status, 200)
    assert.equal(r.body.data.password.length, 10)
    assert.ok(await bcrypt.compare(r.body.data.password, db.users.find((u) => u.id === userId).passwordHash))
    assert.deepEqual(db.sessions.map((s) => s.id), ['s3'])
    assert.equal((await call(base, 'owner', 'POST', '/org1/members/e0/reset-password', {})).status, 409)
    assert.equal((await call(base, 'admin', 'POST', '/org1/members/owner/reset-password', {})).status, 403)
    assert.equal((await call(base, 'owner', 'POST', `/org1/members/${userId}/reset-password`, { password: 'short' })).status, 400)
    assert.equal((await call(base, 'owner', 'POST', `/org1/members/${userId}/reset-password`, { password: 'my-own-pass-1' })).body.data.password, 'my-own-pass-1')
    server.close()
})

test('batch invites: each address gets its own result; seats are never exceeded; letters go out one by one', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 4, members: 2 }) // 3 used, 1 free
    db.invites.push({ id: 'old', orgId: 'org1', email: 'waiting@x.ru', acceptedAt: null, expiresAt: FUTURE })
    // the pending invite takes the free seat: raise the limit by one so exactly one more fits
    db.orgs[0].seatLimit = 5
    const r = await call(base, 'owner', 'POST', '/org1/invites/batch', { emails: 'new@x.ru, e0@x.ru\nwaiting@x.ru; broken@@x.ru new@x.ru other@x.ru' })
    assert.equal(r.status, 200)
    const by = Object.fromEntries(r.body.data.results.map((x) => [x.email, x.status]))
    assert.equal(by['new@x.ru'], 'sent')
    assert.equal(by['e0@x.ru'], 'already_member')
    assert.equal(by['waiting@x.ru'], 'already_invited')
    assert.equal(by['broken@@x.ru'], 'invalid')
    assert.equal(by['other@x.ru'], 'no_seats')
    assert.deepEqual(r.body.data.results.filter((x) => x.status === 'duplicate').map((x) => x.email), ['new@x.ru'], 'a repeated address is reported once as a duplicate')
    assert.equal(db.invites.filter((i) => i.orgId === 'org1' && !i.acceptedAt).length, 2)
    await new Promise((resolve) => setTimeout(resolve, 900))
    assert.deepEqual(db.sent.map((m) => m.email), ['new@x.ru'])
    assert.ok(db.sent[0].token && db.sent[0].token.length >= 32)
    server.close()
})

test('batch invites: more than 30 addresses, an empty list and an unpaid team are refused', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 100 })
    const many = Array.from({ length: 31 }, (_, i) => `p${i}@x.ru`)
    assert.equal((await call(base, 'owner', 'POST', '/org1/invites/batch', { emails: many })).status, 400)
    assert.equal((await call(base, 'owner', 'POST', '/org1/invites/batch', { emails: '   ' })).status, 400)
    db.orgs[0].seatsExpiresAt = null
    assert.equal((await call(base, 'owner', 'POST', '/org1/invites/batch', { emails: 'a@b.ru' })).status, 409)
    server.close()
})

test('resend: a fresh token replaces the old one and the letter goes out again', { skip: !hasDeps }, async () => {
    const { db, server, base } = await boot()
    seed(db, { seatLimit: 10 })
    db.invites.push({ id: 'inv', orgId: 'org1', email: 'late@x.ru', tokenHash: 'OLD', acceptedAt: null, expiresAt: new Date(Date.now() + 1000) })
    const r = await call(base, 'owner', 'POST', '/org1/invites/inv/resend', {})
    assert.equal(r.status, 200)
    assert.notEqual(db.invites[0].tokenHash, 'OLD')
    assert.ok(db.invites[0].expiresAt > new Date(Date.now() + 6 * 24 * 3600 * 1000))
    assert.equal(db.sent.length, 1)
    assert.equal(db.sent[0].email, 'late@x.ru')
    assert.equal((await call(base, 'owner', 'POST', '/org1/invites/nope/resend', {})).status, 404)
    server.close()
})
