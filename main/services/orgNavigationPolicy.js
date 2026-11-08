// TEAM strict mode, main-process side (2026-11-08): a team messenger tab stays on its own site and
// the sign-in providers that site uses; links elsewhere open in the system browser.
// The renderer tells us the strict flag and each team tab's address over 'team:set-strict'.

let current = { strict: false, assigned: {} }

function setState({ strict, assigned }) {
    current = { strict: strict === true, assigned: assigned && typeof assigned === 'object' ? { ...assigned } : {} }
}

const { baseDomain, allowedBaseDomains } = require('./signInDomains')

function hostMatches(host, assignedUrl) {
    return allowedBaseDomains(assignedUrl).includes(baseDomain(host))
}

function decideNavigation({ messengerId, targetUrl }) {
    if (!current.strict || !String(messengerId).startsWith('org:')) return 'allow'
    const assignedUrl = current.assigned[messengerId]
    if (!assignedUrl) return 'allow'
    let target
    try { target = new URL(targetUrl) } catch { return 'block' }
    if (target.protocol === 'about:' || target.protocol === 'blob:' || target.protocol === 'data:') return target.href === 'about:blank' ? 'allow' : 'block'
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return 'block'
    return hostMatches(target.hostname, assignedUrl) ? 'allow' : 'external'
}

// Which team tab a guest session belongs to (team tabs are not in the messengers store).
function messengerIdForSession(targetSession, fromPartition) {
    for (const id of Object.keys(current.assigned)) {
        try { if (fromPartition(`persist:${id}`) === targetSession) return id } catch { /* not a partition */ }
    }
    return null
}

module.exports = { setState, decideNavigation, messengerIdForSession }
