'use strict'
// What GET /api/user/profile gives the website and the app. The page refreshes its cached user from this answer after a
// payment; if the team summary is missing from it, the menu falls back to «Создать команду» for a person whose team
// exists and is paid (2026-11-18, a client who had just paid for 5 seats). So the summary is part of the answer, always.

/** @param {object|null} profile the user's own fields  @param {object|null} orgSummary from lib/org.js getOrgSummaryForUser */
function withOrgSummary(profile, orgSummary) {
    if (!profile) return profile
    return { ...profile, orgSummary: orgSummary || null }
}

module.exports = { withOrgSummary }
