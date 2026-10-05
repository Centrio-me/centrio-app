// Team password vault — this device's side (2026-10-05).
//
// Security model (see main/services/vaultCrypto.js and the API's routes/org-vault.js):
//  - The device key pair is created here. The PRIVATE key is encrypted with Electron safeStorage (Windows DPAPI,
//    macOS Keychain, Linux libsecret) before it is written to disk — the same protection browsers use for saved
//    passwords. If the OS cannot provide that protection the vault is simply unavailable: the key is never written
//    in clear text.
//  - Passwords are decrypted only here, in the main process, and typed straight into the matching login form of
//    the messenger page. They are never returned to the renderer, never logged and never shown to the employee.
//  - A password is only filled when the page's host belongs to the site the owner assigned (or its known sign-in
//    provider), so a redirect to a look-alike site gets nothing.
const crypto = require('crypto')
const { safeStorage, webContents, session } = require('electron')
const store = require('./store')
const vaultCrypto = require('./vaultCrypto')

const KEYS_STORE_KEY = 'vaultKeys'
const DEVICE_ID_STORE_KEY = 'vaultDeviceId'

function secureStorageAvailable() {
    try { return !!safeStorage && safeStorage.isEncryptionAvailable() } catch { return false }
}

function getDeviceId() {
    let id = store.get(DEVICE_ID_STORE_KEY)
    if (typeof id !== 'string' || !id) {
        id = crypto.randomUUID()
        store.set(DEVICE_ID_STORE_KEY, id)
    }
    return id
}

/** Returns this device's public key for `userId`, creating the key pair on first use. */
async function getPublicKey(userId) {
    if (!userId) return { success: false, error: 'NO_USER' }
    if (!secureStorageAvailable()) return { success: false, error: 'NO_SECURE_STORAGE' }
    const all = store.get(KEYS_STORE_KEY, {}) || {}
    let entry = all[userId]
    if (!entry || !entry.publicKey || !entry.privateEnc) {
        const pair = await vaultCrypto.generateDeviceKeyPair()
        entry = { publicKey: pair.publicKey, privateEnc: safeStorage.encryptString(pair.privateKey).toString('base64') }
        store.set(KEYS_STORE_KEY, { ...all, [userId]: entry })
    }
    let name = ''
    try { name = require('os').hostname() } catch { /* the name is only a label */ }
    return { success: true, publicKey: entry.publicKey, deviceId: getDeviceId(), name }
}

async function decrypt(userId, blob, aad) {
    const entry = (store.get(KEYS_STORE_KEY, {}) || {})[userId]
    if (!entry || !secureStorageAvailable()) throw new Error('NO_KEY')
    const privateKey = safeStorage.decryptString(Buffer.from(entry.privateEnc, 'base64'))
    return vaultCrypto.decryptWithDeviceKey(blob, privateKey, entry.publicKey, aad)
}

// ── which hosts may receive the password ─────────────────────────────────────────────────────────────────
// Second-level labels that are themselves registry suffixes (co.uk, com.ru, spb.ru...): without this, a site on
// "firma.spb.ru" would be treated as the same site as ANY *.spb.ru page, which anyone can register.
const SUFFIX_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'spb', 'msk', 'nov', 'ru', 'ne', 'or', 'go'])
// Hosting services where every customer gets a subdomain: "alice.github.io" and "bob.github.io" are different sites.
const SHARED_HOSTING_SUFFIXES = ['github.io', 'gitlab.io', 'herokuapp.com', 'netlify.app', 'pages.dev', 'workers.dev', 'vercel.app', 'blogspot.com', 'myshopify.com', 'web.app', 'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'cloudfront.net', 'wordpress.com', 'wixsite.com', 'weebly.com', 'tilda.ws', 'ucoz.ru', 'narod.ru']

function baseDomain(hostname) {
    const host = String(hostname || '').toLowerCase()
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host // an IP address is its own site
    const parts = host.split('.').filter(Boolean)
    for (const suffix of SHARED_HOSTING_SUFFIXES) {
        if (host.endsWith('.' + suffix)) return parts.slice(-(suffix.split('.').length + 1)).join('.')
    }
    if (parts.length <= 2) return parts.join('.')
    const tld = parts[parts.length - 1]
    const second = parts[parts.length - 2]
    if (tld.length === 2 && SUFFIX_LABELS.has(second) && parts.length >= 3) return parts.slice(-3).join('.')
    return parts.slice(-2).join('.')
}

// Sign-in providers a site legitimately redirects to (their own domain differs from the site's).
const PROVIDER_DOMAINS = {
    'yandex.ru': ['yandex.ru', 'yandex.com', 'ya.ru'],
    'ya.ru': ['yandex.ru', 'yandex.com', 'ya.ru'],
    'mail.ru': ['mail.ru'],
    'vk.com': ['vk.com', 'vk.ru'],
    'vk.ru': ['vk.com', 'vk.ru'],
    'google.com': ['google.com'],
    'gmail.com': ['google.com']
}

function allowedBaseDomains(assignedUrl) {
    let host = ''
    try { host = new URL(assignedUrl).hostname } catch { return [] }
    const base = baseDomain(host)
    return [...new Set([base, ...(PROVIDER_DOMAINS[base] || [])])]
}

function hostIsAllowed(pageUrl, assignedUrl) {
    let host = ''
    try {
        const page = new URL(pageUrl)
        host = page.hostname
        // a password saved for an https site is never typed into its plain-http version (rewritable on public Wi-Fi)
        if (new URL(assignedUrl).protocol === 'https:' && page.protocol !== 'https:') return false
    } catch { return false }
    const allowed = allowedBaseDomains(assignedUrl)
    return allowed.includes(baseDomain(host))
}

// ── the form filler: runs INSIDE the messenger page, returns only a status word ──────────────────────────
// Handles one-step forms (login + password together) and two-step ones (login, "Next", then password).
function fillLoginFormInPage(username, password, passwordOnly) {
    function visible(el) {
        try {
            const s = window.getComputedStyle(el)
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
            return !!(el.getClientRects && el.getClientRects().length) && !el.disabled && !el.readOnly
        } catch (e) { return false }
    }
    function setValue(el, value) {
        el.focus()
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
        setter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    function firstVisible(selector, root) {
        const list = (root || document).querySelectorAll(selector)
        for (let i = 0; i < list.length; i++) if (visible(list[i])) return list[i]
        return null
    }
    function submit(from) {
        const scope = from.form || from.closest('form') || document
        const button = firstVisible('button[type="submit"], input[type="submit"], button:not([type])', scope)
            || firstVisible('[role="button"][type="submit"], button', scope)
        if (button) { button.click(); return }
        if (from.form && from.form.requestSubmit) { from.form.requestSubmit(); return }
        ;['keydown', 'keypress', 'keyup'].forEach(function (type) {
            from.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
        })
    }
    const USER_SELECTOR = 'input[type="email"], input[type="tel"], input[type="text"], input:not([type])'
    // A page can show several password forms at once (sign-in AND registration, e.g. letyshops.com): pick the
    // sign-in one — "current-password", a sign-in looking button, a single password field — not simply the first.
    function scoreSignIn(field) {
        let score = 0
        const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase()
        if (autocomplete.indexOf('current-password') >= 0) score += 10
        if (autocomplete.indexOf('new-password') >= 0) score -= 10
        const scope = field.form || field.closest('form') || document.body
        let text = ''
        const buttons = scope.querySelectorAll('button, input[type="submit"], [role="button"]')
        for (let i = 0; i < buttons.length; i++) text += ' ' + (buttons[i].textContent || buttons[i].value || '')
        text = text.toLowerCase()
        if (/log ?in|sign ?in|войти|вход/.test(text)) score += 3
        if (/sign ?up|register|регистр|создать|зарегистр/.test(text)) score -= 3
        if (scope.querySelectorAll('input[type="password"]').length > 1) score -= 4 // a confirm field means registration
        const rect = field.getBoundingClientRect()
        if (rect.top >= 0 && rect.bottom <= window.innerHeight) score += 1
        return score
    }
    let passwordField = null
    let bestScore = -Infinity
    const passwordFields = document.querySelectorAll('input[type="password"]')
    for (let i = 0; i < passwordFields.length; i++) {
        if (!visible(passwordFields[i])) continue
        const score = scoreSignIn(passwordFields[i])
        if (score > bestScore) { bestScore = score; passwordField = passwordFields[i] }
    }
    if (passwordField) {
        const scope = passwordField.form || document
        const userField = firstVisible('input[autocomplete="username"]', scope) || firstVisible(USER_SELECTOR, scope)
        if (userField && username && !userField.value) setValue(userField, username)
        setValue(passwordField, password)
        setTimeout(function () { submit(passwordField) }, 250)
        return 'password-filled'
    }
    // after the first step of a two-step form we only wait for the password field: never type the login twice
    if (passwordOnly) return 'waiting'
    const loneUserField = firstVisible('input[autocomplete="username"], input[name*="login" i], input[name*="email" i], input[name*="user" i], input[name*="phone" i]')
        || firstVisible(USER_SELECTOR)
    if (loneUserField && username) {
        setValue(loneUserField, username)
        setTimeout(function () { submit(loneUserField) }, 250)
        return 'username-filled'
    }
    return 'no-form'
}

function findMessengerContents(messengerId) {
    const target = session.fromPartition(`persist:${messengerId}`)
    return webContents.getAllWebContents().find((wc) => {
        try { return !wc.isDestroyed() && wc.getType() === 'webview' && wc.session === target } catch { return false }
    }) || null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Types a login+password into the sign-in form of messenger , but only while the page belongs to
 * 's site (or its known sign-in provider). Shared by the team vault and the personal password manager.
 * Resolves with a status only: { success: true } | { success: false, error: 'NO_PAGE' | 'ORIGIN_MISMATCH' | 'NO_FORM' }.
 */
async function fillSecretIntoMessenger({ messengerId, assignedUrl, secret }) {
    const contents = findMessengerContents(messengerId)
    if (!contents) return { success: false, error: 'NO_PAGE' }
    if (!secret || typeof secret.p !== 'string') return { success: false, error: 'NO_FORM' }

    // Up to ~15 s: the password field of a two-step form only appears after the first step.
    let usernameDone = false
    for (let attempt = 0; attempt < 22; attempt++) {
        if (contents.isDestroyed()) return { success: false, error: 'NO_PAGE' }
        if (!hostIsAllowed(contents.getURL(), assignedUrl)) return { success: false, error: 'ORIGIN_MISMATCH' }
        let status = 'no-form'
        try {
            status = await contents.executeJavaScript(`(${fillLoginFormInPage.toString()})(${JSON.stringify(String(secret.u || ''))}, ${JSON.stringify(secret.p)}, ${usernameDone})`)
        } catch { /* the page is navigating: try again */ }
        if (status === 'password-filled') return { success: true, status: 'ok' }
        if (status === 'username-filled') usernameDone = true
        await sleep(status === 'username-filled' ? 1500 : 700)
    }
    return { success: false, error: 'NO_FORM' }
}

/**
 * Decrypts the saved login for `messengerId` and types it into the page. Resolves with a status word only:
 * 'ok' | 'ORIGIN_MISMATCH' | 'NO_PAGE' | 'NO_FORM' | 'DECRYPT_FAILED' | 'NO_SECURE_STORAGE'.
 */
async function autofill({ userId, messengerId, blob, aad, assignedUrl }) {
    if (!secureStorageAvailable()) return { success: false, error: 'NO_SECURE_STORAGE' }
    const contents = findMessengerContents(messengerId)
    if (!contents) return { success: false, error: 'NO_PAGE' }
    if (!hostIsAllowed(contents.getURL(), assignedUrl)) return { success: false, error: 'ORIGIN_MISMATCH' }

    let secret
    try {
        secret = await decrypt(userId, typeof blob === 'string' ? JSON.parse(blob) : blob, String(aad || ''))
    } catch {
        return { success: false, error: 'DECRYPT_FAILED' }
    }
    if (!secret || typeof secret.p !== 'string') return { success: false, error: 'DECRYPT_FAILED' }
    const result = await fillSecretIntoMessenger({ messengerId, assignedUrl, secret })
    secret = null
    return result
}

module.exports = { getPublicKey, autofill, fillSecretIntoMessenger, secureStorageAvailable, hostIsAllowed, allowedBaseDomains, fillLoginFormInPage }
