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

        if (label === 'update-applied') {
            require('../lib/event-log').appendEvent('update-applied', { at: new Date().toISOString(), visitorId: visitorId || null, appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 32) : null })
            return res.json({ ok: true })
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

        require('../lib/event-log').appendEvent('crash-reports', {
            at:         new Date().toISOString(),
            visitorId:  visitorId || null,
            platform:   typeof platform === 'string' ? platform.slice(0, 32) : null,
            appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 32) : null,
            label:      typeof label === 'string' ? label.slice(0, 100) : null,
            detail:     typeof detail === 'string' ? detail.slice(0, 1000) : null
        })

        // Always 200 — this is fire-and-forget telemetry from the client's
        // point of view (see main/window.js), no retry logic on that side.
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/crash-report error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// POST /api/visitors/ad-touch — the website notes that this visit came from an ad, see lib/ad-touch.js
const adTouchLimiter = rateLimit({ name: 'visitors-ad-touch', windowMs: 60 * 1000, max: 20 })
router.post('/ad-touch', adTouchLimiter, async (req, res) => {
    try {
        await require('../lib/ad-touch').recordAdTouch(req)
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/ad-touch error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// POST /api/visitors/event — anonymous product events from the desktop app (names only, no content).
// Restored after the server migration (the route was lost, the app got 404 on every event).
// Written as a structured log line, same interim pattern as crash-report: no schema change needed.
// Read with: pm2 logs centrio-api | grep VISITOR-EVENT
const eventLimiter = rateLimit({ name: 'visitors-event', windowMs: 60 * 1000, max: 60 })
const EVENT_NAME_RE = /^[a-z0-9_]{3,40}$/
const EVENT_KEY_RE  = /^[a-z0-9_]{1,20}$/

router.post('/event', eventLimiter, (req, res) => {
    try {
        const { visitorId, event, props, platform, appVersion } = req.body || {}
        if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 64) {
            return res.status(400).json({ error: 'Неверный visitorId' })
        }
        if (typeof event !== 'string' || !EVENT_NAME_RE.test(event)) {
            return res.status(400).json({ error: 'Неверное событие' })
        }
        const safeProps = {}
        if (props && typeof props === 'object') {
            for (const [key, value] of Object.entries(props).slice(0, 5)) {
                if (EVENT_KEY_RE.test(key) && (typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && value.length <= 40))) {
                    safeProps[key] = value
                }
            }
        }
        require('../lib/event-log').appendEvent('visitor-events', { at: new Date().toISOString(), visitorId, event })
        console.log('[VISITOR-EVENT]', JSON.stringify({
            visitorId, event, props: safeProps,
            platform: typeof platform === 'string' ? platform.slice(0, 20) : null,
            appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 20) : null,
            at: new Date().toISOString()
        }))
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/event error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── «Удалил программу» (3.7.4, Windows) ─────────────────────────────────────
// POST /api/visitors/link — the signed-in desktop says which install (visitorId) it is, so a later uninstall lands
// in that account's profile. POST /api/visitors/uninstalled — the Windows uninstaller (build/installer.nsh) reports
// the removal. The visitorId is a random uuid only that computer knows, so it doubles as the proof; an unknown id is
// ignored (no rows are created by the uninstaller). See lib/uninstall-mark.js.
const { isVisitorId, cleanVersion } = require('../lib/uninstall-mark')
const linkLimiter = rateLimit({ name: 'visitors-link', windowMs: 60 * 1000, max: 10 })
const uninstallLimiter = rateLimit({ name: 'visitors-uninstalled', windowMs: 60 * 1000, max: 10 })

router.post('/link', linkLimiter, require('../middleware/auth'), async (req, res) => {
    try {
        const { visitorId, appVersion, platform } = req.body || {}
        if (!isVisitorId(visitorId)) return res.status(400).json({ error: 'Неверный visitorId' })
        const version = cleanVersion(appVersion)
        const plat = typeof platform === 'string' ? platform.slice(0, 20) : null
        await prisma.visitor.upsert({
            where:  { visitorId },
            update: { userId: req.user.id, lastSeenAt: new Date(), ...(version ? { appVersion: version } : {}), ...(plat ? { platform: plat } : {}) },
            create: { visitorId, userId: req.user.id, platform: plat, appVersion: version, sessions: 1 }
        })
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/link error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

router.post('/uninstalled', uninstallLimiter, async (req, res) => {
    try {
        const { visitorId, appVersion } = req.body || {}
        if (!isVisitorId(visitorId)) return res.status(400).json({ error: 'Неверный visitorId' })
        const version = cleanVersion(appVersion)
        const now = new Date()
        const updated = await prisma.visitor.updateMany({
            where: { visitorId },
            data:  { uninstalledAt: now, uninstallVersion: version }
        })
        if (updated.count > 0) {
            require('../lib/event-log').appendEvent('uninstalls', { at: now.toISOString(), visitorId, appVersion: version })
        }
        // Always ok: the uninstaller never waits for or retries this
        res.json({ ok: true })
    } catch (err) {
        console.error('/visitors/uninstalled error:', err.message)
        res.status(500).json({ error: 'Ошибка' })
    }
})

module.exports = router
