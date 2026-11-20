const test = require('node:test')
const assert = require('node:assert/strict')
const la = require('../src/lib/login-accounts')

test('a login is lower-cased, trimmed and must be 3-32 of letters, digits . _ -', () => {
    assert.equal(la.normalizeLogin('  Ivan.Ivanov '), 'ivan.ivanov')
    assert.equal(la.checkLogin('ivan.ivanov'), null)
    assert.equal(la.checkLogin('ab').code, 'login_short')
    assert.equal(la.checkLogin('a'.repeat(33)).code, 'login_long')
    assert.equal(la.checkLogin('ivan ivanov').code, 'login_chars')
    assert.equal(la.checkLogin('ivan@ivanov').code, 'login_chars')
    assert.equal(la.checkLogin('.ivan').code, 'login_chars')
    assert.equal(la.checkLogin('Иван').code, 'login_chars')
})

test('a login is told from an email by the missing @', () => {
    assert.equal(la.looksLikeLogin('ivan.ivanov'), true)
    assert.equal(la.looksLikeLogin('ivan@ivanov.ru'), false)
    assert.equal(la.looksLikeLogin(''), false)
})

test('the stand-in address of a login-only account never reaches a mailbox', () => {
    assert.equal(la.standInEmail('ivan.ivanov'), 'ivan.ivanov@login.centrio.invalid')
    assert.equal(la.isLoginOnlyEmail('ivan.ivanov@login.centrio.invalid'), true)
    assert.equal(la.isLoginOnlyEmail('IVAN@LOGIN.CENTRIO.INVALID'), true)
    assert.equal(la.isLoginOnlyEmail('ivan@gmail.com'), false)
    assert.equal(la.isLoginOnlyEmail('tg_123@centrio.me'), false)
    assert.equal(la.isLoginOnlyEmail(null), false)
})

test('the address shown to people is the login for a login-only account', () => {
    assert.equal(la.shownEmail({ email: 'ivan@login.centrio.invalid', login: 'ivan' }), 'ivan')
    assert.equal(la.shownEmail({ email: 'a@b.ru', login: 'ivan' }), 'a@b.ru')
    assert.equal(la.shownEmail({ email: 'a@b.ru' }), 'a@b.ru')
})

test('a Russian name becomes a latin login', () => {
    assert.equal(la.loginFromName('Иван Иванов'), 'ivan.ivanov')
    assert.equal(la.loginFromName('Щербакова Юлия Ёжикова'), 'shcherbakova.yuliya')
    assert.equal(la.loginFromName('Anna'), 'anna')
    assert.equal(la.loginFromName('  Мария   Петрова-Сидорова '), 'mariya.petrova-sidorova')
    assert.equal(la.loginFromName('Ян'), 'yan')
    assert.equal(la.loginFromName('Ю'), 'yu1')
    assert.equal(la.loginFromName('!!!'), 'user')
})

test('suggested logins never repeat and never take a name that is already used', () => {
    const taken = new Set(['ivan.ivanov', 'ivan.ivanov2'])
    const rows = la.assignLogins(['Иван Иванов', 'Иван Иванов', 'Пётр Сидоров'], (l) => taken.has(l))
    assert.deepEqual(rows.map((r) => r.login), ['ivan.ivanov3', 'ivan.ivanov4', 'pyotr.sidorov'])
})

test('a generated password is long enough, has no look-alike characters and differs each time', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
        const p = la.generatePassword()
        assert.equal(p.length, 10)
        assert.ok(!/[0O1lIo]/.test(p), p)
        assert.ok(/[a-z]/.test(p) && /[A-Z]/.test(p) && /[2-9]/.test(p), p)
        seen.add(p)
    }
    assert.ok(seen.size > 190)
})

test('a typed password needs 8+ characters', () => {
    assert.equal(la.checkPassword('12345678'), null)
    assert.equal(la.checkPassword('1234567').code, 'password_short')
    assert.equal(la.checkPassword('x'.repeat(129)).code, 'password_long')
    assert.equal(la.checkPassword('').code, 'password_short')
})

test('a list of emails is split on lines, commas, semicolons and spaces, lower-cased and de-duplicated', () => {
    const r = la.parseEmails('A@x.ru, b@x.ru;\nB@x.ru   c@@x.ru\nnot-an-email  <d@x.ru>')
    assert.deepEqual(r.valid, ['a@x.ru', 'b@x.ru', 'd@x.ru'])
    assert.deepEqual(r.invalid, ['c@@x.ru', 'not-an-email'])
    assert.deepEqual(r.duplicates, ['b@x.ru'])
})

test('a login attempt lock opens after 10 failures and clears on success', () => {
    const lock = la.createAttemptLock({ max: 10, windowMs: 15 * 60 * 1000 })
    const t0 = 1000
    for (let i = 0; i < 9; i++) lock.fail('ivan', t0 + i)
    assert.equal(lock.check('ivan', t0 + 10).locked, false)
    lock.fail('ivan', t0 + 11)
    const st = lock.check('ivan', t0 + 12)
    assert.equal(st.locked, true)
    assert.ok(st.retryAfterSec > 0 && st.retryAfterSec <= 900)
    assert.equal(lock.check('maria', t0 + 12).locked, false)
    assert.equal(lock.check('ivan', t0 + 16 * 60 * 1000).locked, false)
    lock.fail('ivan', t0 + 16 * 60 * 1000)
    lock.clear('ivan')
    assert.equal(lock.check('ivan', t0 + 16 * 60 * 1000 + 1).locked, false)
})
