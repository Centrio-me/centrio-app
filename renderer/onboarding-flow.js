// First launch order (2026-11-09): services → account (required) → PRO gift → ready.
// In 3.6.1 the account became optional and almost nobody created one (8 Nov: 18 finished the wizard, 0 opened
// "create account"), so registration is a required step again, placed after the person has picked services.

/** Where "Continue" on the services step leads. */
function stepAfterServices({ loggedIn }) {
    return loggedIn ? 'trial' : 'auth'
}

/** Where a successful sign-in on the account step leads. */
function stepAfterLogin({ inTeam, fromServices }) {
    if (inTeam) return 'leave'
    return fromServices ? 'trial' : 'services'
}

module.exports = { stepAfterServices, stepAfterLogin }
