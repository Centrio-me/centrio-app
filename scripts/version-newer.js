// Is version A newer than version B? Used by the release workflow (.github/workflows/build.yml): an ordinary release is
// copied to the testers' channel only when it is newer than the test version they already have.
// A release is newer than its own test versions (3.8.1 > 3.8.1-beta.3). CLI: `node version-newer.js A B` exits 0 when
// A is newer, 1 otherwise.

function parse(version) {
    const [main, pre = ''] = String(version).trim().replace(/^v/, '').split('-')
    return { parts: main.split('.').map((n) => Number(n) || 0), pre }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isNewer(a, b) {
    const x = parse(a)
    const y = parse(b)
    for (let i = 0; i < 3; i++) {
        const d = (x.parts[i] || 0) - (y.parts[i] || 0)
        if (d) return d > 0
    }
    if (x.pre === y.pre) return false
    if (!x.pre) return true
    if (!y.pre) return false
    return x.pre.localeCompare(y.pre, 'en', { numeric: true }) > 0
}

if (require.main === module) process.exit(isNewer(process.argv[2], process.argv[3]) ? 0 : 1)

module.exports = { isNewer }
