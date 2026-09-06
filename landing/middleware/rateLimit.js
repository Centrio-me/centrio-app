// Generic in-memory IP-based rate limiter for public (unauthenticated) routes.
// Mirrors the lockout approach already used in admin-otp.js for /verify-totp,
// generalized into reusable Express middleware — /api/payments/create,
// /api/payments/webhook, /api/payments/fride-webhook, /api/visitors/ping and
// /api/visitors/session had no protection at all before this: an attacker
// could flood them without limit (DDoS / DB-write amplification / forged
// webhook spam).
//
// In-memory only (no external deps) — acceptable for a single-instance
// deployment, same tradeoff already accepted by admin-otp.js. If the backend
// is ever scaled horizontally, this needs to move to a shared store (Redis).

const buckets = new Map() // key -> { count, windowStart }

// Periodic sweep so the map doesn't grow unbounded.
setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of buckets) {
        if (now - entry.windowStart > entry.windowMs) buckets.delete(key)
    }
}, 60_000)

/**
 * @param {object} opts
 * @param {number} opts.windowMs   Sliding window length in ms
 * @param {number} opts.max        Max requests allowed per window per key
 * @param {(req: import('express').Request) => string} [opts.keyGenerator]
 * @param {string} [opts.name]     Used to namespace the bucket key so two
 *                                 limiters on different routes don't collide
 */
function rateLimit({ windowMs, max, keyGenerator, name = 'default' }) {
    return function rateLimitMiddleware(req, res, next) {
        const clientKey = keyGenerator
            ? keyGenerator(req)
            : (req.ip || req.headers['x-forwarded-for'] || 'unknown')
        const key = `${name}:${clientKey}`

        const now = Date.now()
        let entry = buckets.get(key)
        if (!entry || (now - entry.windowStart) > windowMs) {
            entry = { count: 0, windowStart: now, windowMs }
        }
        entry.count += 1
        buckets.set(key, entry)

        if (entry.count > max) {
            const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000)
            res.set('Retry-After', String(Math.max(retryAfterSec, 1)))
            return res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' })
        }

        next()
    }
}

module.exports = { rateLimit }
