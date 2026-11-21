'use strict'
// What GET /api/user/profile gives the website and the app. The page refreshes its cached user from this answer after a
// payment; if the team summary is missing from it, the menu falls back to «Создать команду» for a person whose team
// exists and is paid (2026-11-18, a client who had just paid for 5 seats). So the summary is part of the answer, always.

/** @param {object|null} profile the user's own fields  @param {object|null} orgSummary from lib/org.js getOrgSummaryForUser */
function withOrgSummary(profile, orgSummary) {
    if (!profile) return profile
    return { ...profile, orgSummary: orgSummary || null }
}

const { isLoginOnlyEmail } = require('./login-accounts')

/**
 * An account made by a team owner with a login and a password holds a stand-in address; people (and apps that print the
 * address) see the login instead, and the answer says `loginOnly` so an app can offer «Привяжите почту».
 * @param {object|null} profile the user's own fields; `email` and `login` are read, nothing else is touched
 */
function withLoginShape(profile) {
    if (!profile) return profile
    const loginOnly = isLoginOnlyEmail(profile.email)
    return { ...profile, email: loginOnly && profile.login ? profile.login : profile.email, login: profile.login || null, loginOnly }
}

module.exports = { withOrgSummary, withLoginShape }
