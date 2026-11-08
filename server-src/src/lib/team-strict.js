// Strict mode default (TEAM control, 2026-11-08): people already in a team keep it off until the
// owner turns it on; people who join after the app with strict mode is released start with it on.
// The release date comes from TEAM_STRICT_DEFAULT_FROM (YYYY-MM-DD), set when 3.7 goes out.
function defaultStrictForJoin(now, releaseDate) {
    if (!releaseDate) return false
    const from = new Date(releaseDate)
    if (Number.isNaN(from.getTime())) return false
    return now >= from
}

module.exports = { defaultStrictForJoin }
