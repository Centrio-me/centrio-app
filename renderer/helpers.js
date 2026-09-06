function getCurrentLocale(store) {
    const lang = store.get('settings.language', 'ru')

    const map = {
        ru: 'ru-RU',
        en: 'en-US',
        de: 'de-DE',
        es: 'es-ES',
        fr: 'fr-FR',
        it: 'it-IT',
        zh: 'zh-CN'
    }

    return map[lang] || 'ru-RU'
}

function getUserInitial(user) {
    return user?.name?.[0]?.toUpperCase() || '?'
}

// LEGACY — kept only for backward-compat reference. The screen-lock PIN no
// longer uses this: it's not a real cryptographic hash (trivial rolling
// hash, no salt), so storing it in electron-store's plaintext-on-disk
// settings file offered no real protection against someone reading the
// store file directly. PIN hashing/verification now happens in the main
// process via crypto.scryptSync (see main/services/pinHash.js), which the
// renderer calls over IPC ('security:hash-pin' / 'security:verify-pin')
// because this sandboxed renderer (nodeIntegration:false, contextIsolation:
// true) has no direct access to Node's crypto module. This function is kept
// byte-for-byte identical to before ONLY so pinHash.js's legacyHash() can
// still recognize and migrate PINs that were hashed with it prior to this
// fix — do not use it for anything new.
function hashPassword(password) {
    let hash = 0
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return hash.toString(36) + password.length.toString(36)
}

module.exports = {
    getCurrentLocale,
    getUserInitial,
    hashPassword
}