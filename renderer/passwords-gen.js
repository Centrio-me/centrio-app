// Random password generator for the password manager (Web Crypto, no modulo bias).
const GENERATOR_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+'

function generatePassword(length = 18) {
    const out = []
    const limit = Math.floor(0x100000000 / GENERATOR_CHARS.length) * GENERATOR_CHARS.length
    while (out.length < length) {
        const values = crypto.getRandomValues(new Uint32Array(length * 2))
        for (const value of values) {
            if (value < limit && out.length < length) out.push(GENERATOR_CHARS[value % GENERATOR_CHARS.length])
        }
    }
    return out.join('')
}

module.exports = { generatePassword }
