// ── Screen-lock PIN hashing (main process only) ───────────────────────────
// Runs exclusively in the Electron main process because it needs Node's
// `crypto` module. The renderer that actually collects the PIN cannot do
// this itself: it runs with nodeIntegration:false + contextIsolation:true
// (see main/factory/browserWindow.js, preload.js) and only ever gets a
// `require('crypto')`-free bundle out of build-renderer.js (esbuild marks
// 'crypto' as `external`, but with no `require` exposed on `window` there is
// nothing for that external reference to resolve to at runtime — calling it
// would throw immediately). So the renderer sends the plaintext PIN over IPC
// (main/ipc/window.js: security:hash-pin / security:verify-pin) and this
// module does the actual KDF work, mirroring how the OS-level safeStorage
// calls already work for the encrypted store.
//
// Format: hashes are tagged so old and new formats can coexist during
// migration — see verifyPin() below.
//   "v2:<saltHex>:<derivedHex>"   → crypto.scryptSync, current format
//   anything else (e.g. "k3j2z9") → legacy rolling-hash format (pre-fix)
const crypto = require('crypto')

const SCRYPT_KEYLEN = 64
const SALT_BYTES = 16
const V2_PREFIX = 'v2'

function hashPin(pin) {
    const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
    const derived = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN).toString('hex')
    return `${V2_PREFIX}:${salt}:${derived}`
}

// The exact legacy algorithm previously in renderer/helpers.js's
// hashPassword() — kept ONLY so verifyPin() can still recognize a PIN that
// was set before this fix shipped. Never used to create new hashes.
function legacyHash(value) {
    const str = String(value)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
    }
    return hash.toString(36) + str.length.toString(36)
}

function isV2Format(stored) {
    return typeof stored === 'string' && stored.startsWith(`${V2_PREFIX}:`)
}

// Verifies `pin` against a stored hash of either format.
// Returns { valid, needsMigration }:
//   - valid: whether the PIN matched
//   - needsMigration: true only when it matched via the OLD format — the
//     caller (main/ipc/window.js) should immediately re-hash with hashPin()
//     and persist it, so the user is transparently upgraded to the strong
//     format on their next successful unlock without ever re-entering/
//     resetting their PIN.
function verifyPin(pin, stored) {
    if (!stored || typeof stored !== 'string') return { valid: false, needsMigration: false }

    if (isV2Format(stored)) {
        const parts = stored.split(':')
        if (parts.length !== 3) return { valid: false, needsMigration: false }
        const [, salt, expectedHex] = parts

        try {
            const expected = Buffer.from(expectedHex, 'hex')
            const actual = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN)
            if (expected.length !== actual.length) return { valid: false, needsMigration: false }
            return { valid: crypto.timingSafeEqual(expected, actual), needsMigration: false }
        } catch {
            return { valid: false, needsMigration: false }
        }
    }

    // Old-format value — fall back to the legacy check for this ONE
    // verification so existing users aren't locked out, then flag for
    // transparent migration to v2 on success.
    const valid = legacyHash(pin) === stored
    return { valid, needsMigration: valid }
}

module.exports = {
    hashPin,
    verifyPin,
    isV2Format,
    // exported for tests / migration tooling only — do not use for new hashes
    legacyHash
}
