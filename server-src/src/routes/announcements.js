'use strict'
// What the desktop app asks: which windows are for me, and what I did with one. Open to people without an account,
// so the token is optional: with a good one the person is a user, without it (or with a bad one) a guest.
const router = require('express').Router()
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
const { isBetaTester } = require('../lib/beta-testers')
const store = require('../lib/announcements')
const { EVENTS } = require('../lib/announcements-logic')

const readLimiter = rateLimit({ name: 'announcements-read', windowMs: 60 * 1000, max: 30 })
const eventLimiter = rateLimit({ name: 'announcements-event', windowMs: 60 * 1000, max: 30 })

async function whoIs(req) {
    const header = req.headers.authorization || ''
    if (header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] })
            const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, email: true, plan: true, planExpiresAt: true, isActive: true } })
            if (user && user.isActive) {
                const expired = user.planExpiresAt && new Date(user.planExpiresAt).getTime() < Date.now()
                return { kind: 'user', id: user.id, email: user.email, plan: expired ? 'FREE' : user.plan, tester: isBetaTester(user.id) }
            }
        } catch { /* a bad or old token: treated as a guest */ }
    }
    const visitorId = String(req.query.visitorId || (req.body && req.body.visitorId) || '').slice(0, 64)
    return { kind: 'guest', id: visitorId || req.ip }
}

router.get('/active', readLimiter, async (req, res) => {
    try {
        const who = await whoIs(req)
        res.json({ ok: true, items: store.activeFor(who) })
    } catch (err) {
        console.error('[announcements] active:', err.message)
        res.status(500).json({ error: 'Ошибка сервера' })
    }
})

router.post('/:id/event', eventLimiter, async (req, res) => {
    try {
        const event = String((req.body && req.body.event) || '')
        if (!EVENTS.includes(event)) return res.status(400).json({ error: 'Неверное событие' })
        if (!store.exists(req.params.id)) return res.status(404).json({ error: 'Не найдено' })
        const who = await whoIs(req)
        store.logEvent(req.params.id, event, `${who.kind}:${who.id}`)
        res.json({ ok: true })
    } catch (err) {
        console.error('[announcements] event:', err.message)
        res.status(500).json({ error: 'Ошибка сервера' })
    }
})

module.exports = router
