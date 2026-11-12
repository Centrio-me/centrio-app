// Which update channel this Centrio reads (since 3.8.1). Testers are marked by hand on the server (owner, 2026-11-12)
// and come as `betaTester: true` in the account (/api/auth/me): they read beta*.yml and get test versions first.
// The server publishes every ordinary release to the beta channel too, so testers never miss one.
//   'beta'   — read the test channel
//   'latest' — read the ordinary channel, also back down from a test version (someone was taken off the list)
//   null     — leave electron-updater as it is (ordinary users on ordinary versions: nothing changes for them)
// `betaTester` undefined means the account is not known yet (no sign-in, nothing fetched): a test version installed by a
// link keeps the beta channel until the account says otherwise.

/**
 * @param {{ betaTester?: boolean, version: string, current?: string }} input — current: the channel electron-updater reads now
 * @returns {'beta' | 'latest' | null}
 */
function updateChannelFor({ betaTester, version, current }) {
    const onTestVersion = /-beta\b/.test(String(version || ''))
    if (betaTester === true) return 'beta'
    if (betaTester === false && onTestVersion) return 'latest'
    // taken off the list while Centrio runs: the beta channel set earlier in this run is left at once
    if (betaTester === false && current === 'beta') return 'latest'
    if (onTestVersion) return 'beta'
    return null
}

module.exports = { updateChannelFor }
