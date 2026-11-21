// Sign-in by email (must stay as it was), sign-in by login (new), and attaching a real email (new), against stand-ins
// for the database and the mailer. Needs express, bcryptjs and the other API packages: run on the server
// (NODE_PATH=/var/www/centrio-api/node_modules); elsewhere the tests are skipped.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

let express, bcrypt, hasDeps = true
try { express = require('express'); bcrypt = require('bcryptjs'); require('google-auth-library'); require('axios') } catch { hasDeps = false }

const SRC = path.join(__dirname, '..', 'src')

async function boot() {
    const users = []
    const sent = { codes: [] }
    const prisma = {
        user: {
            findUnique: async ({ where }) => users.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) || null,
            findFirst: async ({ where }) => users.find((u) => String(u.email).toLowerCase() === String(where.email.equals).toLowerCase()) || null,
            update: async ({ where, data }) => {
                const u = users.find((x) => x.id === where.id)
                if (data.email && users.some((x) => x.id !== u.id && x.email === data.email)) { const e = new Error('dup'); e.code = 'P2002'; throw e }
                Object.assign(u, data)
                return u
            }
        },
        loginEvent: { create: async () => ({}) },
        session: { deleteMany: async () => ({}) }
    }
    const stubs = {
        '../utils/prisma': prisma,
        '../utils/tokens': { generateAccessToken: (id) => `access-${id}`, generateRefreshToken: async (id) => `refresh-${id}`, refreshTokens: async () => ({}) },
        '../middleware/auth': (req, res, next) => { req.user = users.find((u) => `access-${u.id}` === String(req.headers.authorization || '').replace('Bearer ', '')); req.user ? next() : res.status(401).json({ error: 'no' }) },
        '../lib/org': { getOrgSummaryForUser: async () => null },
        '../lib/signup-trial': { grantSignupTrial: async (u) => u },
        '../lib/admin-push': { notifyAdminSignup: async () => {} },
        '../lib/ad-touch': { attachSignupSource: () => {} },
        '../lib/beta-testers': { isBetaTester: () => false },
        '../lib/email': {
            sendWelcomeEmail: async () => ({ ok: true }), sendVerificationEmail: async () => ({ ok: true }), sendPasswordResetEmail: async () => ({ ok: true }),
            sendRegistrationCodeEmail: async () => ({ ok: true }),
            sendEmailAttachCodeEmail: async (email, code) => { sent.codes.push({ email, code }); return { ok: true } }
        }
    }
    const original = Module._load
    Module._load = function (request, parent, ...rest) {
        if (parent && parent.filename && parent.filename.startsWith(SRC) && stubs[request]) return stubs[request]
        return original.call(this, request, parent, ...rest)
    }
    for (const f of ['../src/routes/auth', '../src/lib/login-accounts']) delete require.cache[require.resolve(f)]
    const router = require('../src/routes/auth')
    const la = require('../src/lib/login-accounts')
    Module._load = original
    la.loginLock.clear('ivan')

    const app = express()
    app.use(express.json())
    app.use('/api/auth', router)
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    const hash = await bcrypt.hash('Right-pass-1', 4)
    users.push(
        { id: 'u-mail', email: 'person@x.ru', name: 'P', passwordHash: hash, isActive: true, emailVerified: true, plan: 'FREE' },
        { id: 'u-login', email: 'ivan@login.centrio.invalid', login: 'ivan', name: 'Иван', passwordHash: hash, isActive: true, emailVerified: true, plan: 'FREE' },
        { id: 'u-off', email: 'off@login.centrio.invalid', login: 'off', name: 'Off', passwordHash: hash, isActive: false, emailVerified: true, plan: 'FREE' }
    )
    return { users, sent, la, server, base: `http://127.0.0.1:${server.address().port}/api/auth` }
}

const post = async (base, url, body, token) => {
    const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
}

test('sign-in by email works as before, wrong password says «email или пароль»', { skip: !hasDeps }, async () => {
    const { server, base } = await boot()
    const ok = await post(base, '/login', { email: 'person@x.ru', password: 'Right-pass-1' })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.user.email, 'person@x.ru')
    assert.equal(ok.body.user.loginOnly, false)
    assert.equal(ok.body.accessToken, 'access-u-mail')
    const bad = await post(base, '/login', { email: 'person@x.ru', password: 'nope-nope' })
    assert.equal(bad.status, 401)
    assert.equal(bad.body.error, 'Неверный email или пароль')
    assert.equal((await post(base, '/login', { email: 'nobody@x.ru', password: 'whatever1' })).body.error, 'Неверный email или пароль')
    assert.equal((await post(base, '/login', { password: 'x' })).status, 400)
    server.close()
})

test('sign-in by login: case and spaces do not matter, the answer shows the login, not the stand-in address', { skip: !hasDeps }, async () => {
    const { server, base } = await boot()
    const r = await post(base, '/login', { email: '  Ivan ', password: 'Right-pass-1' })
    assert.equal(r.status, 200)
    assert.equal(r.body.user.email, 'ivan')
    assert.equal(r.body.user.login, 'ivan')
    assert.equal(r.body.user.loginOnly, true)
    assert.equal(r.body.accessToken, 'access-u-login')
    const bad = await post(base, '/login', { email: 'ivan', password: 'wrong-pass-1' })
    assert.equal(bad.status, 401)
    assert.equal(bad.body.error, 'Неверный логин или пароль')
    assert.equal((await post(base, '/login', { email: 'ghost', password: 'wrong-pass-1' })).body.error, 'Неверный логин или пароль')
    assert.equal((await post(base, '/login', { email: 'off', password: 'Right-pass-1' })).status, 403)
    server.close()
})

test('10 wrong passwords lock the login: even the right password waits; a right sign-in before that clears the count', { skip: !hasDeps }, async () => {
    const { server, base } = await boot()
    for (let i = 0; i < 9; i++) await post(base, '/login', { email: 'ivan', password: 'wrong-pass-1' })
    assert.equal((await post(base, '/login', { email: 'ivan', password: 'Right-pass-1' })).status, 200) // clears
    for (let i = 0; i < 10; i++) await post(base, '/login', { email: 'ivan', password: 'wrong-pass-1' })
    const locked = await post(base, '/login', { email: 'ivan', password: 'Right-pass-1' })
    assert.equal(locked.status, 429)
    assert.equal(locked.body.code, 'login_locked')
    // the lock is per login: another login and the email sign-in are not touched
    assert.equal((await post(base, '/login', { email: 'person@x.ru', password: 'Right-pass-1' })).status, 200)
    server.close()
})

test('attach email: code to the mailbox, confirm, the stand-in address is replaced and the login still works', { skip: !hasDeps }, async () => {
    const { server, base, users, sent } = await boot()
    const token = 'access-u-login'
    assert.equal((await post(base, '/email/attach/start', { email: 'not-an-email' }, token)).status, 400)
    assert.equal((await post(base, '/email/attach/start', { email: 'person@x.ru' }, token)).status, 409) // used by another account
    const start = await post(base, '/email/attach/start', { email: 'Ivan.Real@Mail.ru' }, token)
    assert.equal(start.status, 200)
    assert.equal(sent.codes.length, 1)
    assert.equal(sent.codes[0].email, 'Ivan.Real@Mail.ru')
    const wrong = await post(base, '/email/attach/confirm', { code: '000000' }, token)
    assert.equal(wrong.status, 400)
    assert.equal(wrong.body.code, 'code_wrong')
    const done = await post(base, '/email/attach/confirm', { code: sent.codes[0].code }, token)
    assert.equal(done.status, 200)
    assert.equal(done.body.user.email, 'Ivan.Real@Mail.ru')
    assert.equal(done.body.user.loginOnly, false)
    const user = users.find((u) => u.id === 'u-login')
    assert.equal(user.email, 'Ivan.Real@Mail.ru'); assert.equal(user.login, 'ivan'); assert.equal(user.emailVerified, true)
    assert.equal((await post(base, '/login', { email: 'ivan', password: 'Right-pass-1' })).status, 200)
    assert.equal((await post(base, '/login', { email: 'Ivan.Real@Mail.ru', password: 'Right-pass-1' })).status, 200)
    // an account that already has a real email cannot start the attaching
    assert.equal((await post(base, '/email/attach/start', { email: 'other@x.ru' }, 'access-u-mail')).status, 409)
    server.close()
})

test('attach email: five wrong codes cancel the attempt', { skip: !hasDeps }, async () => {
    const { server, base, sent } = await boot()
    const token = 'access-u-login'
    await post(base, '/email/attach/start', { email: 'real@x.ru' }, token)
    let last
    for (let i = 0; i < 5; i++) last = await post(base, '/email/attach/confirm', { code: '111111' === sent.codes[0].code ? '222222' : '111111' }, token)
    assert.equal(last.status, 429)
    assert.equal((await post(base, '/email/attach/confirm', { code: sent.codes[0].code }, token)).body.code, 'code_expired')
    server.close()
})
