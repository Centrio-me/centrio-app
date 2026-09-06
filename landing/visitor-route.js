// POST /api/visitors/ping  — анонимный пинг от неавторизованных пользователей
// Вызывается из Electron-приложения каждые 5 минут, если нет auth-токена.
const router = require('express').Router()
const prisma  = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')

// SECURITY: unauthenticated write endpoints with no throttle previously —
// anyone could flood these with random visitorIds and grow the visitors
// table unbounded / spike DB load.
const visitorLimiter = rateLimit({ name: 'visitors', windowMs: 60 * 1000, max: 30 })

router.post('/ping', visitorLimiter, async (req, res) => {
    try {
        const { visitorId, platform, appVersion, messengersCount } = req.body
        if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 64) {
            return res.status(400).json({ error: 'Неверный visitorId' })
        }

        const existing = await prisma.visitor.findUnique({ where: { visitorId } })

        if (existing) {
            await prisma.visitor.update({
                where: { visitorId },
                data: {
                    lastSeenAt:     new Date(),
                    sessions:       { increment: 0 },   // обновляется только lastSeenAt
                    ...(platform     ? { platform }     : {}),
                    ...(appVersion   ? { appVersion }   : {}),
                    ...(typeof messengersCount === 'number' ? { messengersCount } : {})
                }
            })
        } else {
            await prisma.visitor.create({
                data: {
                    visitorId,
                    platform:        platform     || null,
                    appVersion:      appVersion   || null,
                    messengersCount: messengersCount || 0,
                    sessions:        1
                }
            })
        }

        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/ping error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// POST /api/visitors/session — новая сессия (инкрементирует счётчик)
router.post('/session', visitorLimiter, async (req, res) => {
    try {
        const { visitorId, platform, appVersion } = req.body
        if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 64) {
            return res.status(400).json({ error: 'Неверный visitorId' })
        }

        await prisma.visitor.upsert({
            where:  { visitorId },
            update: {
                lastSeenAt: new Date(),
                sessions:   { increment: 1 },
                ...(platform   ? { platform }   : {}),
                ...(appVersion ? { appVersion } : {})
            },
            create: {
                visitorId,
                platform:   platform   || null,
                appVersion: appVersion || null,
                sessions:   1
            }
        })

        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/session error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// POST /api/visitors/crash-report — best-effort crash telemetry from the
// Electron app's main process (see main/window.js _reportCrashToServer).
// Crashes were previously only ever visible in the affected user's own local
// crash.log, so recurring crashes tied to a specific OS/GPU/webview
// combination were invisible to us until a user happened to report one.
//
// Deliberately NOT written to its own DB table: a proper CrashReport model
// needs a schema.prisma migration, which requires direct server access this
// repo doesn't currently have (see centrio-hardening.plan.md — SSH here is
// publickey-only and no matching key exists locally). Structured console.error
// is the same interim pattern already used for the admin audit log — visible
// via `pm2 logs centrio-api | grep CRASH-REPORT` until a real table lands.
const crashReportLimiter = rateLimit({ name: 'visitors-crash-report', windowMs: 60 * 1000, max: 10 })

router.post('/crash-report', crashReportLimiter, (req, res) => {
    try {
        const { visitorId, platform, appVersion, label, detail } = req.body || {}

        // Same validation posture as /ping and /session above: reject
        // obviously malformed input, but don't fail the request over a
        // missing visitorId — a crash report is still useful without one.
        if (visitorId !== undefined && (typeof visitorId !== 'string' || visitorId.length > 64)) {
            return res.status(400).json({ error: 'Неверный visitorId' })
        }

        console.error('[CRASH-REPORT]', JSON.stringify({
            visitorId:  visitorId || null,
            platform:   typeof platform === 'string' ? platform.slice(0, 32) : null,
            appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 32) : null,
            label:      typeof label === 'string' ? label.slice(0, 100) : null,
            detail:     typeof detail === 'string' ? detail.slice(0, 4000) : null,
            ip:         req.headers['x-forwarded-for'] || req.ip || 'unknown',
            at:         new Date().toISOString()
        }))

        // Always 200 — this is fire-and-forget telemetry from the client's
        // point of view (see main/window.js), no retry logic on that side.
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/crash-report error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

module.exports = router
