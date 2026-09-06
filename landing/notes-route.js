const router = require('express').Router()
const crypto = require('crypto')
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')

// Заметки — плагин Pro/Team (см. renderer/extensions-ui.js NATIVE_EXTENSIONS
// 'notes', main.js NATIVE_EXTENSION_IDS). Реальный гейт — тумблер в
// Настройках (клиент не даёт включить на FREE), это серверная защита в
// глубину: даже прямой запрос с валидным токеном FREE-аккаунта получает 403.
//
// Два вида заметок в одной таблице через `type`: NOTE (обычный текст, поле
// body) и CHECKLIST (список покупок и т.п., поле items — JSON-массив
// [{id, text, done}]). Полный CRUD с сортировкой по position — клиент решает
// порядок сам (drag&drop), сервер просто хранит присланное число.

const MAX_TITLE_LEN = 200
const MAX_BODY_LEN = 20000
const MAX_ITEMS = 300
const MAX_ITEM_TEXT_LEN = 500
const ALLOWED_COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'purple'])

const createLimiter = rateLimit({ name: 'notes-create', windowMs: 60 * 1000, max: 30 })
const writeLimiter = rateLimit({ name: 'notes-write', windowMs: 60 * 1000, max: 120 })

function hasNotesAccess(user) {
    if (!user || user.plan === 'FREE') return false
    if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date()) return false
    return true
}

function requireNotesAccess(req, res, next) {
    if (!hasNotesAccess(req.user)) {
        return res.status(403).json({ error: 'Заметки доступны на плане PRO или TEAM', code: 'pro_required' })
    }
    next()
}

// Валидирует и обрезает тело запроса под конкретный тип заметки — одна и
// та же функция используется и при создании, и при обновлении, чтобы клиент
// не мог протащить items длиннее MAX_ITEMS или текст длиннее лимита в обход
// проверки на одном из двух путей.
function sanitizeNoteInput(body) {
    const type = body.type === 'CHECKLIST' ? 'CHECKLIST' : 'NOTE'
    const title = typeof body.title === 'string' ? body.title.slice(0, MAX_TITLE_LEN) : ''
    const pinned = body.pinned === true
    const archived = body.archived === true
    const position = Number.isFinite(body.position) ? Math.trunc(body.position) : 0
    const color = typeof body.color === 'string' && ALLOWED_COLORS.has(body.color) ? body.color : null

    if (type === 'CHECKLIST') {
        const rawItems = Array.isArray(body.items) ? body.items : []
        const items = rawItems.slice(0, MAX_ITEMS).map((it) => ({
            id: typeof it?.id === 'string' && it.id ? it.id.slice(0, 64) : crypto.randomUUID(),
            text: typeof it?.text === 'string' ? it.text.slice(0, MAX_ITEM_TEXT_LEN) : '',
            done: it?.done === true
        }))
        return { type, title, pinned, archived, position, color, items, body: null }
    }

    const noteBody = typeof body.body === 'string' ? body.body.slice(0, MAX_BODY_LEN) : ''
    return { type, title, pinned, archived, position, color, body: noteBody, items: null }
}

// GET /api/notes — список заметок пользователя, закреплённые сверху.
// По умолчанию отдаёт только неархивные; ?archived=true — только архив
// (два разных "вида" в клиенте, как в списке и в архиве Google Keep, а не
// один общий список вперемешку).
router.get('/', authMiddleware, requireNotesAccess, async (req, res) => {
    try {
        const archived = req.query.archived === 'true'
        const notes = await prisma.note.findMany({
            where: { userId: req.user.id, archived },
            orderBy: [{ pinned: 'desc' }, { position: 'asc' }, { updatedAt: 'desc' }]
        })
        res.json({ notes })
    } catch (err) {
        console.error('Notes GET / error:', err)
        res.status(500).json({ error: 'Не удалось загрузить заметки' })
    }
})

// POST /api/notes — создать заметку
router.post('/', createLimiter, authMiddleware, requireNotesAccess, async (req, res) => {
    try {
        const data = sanitizeNoteInput(req.body || {})
        const note = await prisma.note.create({ data: { ...data, userId: req.user.id } })
        res.status(201).json({ ok: true, note })
    } catch (err) {
        console.error('Notes POST / error:', err)
        res.status(500).json({ error: 'Не удалось создать заметку' })
    }
})

// PATCH /api/notes/:id — обновить (частично — присылаем только изменённые
// поля; sanitizeNoteInput всё равно ждёт полный набор, поэтому подмешиваем
// текущее значение перед валидацией, чтобы не занулить остальные поля).
router.patch('/:id', writeLimiter, authMiddleware, requireNotesAccess, async (req, res) => {
    try {
        const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.id } })
        if (!existing) return res.status(404).json({ error: 'Заметка не найдена' })

        const merged = sanitizeNoteInput({
            type: req.body?.type ?? existing.type,
            title: req.body?.title ?? existing.title,
            body: req.body?.body ?? existing.body,
            items: req.body?.items ?? existing.items,
            pinned: req.body?.pinned ?? existing.pinned,
            archived: req.body?.archived ?? existing.archived,
            position: req.body?.position ?? existing.position,
            color: req.body?.color !== undefined ? req.body.color : existing.color
        })

        const note = await prisma.note.update({ where: { id: existing.id }, data: merged })
        res.json({ ok: true, note })
    } catch (err) {
        console.error('Notes PATCH /:id error:', err)
        res.status(500).json({ error: 'Не удалось сохранить заметку' })
    }
})

// POST /api/notes/reorder — массовое обновление position после drag&drop в
// клиенте: [{id, position}, ...]. Отдельный маршрут вместо N PATCH-запросов —
// один round-trip на весь список, и writeLimiter считает это ОДНИМ вызовом,
// а не одним на каждую передвинутую карточку.
router.post('/reorder', writeLimiter, authMiddleware, requireNotesAccess, async (req, res) => {
    try {
        const entries = Array.isArray(req.body?.order) ? req.body.order : []
        if (entries.length === 0 || entries.length > MAX_ITEMS) {
            return res.status(400).json({ error: 'invalid_request' })
        }
        const ids = entries.map(e => e?.id).filter(id => typeof id === 'string')
        const owned = await prisma.note.findMany({ where: { id: { in: ids }, userId: req.user.id }, select: { id: true } })
        const ownedIds = new Set(owned.map(n => n.id))

        await prisma.$transaction(
            entries
                .filter(e => ownedIds.has(e?.id) && Number.isFinite(e?.position))
                .map(e => prisma.note.update({ where: { id: e.id }, data: { position: Math.trunc(e.position) } }))
        )
        res.json({ ok: true })
    } catch (err) {
        console.error('Notes POST /reorder error:', err)
        res.status(500).json({ error: 'Не удалось сохранить порядок' })
    }
})

// DELETE /api/notes/:id
router.delete('/:id', authMiddleware, requireNotesAccess, async (req, res) => {
    try {
        const result = await prisma.note.deleteMany({ where: { id: req.params.id, userId: req.user.id } })
        if (result.count === 0) return res.status(404).json({ error: 'Заметка не найдена' })
        res.json({ ok: true })
    } catch (err) {
        console.error('Notes DELETE /:id error:', err)
        res.status(500).json({ error: 'Не удалось удалить заметку' })
    }
})

module.exports = router
