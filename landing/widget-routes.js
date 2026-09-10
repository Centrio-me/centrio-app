const router = require('express').Router()
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')

// NOTE on deploy path: deployed to /var/www/centrio-api/src/routes/widget.js
// (see scripts/deploy-backend.js) — same flat-checkout convention as every
// other landing/*.js route file.
//
// PUBLIC, UNAUTHENTICATED surface (2026-09-11, "виджет онлайн-чата" — Pro
// feature, see landing/chat-sites-routes.js for the authenticated,
// Centrio-account side). Anyone's browser can call this once they have a
// widgetToken — the token itself, plus the Origin/domain check below, is
// the only gate. Every write here must be rate-limited and validated
// defensively; nothing here can trust anything the caller sends beyond
// what's checked explicitly.

const MAX_NAME_LEN = 100
const MAX_CONTACT_LEN = 200
const MAX_BODY_LEN = 4000
const MAX_MESSAGES_PAGE = 100

// Generous but bounded — a real visitor sends a handful of messages per
// minute at most; this just keeps a compromised/scripted client from
// hammering the DB.
const startLimiter = rateLimit({ name: 'widget-start', windowMs: 60 * 1000, max: 10 })
const sendLimiter = rateLimit({
    name: 'widget-send',
    windowMs: 60 * 1000,
    max: 20,
    // Keyed by conversationId (falls back to IP if missing/malformed) so one
    // spammy conversation can't exhaust another visitor's IP-based quota,
    // and vice versa.
    keyGenerator: (req) => req.body?.conversationId || req.ip || 'unknown'
})
const pollLimiter = rateLimit({ name: 'widget-poll', windowMs: 60 * 1000, max: 120, keyGenerator: (req) => req.params.conversationId || req.ip || 'unknown' })

function siteHostnameMatches(site, req) {
    // The widget script always sends its own page's origin explicitly (see
    // widget.js below) — Origin/Referer headers are a second, harder-to-spoof
    // check but browsers don't always send Referer (privacy settings), so
    // this is belt-and-suspenders, not the only check.
    const candidates = [req.headers.origin, req.headers.referer, req.body?.pageOrigin].filter(Boolean)
    if (candidates.length === 0) return true // no signal to check against — don't block a legitimate first-party request over a missing header

    let expected
    try { expected = new URL(/^https?:\/\//.test(site.domain) ? site.domain : `https://${site.domain}`).hostname } catch { return true }

    return candidates.some((c) => {
        try {
            const h = new URL(c).hostname
            return h === expected || h.endsWith(`.${expected}`)
        } catch { return false }
    })
}

async function loadSiteByToken(widgetToken) {
    if (!widgetToken || typeof widgetToken !== 'string') return null
    return prisma.chatSite.findUnique({ where: { widgetToken } })
}

// POST /api/widget/:widgetToken/start — first message of a visit. Reuses an
// existing OPEN conversation for the same visitorId (the widget persists
// this in localStorage) instead of creating a new one on every page load —
// a visitor browsing multiple pages on the same site is one conversation.
router.post('/:widgetToken/start', startLimiter, async (req, res) => {
    try {
        const site = await loadSiteByToken(req.params.widgetToken)
        if (!site) return res.status(404).json({ success: false, error: 'Widget not found' })
        if (!siteHostnameMatches(site, req)) return res.status(403).json({ success: false, error: 'Origin mismatch' })

        const visitorId = String(req.body?.visitorId || '').slice(0, 100) || require('crypto').randomUUID()
        const visitorName = req.body?.visitorName ? String(req.body.visitorName).trim().slice(0, MAX_NAME_LEN) : null
        const visitorContact = req.body?.visitorContact ? String(req.body.visitorContact).trim().slice(0, MAX_CONTACT_LEN) : null
        const message = String(req.body?.message || '').trim().slice(0, MAX_BODY_LEN)
        if (!message) return res.status(400).json({ success: false, error: 'Введите сообщение' })

        let conversation = await prisma.chatConversation.findFirst({
            where: { siteId: site.id, visitorId, status: 'OPEN' },
            orderBy: { createdAt: 'desc' }
        })

        if (!conversation) {
            conversation = await prisma.chatConversation.create({
                data: { siteId: site.id, visitorId, visitorName, visitorContact }
            })
        } else if (visitorName || visitorContact) {
            // A returning-same-session visitor who fills in name/contact on
            // a later message — keep the conversation's contact info fresh.
            conversation = await prisma.chatConversation.update({
                where: { id: conversation.id },
                data: { visitorName: visitorName || conversation.visitorName, visitorContact: visitorContact || conversation.visitorContact }
            })
        }

        await prisma.chatMessage.create({ data: { conversationId: conversation.id, fromVisitor: true, body: message } })
        await prisma.chatConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })

        res.json({ success: true, data: { conversationId: conversation.id, visitorId } })
    } catch (err) {
        console.error('[widget] start error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка отправки сообщения' })
    }
})

// POST /api/widget/:widgetToken/messages — a follow-up visitor message on an
// already-started conversation.
router.post('/:widgetToken/messages', sendLimiter, async (req, res) => {
    try {
        const site = await loadSiteByToken(req.params.widgetToken)
        if (!site) return res.status(404).json({ success: false, error: 'Widget not found' })
        if (!siteHostnameMatches(site, req)) return res.status(403).json({ success: false, error: 'Origin mismatch' })

        const conversationId = String(req.body?.conversationId || '')
        const visitorId = String(req.body?.visitorId || '')
        const body = String(req.body?.body || '').trim().slice(0, MAX_BODY_LEN)
        if (!body) return res.status(400).json({ success: false, error: 'Пустое сообщение' })

        // visitorId must match the conversation it claims to belong to —
        // without this check, knowing/guessing a conversationId would let
        // anyone post into someone else's chat.
        const conversation = await prisma.chatConversation.findFirst({ where: { id: conversationId, siteId: site.id, visitorId } })
        if (!conversation) return res.status(404).json({ success: false, error: 'Диалог не найден' })

        await prisma.chatMessage.create({ data: { conversationId: conversation.id, fromVisitor: true, body } })
        await prisma.chatConversation.update({
            where: { id: conversation.id },
            // A visitor replying to a CLOSED conversation reopens it — same
            // "user reply resurfaces the thread" convention as tickets.js.
            data: { lastMessageAt: new Date(), status: 'OPEN' }
        })

        res.json({ success: true })
    } catch (err) {
        console.error('[widget] send error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка отправки' })
    }
})

// GET /api/widget/:widgetToken/conversations/:conversationId/messages — the
// widget polls this every few seconds for the operator's replies.
router.get('/:widgetToken/conversations/:conversationId/messages', pollLimiter, async (req, res) => {
    try {
        const site = await loadSiteByToken(req.params.widgetToken)
        if (!site) return res.status(404).json({ success: false, error: 'Widget not found' })

        const visitorId = String(req.query.visitorId || '')
        const conversation = await prisma.chatConversation.findFirst({
            where: { id: req.params.conversationId, siteId: site.id, visitorId }
        })
        if (!conversation) return res.status(404).json({ success: false, error: 'Диалог не найден' })

        const since = req.query.since ? new Date(String(req.query.since)) : null
        const messages = await prisma.chatMessage.findMany({
            where: {
                conversationId: conversation.id,
                ...(since && !isNaN(since.getTime()) ? { createdAt: { gt: since } } : {})
            },
            orderBy: { createdAt: 'asc' },
            take: MAX_MESSAGES_PAGE
        })

        res.json({ success: true, data: messages })
    } catch (err) {
        console.error('[widget] poll error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения сообщений' })
    }
})

module.exports = router
