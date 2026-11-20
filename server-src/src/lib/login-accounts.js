'use strict'

// TEAM: accounts that have a login and a password instead of an email (2026-11-21).
// Pure logic, no database and no Express here, so it is tested on its own (server-src/test/login-accounts.test.js).
//
// A login-only account keeps a stand-in address in User.email (the column is required and unique, and a lot of code reads it):
// «<login>@login.centrio.invalid». «.invalid» is reserved and routes nowhere, and sendEmail() refuses it before any request.

const crypto = require('crypto')

const STAND_IN_DOMAIN = 'login.centrio.invalid'
const LOGIN_MIN = 3
const LOGIN_MAX = 32
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const GENERATED_PASSWORD_LENGTH = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 254

const normalizeLogin = (value) => String(value == null ? '' : value).trim().toLowerCase()

/** Error object { code, message } for a login that cannot be used, or null. Expects an already normalized login. */
function checkLogin(login) {
    const value = String(login == null ? '' : login)
    if (value.length < LOGIN_MIN) return { code: 'login_short', message: `Логин: минимум ${LOGIN_MIN} символа` }
    if (value.length > LOGIN_MAX) return { code: 'login_long', message: `Логин: не больше ${LOGIN_MAX} символов` }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) return { code: 'login_chars', message: 'Логин: только латинские буквы, цифры и символы . _ - (без пробелов и @)' }
    return null
}

/** A sign-in field without «@» is a login, with «@» it is an email. */
const looksLikeLogin = (value) => {
    const v = String(value == null ? '' : value).trim()
    return v.length > 0 && !v.includes('@')
}

const standInEmail = (login) => `${normalizeLogin(login)}@${STAND_IN_DOMAIN}`
const isLoginOnlyEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(`@${STAND_IN_DOMAIN}`)

/** What to show people instead of the stand-in address. */
const shownEmail = (user) => (user && isLoginOnlyEmail(user.email) && user.login ? user.login : (user ? user.email : ''))

/** Error object for a password that cannot be used, or null. */
function checkPassword(password) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) return { code: 'password_short', message: `Пароль: минимум ${PASSWORD_MIN} символов` }
    if (password.length > PASSWORD_MAX) return { code: 'password_long', message: `Пароль: не больше ${PASSWORD_MAX} символов` }
    return null
}

const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}

function latinWord(word) {
    return Array.from(String(word).toLowerCase())
        .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
        .join('')
        .replace(/[^a-z0-9._-]/g, '')
        .replace(/^[^a-z0-9]+/, '')
}

/** «Иван Иванов» → «ivan.ivanov» (first two words); one word → that word; nothing usable → «user». */
function loginFromName(name) {
    const words = String(name == null ? '' : name).split(/\s+/).map(latinWord).filter(Boolean)
    let base = words.slice(0, 2).join('.')
    if (!base) base = 'user'
    while (base.length < LOGIN_MIN) base += '1'
    return base.slice(0, LOGIN_MAX - 3)
}

/**
 * Logins for a list of names that repeat nothing already used (isTaken(login) → boolean, for the database) and nothing
 * given earlier in the same list: a taken one gets the number 2, 3, ... → rows [{ name, login }].
 */
function assignLogins(names, isTaken) {
    const used = new Set()
    return names.map((name) => {
        const base = loginFromName(name)
        let login = base
        let n = 2
        while (used.has(login) || isTaken(login)) login = `${base}${n++}`
        used.add(login)
        return { name, login }
    })
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const pick = (alphabet) => alphabet[crypto.randomInt(0, alphabet.length)]

/** 10 characters without look-alikes (no 0 O 1 l I o), with an upper letter, a lower letter and a digit. */
function generatePassword() {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)]
    const all = UPPER + LOWER + DIGITS
    while (chars.length < GENERATED_PASSWORD_LENGTH) chars.push(pick(all))
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join('')
}

/** A pasted list of addresses → { valid, invalid, duplicates }, all lower-cased. */
function parseEmails(text) {
    const valid = []
    const invalid = []
    const duplicates = []
    const seen = new Set()
    for (const raw of String(text == null ? '' : text).split(/[\s,;]+/)) {
        const token = raw.replace(/^[<"'(]+|[>"')]+$/g, '').trim().toLowerCase()
        if (!token) continue
        if (!EMAIL_RE.test(token) || token.length > EMAIL_MAX) { if (!invalid.includes(token)) invalid.push(token); continue }
        if (seen.has(token)) { if (!duplicates.includes(token)) duplicates.push(token); continue }
        seen.add(token)
        valid.push(token)
    }
    return { valid, invalid, duplicates }
}

/** Failed attempts per key (a login): `max` failures inside `windowMs` lock the key until the window ends. */
function createAttemptLock({ max, windowMs }) {
    const entries = new Map() // key -> { count, first }
    const alive = (entry, now) => entry && now - entry.first <= windowMs
    return {
        check(key, now = Date.now()) {
            const entry = entries.get(key)
            if (alive(entry, now) && entry.count >= max) return { locked: true, retryAfterSec: Math.max(1, Math.ceil((entry.first + windowMs - now) / 1000)) }
            return { locked: false, retryAfterSec: 0 }
        },
        fail(key, now = Date.now()) {
            if (entries.size > 5000) for (const [k, e] of entries) if (!alive(e, now)) entries.delete(k)
            const entry = entries.get(key)
            if (alive(entry, now)) entry.count += 1
            else entries.set(key, { count: 1, first: now })
        },
        clear(key) { entries.delete(key) }
    }
}

module.exports = {
    STAND_IN_DOMAIN, LOGIN_MIN, LOGIN_MAX, PASSWORD_MIN,
    normalizeLogin, checkLogin, looksLikeLogin, standInEmail, isLoginOnlyEmail, shownEmail,
    checkPassword, loginFromName, assignLogins, generatePassword, parseEmails, createAttemptLock
}
