const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')

// NOTE on deploy path: deployed to /var/www/centrio-api/src/routes/chat-sites.js
// (see scripts/deploy-backend.js).
//
// Онлайн-чат для сайта клиента (2026-09-11, Pro-фича) — authenticated,
// Centrio-account side (managing the widget + reading/replying to
// conversations from the desktop app). The public, unauthenticated widget
// side lives in routes/widget.js.
//
// Один сайт на аккаунт в v1 — ChatSite.userId is @unique at the schema
// level, so a second POST just gets a clean 409 rather than a DB error.

// Mirrors isActivePro in routes/sync.js exactly (same definition, no shared
// module between route files in this repo layout — see that file's own
// comment on the convention).
function isActivePro(user) {
    if (!user || user.plan === 'FREE' || !user.plan) return false
    if (!user.planExpiresAt) return true
    return new Date(user.planExpiresAt) > new Date()
}

const MAX_NAME_LEN = 100
const MAX_DOMAIN_LEN = 253 // max valid DNS hostname length
const MAX_REPLY_LEN = 4000

const createLimiter = rateLimit({ name: 'chatsite-create', windowMs: 60 * 60 * 1000, max: 10 })
const replyLimiter = rateLimit({ name: 'chatsite-reply', windowMs: 60 * 1000, max: 60 })

function normalizeDomain(input) {
    const raw = String(input || '').trim().toLowerCase()
    if (!raw) return null
    try {
        // Accept either a bare hostname or a full URL — always store just
        // the hostname (routes/widget.js's origin check compares hostnames).
        const hostname = /^https?:\/\//.test(raw) ? new URL(raw).hostname : new URL(`https://${raw}`).hostname
        if (!hostname || hostname.length > MAX_DOMAIN_LEN) return null
        return hostname
    } catch {
        return null
    }
}

async function requireOwnSite(req, res, next) {
    try {
        const site = await prisma.chatSite.findUnique({ where: { id: req.params.siteId } })
        if (!site || site.userId !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Сайт не найден' })
        }
        req.chatSite = site
        next()
    } catch (err) {
        next(err)
    }
}

// GET /api/chat-sites — the caller's own site, or null.
router.get('/', authMiddleware, async (req, res) => {
    try {
        const site = await prisma.chatSite.findUnique({ where: { userId: req.user.id } })
        res.json({ success: true, data: site })
    } catch (err) {
        console.error('[chat-sites] get error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения сайта' })
    }
})

// POST /api/chat-sites — create the widget for this account. Pro-only —
// this is a paid feature exposing a new public surface, unlike Notes/Todos
// which are gated client-side only; the abuse/support surface here (an
// open endpoint on the internet) is worth a real server-side gate.
router.post('/', createLimiter, authMiddleware, async (req, res) => {
    try {
        if (!isActivePro(req.user)) {
            return res.status(403).json({ success: false, error: 'Онлайн-чат доступен на Pro', code: 'pro_required' })
        }

        const domain = normalizeDomain(req.body?.domain)
        if (!domain) return res.status(400).json({ success: false, error: 'Укажите корректный домен сайта' })
        const name = String(req.body?.name || domain).trim().slice(0, MAX_NAME_LEN)

        const existing = await prisma.chatSite.findUnique({ where: { userId: req.user.id } })
        if (existing) return res.status(409).json({ success: false, error: 'У вас уже подключён сайт' })

        const site = await prisma.chatSite.create({ data: { userId: req.user.id, domain, name } })
        res.status(201).json({ success: true, data: site })
    } catch (err) {
        console.error('[chat-sites] create error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка создания сайта' })
    }
})

// PATCH /api/chat-sites/:siteId — update domain/name.
router.patch('/:siteId', authMiddleware, requireOwnSite, async (req, res) => {
    try {
        const data = {}
        if (req.body?.domain !== undefined) {
            const domain = normalizeDomain(req.body.domain)
            if (!domain) return res.status(400).json({ success: false, error: 'Укажите корректный домен сайта' })
            data.domain = domain
        }
        if (req.body?.name !== undefined) {
            data.name = String(req.body.name).trim().slice(0, MAX_NAME_LEN) || req.chatSite.name
        }
        const site = await prisma.chatSite.update({ where: { id: req.chatSite.id }, data })
        res.json({ success: true, data: site })
    } catch (err) {
        console.error('[chat-sites] update error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка обновления сайта' })
    }
})

// DELETE /api/chat-sites/:siteId — removes the site and (via schema cascade)
// every conversation/message that came through it.
router.delete('/:siteId', authMiddleware, requireOwnSite, async (req, res) => {
    try {
        await prisma.chatSite.delete({ where: { id: req.chatSite.id } })
        res.json({ success: true })
    } catch (err) {
        console.error('[chat-sites] delete error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка удаления сайта' })
    }
})

// GET /api/chat-sites/:siteId/conversations — list, newest first, with a
// lightweight preview (last message + count) rather than full history.
router.get('/:siteId/conversations', authMiddleware, requireOwnSite, async (req, res) => {
    try {
        const conversations = await prisma.chatConversation.findMany({
            where: { siteId: req.chatSite.id },
            orderBy: { lastMessageAt: 'desc' },
            take: 200,
            include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } }
        })
        res.json({
            success: true,
            data: conversations.map((c) => ({
                id: c.id,
                visitorName: c.visitorName,
                visitorContact: c.visitorContact,
                status: c.status,
                lastMessageAt: c.lastMessageAt,
                createdAt: c.createdAt,
                lastMessage: c.messages[0] || null
            }))
        })
    } catch (err) {
        console.error('[chat-sites] conversations list error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения диалогов' })
    }
})

// GET /api/chat-sites/:siteId/conversations/:conversationId/messages
router.get('/:siteId/conversations/:conversationId/messages', authMiddleware, requireOwnSite, async (req, res) => {
    try {
        const conversation = await prisma.chatConversation.findFirst({
            where: { id: req.params.conversationId, siteId: req.chatSite.id }
        })
        if (!conversation) return res.status(404).json({ success: false, error: 'Диалог не найден' })

        const since = req.query.since ? new Date(String(req.query.since)) : null
        const messages = await prisma.chatMessage.findMany({
            where: {
                conversationId: conversation.id,
                ...(since && !isNaN(since.getTime()) ? { createdAt: { gt: since } } : {})
            },
            orderBy: { createdAt: 'asc' }
        })
        res.json({ success: true, data: { conversation, messages } })
    } catch (err) {
        console.error('[chat-sites] messages get error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения переписки' })
    }
})

// POST /api/chat-sites/:siteId/conversations/:conversationId/messages —
// operator reply.
router.post('/:siteId/conversations/:conversationId/messages', replyLimiter, authMiddleware, requireOwnSite, async (req, res) => {
    try {
        const conversation = await prisma.chatConversation.findFirst({
            where: { id: req.params.conversationId, siteId: req.chatSite.id }
        })
        if (!conversation) return res.status(404).json({ success: false, error: 'Диалог не найден' })

        const body = String(req.body?.body || '').trim().slice(0, MAX_REPLY_LEN)
        if (!body) return res.status(400).json({ success: false, error: 'Пустое сообщение' })

        const message = await prisma.chatMessage.create({ data: { conversationId: conversation.id, fromVisitor: false, body } })
        await prisma.chatConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })

        res.status(201).json({ success: true, data: message })
    } catch (err) {
        console.error('[chat-sites] reply error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка отправки ответа' })
    }
})

// PATCH /api/chat-sites/:siteId/conversations/:conversationId — close/reopen.
router.patch('/:siteId/conversations/:conversationId', authMiddleware, requireOwnSite, async (req, res) => {
    try {
        const status = req.body?.status === 'CLOSED' ? 'CLOSED' : 'OPEN'
        const conversation = await prisma.chatConversation.updateMany({
            where: { id: req.params.conversationId, siteId: req.chatSite.id },
            data: { status }
        })
        if (conversation.count === 0) return res.status(404).json({ success: false, error: 'Диалог не найден' })
        res.json({ success: true })
    } catch (err) {
        console.error('[chat-sites] status update error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка обновления статуса' })
    }
})

module.exports = router
