'use strict'
// Team accounts made by a team owner with a login and a password instead of an email (3.10).
// The sign-in field takes an email OR a login; an account that has only a login is asked, in the profile, to attach a real
// email (a code to the mailbox), because with an email the person can restore the password on their own.

/** A field without «@» is a login. */
function looksLikeLogin(value) {
    const v = String(value == null ? '' : value).trim()
    return v.length > 0 && !v.includes('@')
}

/** «Забыли пароль»: for an email the site is opened; a login has no mailbox, so the person is told to ask the manager. */
function forgotPasswordAction(value) {
    return looksLikeLogin(value) ? 'ask-manager' : 'site'
}

/** The «attach an email» card is for an account that has only a login (the server says so with `loginOnly`). */
function shouldOfferEmailAttach(user) {
    return !!user && user.loginOnly === true && !!user.login
}

/** The line under the name in the profile. `loginLabel(login)` gives «Логин: ivan» in the language of the app. */
function profileAddressLine(user, loginLabel) {
    if (!user) return ''
    // An account made through Telegram has a stand-in address: it is never shown to the person.
    if (/^tg_\d+@centrio\.me$/.test(user.email || '')) return 'Telegram'
    if (user.loginOnly === true && user.login) return loginLabel(user.login)
    return user.email || ''
}

module.exports = { looksLikeLogin, forgotPasswordAction, shouldOfferEmailAttach, profileAddressLine }
