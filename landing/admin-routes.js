const router = require('express').Router()
const axios   = require('axios')
const { v4: uuidv4 } = require('uuid')
const prisma  = require('../utils/prisma')
const { getQrDataUrl, verifyTotp, checkSession } = require('../utils/admin-otp')
const { sendEmail, sendRefundConfirmationEmail } = require('../lib/email')

// YooKassa — тот же способ авторизации, что и в payments-server.js/org-routes.js
// (см. их шапки). Единственный провайдер с документированным API возврата
// среди трёх интегрированных — NOWPayments/FRIDE возвраты делаются вручную
// через кабинет провайдера.
const YK_SHOP   = process.env.YUKASSA_SHOP_ID
const YK_SECRET = process.env.YUKASSA_SECRET_KEY
const YK_API    = 'https://api.yookassa.ru/v3'
function ykAuth() { return { username: YK_SHOP, password: YK_SECRET } }

// ── Открытые маршруты (без auth) ──────────────────────────────────────────────

// GET /api/admin/setup-qr  — QR-код для первичной настройки
// Защищён отдельным ключом SETUP_KEY из .env — знаете только вы
router.get('/setup-qr', async (req, res) => {
    // Отключено (security fix): первичная настройка TOTP админки уже
    // завершена и активно используется (POST /verify-totp работает и
    // требует валидный TOTP-код уже сейчас). Этот маршрут ранее отдавал
    // сырой TOTP_SECRET в открытом JSON тому, кто знает SETUP_KEY, а
    // сравнение SETUP_KEY было не timing-safe (`!==`). Маршрут оставлен
    // (не удалён), чтобы не сломать ничего, что могло на него ссылаться,
    // но теперь безусловно возвращает 410.
    return res.status(410).json({ error: 'Endpoint disabled' })
})

// POST /api/admin/verify-totp  — проверить код, получить сессию
// Rate limiting/lockout по IP реализован в admin-otp.js (verifyTotp) —
// защита от брутфорса 6-значного TOTP-кода.
router.post('/verify-totp', (req, res) => {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Код не передан' })
    const clientKey = req.ip || req.headers['x-forwarded-for'] || 'unknown'
    const result = verifyTotp(code, clientKey)
    if (!result.ok) {
        const status = result.locked ? 429 : 401
        if (result.locked && result.retryAfterSec) res.set('Retry-After', String(result.retryAfterSec))
        return res.status(status).json({ error: result.error })
    }
    res.json({ ok: true, token: result.token })
})

// ── Middleware: сессионный токен ──────────────────────────────────────────────
function adminAuth(req, res, next) {
    const token = req.headers['x-admin-token']
    if (!checkSession(token)) {
        return res.status(403).json({ error: 'Сессия истекла — войдите заново', code: 'SESSION_EXPIRED' })
    }
    next()
}

router.use(adminAuth)

// ── Best-effort audit log ──────────────────────────────────────────
// A real, queryable DB-backed audit log needs a new Prisma model
// (AdminAuditLog) added to schema.prisma on the server — that requires
// direct server access this session didn't have (SSH password auth is
// disabled; only key-based access works, see centrio-hardening.plan.md).
// Structured console logging is the safe interim step: every mutating
// admin action below is captured in pm2 logs with actor IP + target,
// queryable via `pm2 logs centrio-api | grep AUDIT` until the real table
// lands. There's only a single shared TOTP admin identity right now (no
// per-admin accounts), so there's no "who" beyond "the admin" — IP is the
// closest available signal.
function audit(req, action, target) {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown'
    console.log(`[AUDIT] action=${action} target=${JSON.stringify(target)} ip=${ip} at=${new Date().toISOString()}`)
}

// ── Определить метод входа ────────────────────────────────────────────────────
function detectProvider(user) {
    if (user.googleId)     return 'Google'
    if (user.yandexId)     return 'Яндекс'
    if (user.githubId)     return 'GitHub'
    if (user.telegramId)   return 'Telegram'
    if (user.vkId)         return 'VK'
    if (user.mailId)       return 'Mail.ru'
    if (user.passwordHash) return 'Email'
    return '—'
}

function isOnline(lastSeenAt) {
    if (!lastSeenAt) return false
    return (Date.now() - new Date(lastSeenAt).getTime()) < 5 * 60 * 1000
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
const USER_SELECT = {
    id: true, email: true, name: true, avatar: true,
    plan: true, planExpiresAt: true, isActive: true, isAdmin: true,
    lastSeenAt: true, createdAt: true, autoRenew: true,
    googleId: true, yandexId: true, githubId: true,
    telegramId: true, vkId: true, mailId: true, passwordHash: true,
    _count: { select: { messengers: true, folders: true, sessions: true } }
}

function mapUserRow(u) {
    return {
        id: u.id, email: u.email, name: u.name, avatar: u.avatar,
        plan: u.plan, planExpiresAt: u.planExpiresAt,
        isActive: u.isActive, isAdmin: u.isAdmin,
        lastSeenAt: u.lastSeenAt, createdAt: u.createdAt,
        autoRenew:  u.autoRenew || false,
        hasPassword: !!u.passwordHash,
        online:     isOnline(u.lastSeenAt),
        provider:   detectProvider(u),
        messengers: u._count.messengers,
        folders:    u._count.folders,
        sessions:   u._count.sessions
    }
}

// Пустая строка/отсутствие параметра → нет фильтра; иначе — валидное неотрицательное целое.
function parseCountParam(value) {
    if (value === undefined || value === null || value === '') return null
    const n = parseInt(value, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
}

router.get('/users', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const search = (req.query.search || '').trim()
        const planFilter = (req.query.plan || '').trim().toUpperCase()

        const where = {
            ...(search ? { OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { name:  { contains: search, mode: 'insensitive' } }
              ]} : {}),
            // Валидируем против конкретного списка планов — не пропускаем
            // произвольную строку в Prisma-фильтр напрямую из query.
            ...(['FREE', 'PRO', 'TEAM'].includes(planFilter) ? { plan: planFilter } : {})
        }

        const minMessengers = parseCountParam(req.query.minMessengers)
        const maxMessengers = parseCountParam(req.query.maxMessengers)
        const hasMessengerFilter = minMessengers !== null || maxMessengers !== null

        // Сортировка — белый список, как и с planFilter выше: строка из
        // query никогда не идёт в Prisma orderBy напрямую.
        const SORT_OPTIONS = {
            createdAt_desc:   { createdAt: 'desc' },
            createdAt_asc:    { createdAt: 'asc' },
            lastSeenAt_desc:  { lastSeenAt: 'desc' },
            lastSeenAt_asc:   { lastSeenAt: 'asc' }
        }
        const sortKey = SORT_OPTIONS[req.query.sort] ? req.query.sort : 'createdAt_desc'
        const orderBy = SORT_OPTIONS[sortKey]

        let result, total

        if (hasMessengerFilter) {
            // Prisma не поддерживает фильтрацию `where` по числу связанных
            // записей (_count) — только existence-фильтры (some/none/every).
            // Без раздутия схемы сырым SQL (schema.prisma живёт только на
            // сервере, вслепую по неизвестным именам таблиц не пишем) считаем
            // это в два шага: лёгкий запрос id+_count по всем подходящим под
            // остальные фильтры пользователям → фильтруем диапазон в JS →
            // тянем полную выборку только для id текущей страницы.
            const allMatching = await prisma.user.findMany({
                where,
                orderBy,
                select: { id: true, _count: { select: { messengers: true } } }
            })

            const filteredIds = allMatching
                .filter(u => {
                    const c = u._count.messengers
                    if (minMessengers !== null && c < minMessengers) return false
                    if (maxMessengers !== null && c > maxMessengers) return false
                    return true
                })
                .map(u => u.id)

            total = filteredIds.length
            const pageIds = filteredIds.slice((page - 1) * limit, (page - 1) * limit + limit)

            const users = await prisma.user.findMany({
                where: { id: { in: pageIds } },
                select: USER_SELECT
            })

            // `id: { in }` не сохраняет порядок — восстанавливаем порядок
            // страницы (по выбранной сортировке), заданный в filteredIds выше.
            const byId = new Map(users.map(u => [u.id, u]))
            result = pageIds.map(id => byId.get(id)).filter(Boolean).map(mapUserRow)
        } else {
            const skip = (page - 1) * limit
            const [users, count] = await Promise.all([
                prisma.user.findMany({ where, skip, take: limit, orderBy, select: USER_SELECT }),
                prisma.user.count({ where })
            ])
            result = users.map(mapUserRow)
            total = count
        }

        res.json({ users: result, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin /users error:', err)
        res.status(500).json({ error: 'Ошибка получения пользователей' })
    }
})

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, email: true, name: true, avatar: true,
                plan: true, planExpiresAt: true, isActive: true, isAdmin: true,
                lastSeenAt: true, createdAt: true,
                googleId: true, yandexId: true, githubId: true,
                telegramId: true, vkId: true, mailId: true, passwordHash: true,
                _count: { select: { messengers: true, folders: true, sessions: true } }
            }
        })
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
        // Security fix: never send the raw bcrypt hash to the client —
        // strip it from the object and expose only a boolean flag.
        const { passwordHash, _count, ...safeUser } = user
        res.json({
            ...safeUser,
            hasPassword: !!passwordHash,
            online:     isOnline(user.lastSeenAt),
            provider:   detectProvider(user),
            messengers: _count.messengers,
            folders:    _count.folders,
            sessions:   _count.sessions
        })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
router.patch('/users/:id/plan', async (req, res) => {
    try {
        const { plan, planExpiresAt } = req.body
        if (!['FREE', 'PRO', 'TEAM'].includes(plan)) {
            return res.status(400).json({ error: 'Неверный план. Допустимо: FREE, PRO, TEAM' })
        }
        const data = { plan }
        if (plan === 'FREE') {
            data.planExpiresAt = null
        } else if (planExpiresAt) {
            data.planExpiresAt = new Date(planExpiresAt)
        } else {
            const exp = new Date()
            exp.setFullYear(exp.getFullYear() + 1)
            data.planExpiresAt = exp
        }
        const user = await prisma.user.update({
            where: { id: req.params.id }, data,
            select: { id: true, email: true, plan: true, planExpiresAt: true }
        })
        audit(req, 'user.plan.update', { userId: req.params.id, plan, planExpiresAt: data.planExpiresAt })
        res.json({ ok: true, user })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' })
        res.status(500).json({ error: 'Ошибка обновления плана' })
    }
})

// ── PATCH /api/admin/users/:id/active ────────────────────────────────────────
router.patch('/users/:id/active', async (req, res) => {
    try {
        const { isActive } = req.body
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data:  { isActive: Boolean(isActive) },
            select: { id: true, email: true, isActive: true }
        })
        audit(req, 'user.active.update', { userId: req.params.id, isActive: Boolean(isActive) })
        res.json({ ok: true, user })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' })
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
// admin-server.tsx already calls this (fetch(`${API}/api/admin/users/${u.id}`,
// { method: 'DELETE', ... })) — the route was missing here, so every click on
// "Удалить пользователя" in the admin panel 404'd.
router.delete('/users/:id', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } })
        audit(req, 'user.delete', { userId: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' })
        // FK constraint: user still owns messengers/folders/sessions/payments
        // that aren't set to cascade-delete at the schema level.
        if (err.code === 'P2003') {
            return res.status(409).json({ error: 'Нельзя удалить: у пользователя есть связанные данные (мессенджеры, платежи, сессии)' })
        }
        console.error('Admin DELETE /users/:id error:', err)
        res.status(500).json({ error: 'Ошибка удаления пользователя' })
    }
})

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [total, free, pro, team, onlineNow] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { plan: 'FREE' } }),
            prisma.user.count({ where: { plan: 'PRO'  } }),
            prisma.user.count({ where: { plan: 'TEAM' } }),
            prisma.user.count({
                where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } }
            })
        ])
        res.json({ total, free, pro, team, onlineNow })
    } catch (err) {
        res.status(500).json({ error: 'Ошибка статистики' })
    }
})

// ── GET /api/admin/visitors ───────────────────────────────────────────────────
router.get('/visitors', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const search = (req.query.search || '').trim()

        const where = search
            ? { OR: [
                { visitorId:  { contains: search, mode: 'insensitive' } },
                { platform:   { contains: search, mode: 'insensitive' } },
                { appVersion: { contains: search, mode: 'insensitive' } }
              ]}
            : {}

        const onlineThreshold = new Date(Date.now() - 15 * 60 * 1000)

        const [visitors, total, onlineNow] = await Promise.all([
            prisma.visitor.findMany({
                where, skip, take: limit,
                orderBy: { lastSeenAt: 'desc' }
            }),
            prisma.visitor.count({ where }),
            prisma.visitor.count({ where: { lastSeenAt: { gte: onlineThreshold } } })
        ])

        const result = visitors.map(v => ({
            ...v,
            online: v.lastSeenAt && new Date(v.lastSeenAt) >= onlineThreshold
        }))

        res.json({ visitors: result, total, page, pages: Math.ceil(total / limit), onlineNow })
    } catch (err) {
        console.error('Admin /visitors error:', err)
        res.status(500).json({ error: 'Ошибка получения посетителей' })
    }
})

// ── DELETE /api/admin/visitors/:id ───────────────────────────────────────────
router.delete('/visitors/:id', async (req, res) => {
    try {
        await prisma.visitor.delete({ where: { id: req.params.id } })
        audit(req, 'visitor.delete', { visitorId: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найден' })
        res.status(500).json({ error: 'Ошибка' })
    }
})

// ── Admin push notifications ─────────────────────────────────────────────────
// Restored from the live server during the Phase 1-3 deploy reconciliation —
// this repo's copy of admin-routes.js had never included these routes (they
// were added directly on the server at some point outside this repo's
// history), so a blind deploy of the hardened file would have silently
// 404'd the admin panel's notifications tab. Kept as-is functionally, only
// adding the same audit() logging already used for the other mutating routes
// above.
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await prisma.appNotification.findMany({
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { reads: true } } }
        })
        res.json({ notifications })
    } catch (err) {
        console.error('Admin GET /notifications error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/notifications', async (req, res) => {
    try {
        const { title, body, imageUrl, actionLabel, actionUrl } = req.body
        if (!title || !body) {
            return res.status(400).json({ error: 'title and body required' })
        }
        const notif = await prisma.appNotification.create({
            data: {
                title:       String(title).slice(0, 255),
                body:        String(body).slice(0, 2000),
                imageUrl:    imageUrl    ? String(imageUrl).slice(0, 500)    : null,
                actionLabel: actionLabel ? String(actionLabel).slice(0, 100) : null,
                actionUrl:   actionUrl   ? String(actionUrl).slice(0, 500)   : null,
            }
        })
        audit(req, 'notification.create', { id: notif.id, title: notif.title })
        console.log('[Admin] Notification created:', notif.id, notif.title)
        res.json({ ok: true, notification: notif })
    } catch (err) {
        console.error('Admin POST /notifications error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/notifications/:id', async (req, res) => {
    try {
        await prisma.appNotification.delete({ where: { id: req.params.id } })
        audit(req, 'notification.delete', { id: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' })
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Promo codes ────────────────────────────────────────────────────────
// Admin-only creation surface for the codes users redeem via
// POST /api/payments/promo/redeem (routes/payments.js). Redemption itself
// (validation, one-per-user-per-code enforcement, granting months of Pro)
// lives there — this file only manages the code catalogue.
router.get('/promo-codes', async (req, res) => {
    try {
        const codes = await prisma.promoCode.findMany({
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { redemptions: true } } }
        })
        res.json({ codes })
    } catch (err) {
        console.error('Admin GET /promo-codes error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/promo-codes', async (req, res) => {
    try {
        const { code, months, days, maxUses, expiresAt } = req.body
        const normalized = String(code || '').trim().toUpperCase().slice(0, 40)
        if (!normalized) return res.status(400).json({ error: 'code обязателен' })

        // A code grants either whole months or a fixed number of days — never
        // both — so redeem logic (payments-server.js) can branch on which one
        // is set without ambiguity.
        const hasMonths = months != null && months !== ''
        const hasDays = days != null && days !== ''
        if (hasMonths === hasDays) {
            return res.status(400).json({ error: 'Укажите либо months, либо days (ровно один из параметров)' })
        }
        let monthsNum = null, daysNum = null
        if (hasMonths) {
            monthsNum = parseInt(months, 10)
            if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 24) {
                return res.status(400).json({ error: 'months должен быть целым числом от 1 до 24' })
            }
        } else {
            daysNum = parseInt(days, 10)
            if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 366) {
                return res.status(400).json({ error: 'days должен быть целым числом от 1 до 366' })
            }
        }
        const maxUsesNum = maxUses != null && maxUses !== '' ? parseInt(maxUses, 10) : null
        if (maxUsesNum != null && (!Number.isInteger(maxUsesNum) || maxUsesNum < 1)) {
            return res.status(400).json({ error: 'maxUses должен быть положительным целым числом или пустым (безлимит)' })
        }
        const promo = await prisma.promoCode.create({
            data: {
                code: normalized,
                months: monthsNum,
                days: daysNum,
                maxUses: maxUsesNum,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            }
        })
        audit(req, 'promo.create', { id: promo.id, code: promo.code, months: promo.months, days: promo.days })
        res.json({ ok: true, code: promo })
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Такой код уже существует' })
        console.error('Admin POST /promo-codes error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.patch('/promo-codes/:id/active', async (req, res) => {
    try {
        const promo = await prisma.promoCode.update({
            where: { id: req.params.id },
            data: { isActive: Boolean(req.body.isActive) }
        })
        audit(req, 'promo.active.update', { id: promo.id, isActive: promo.isActive })
        res.json({ ok: true, code: promo })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найден' })
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/promo-codes/:id', async (req, res) => {
    try {
        await prisma.promoCode.delete({ where: { id: req.params.id } })
        audit(req, 'promo.delete', { id: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найден' })
        // FK constraint: code already has redemptions — deactivate instead of deleting
        if (err.code === 'P2003') return res.status(409).json({ error: 'Нельзя удалить код с активациями — деактивируйте вместо удаления' })
        res.status(500).json({ error: 'Server error' })
    }
})

// GET /api/admin/promo-codes/:id/redemptions — кто именно погасил код (и
// получил временный/полный PRO), а не просто число из usesCount.
router.get('/promo-codes/:id/redemptions', async (req, res) => {
    try {
        const redemptions = await prisma.promoRedemption.findMany({
            where: { promoCodeId: req.params.id },
            include: { user: { select: { id: true, email: true, name: true, avatar: true } } },
            orderBy: { createdAt: 'desc' }
        })
        res.json({
            redemptions: redemptions.map(r => ({
                userId: r.userId,
                email: r.user?.email ?? null,
                name: r.user?.name ?? null,
                avatar: r.user?.avatar ?? null,
                createdAt: r.createdAt
            }))
        })
    } catch (err) {
        console.error('Admin GET /promo-codes/:id/redemptions error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// GET /api/admin/users/:id/payments — also restored from live (see note above).
// Not a duplicate of anything else in this file.
router.get('/users/:id/payments', async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({
            where: { userId: req.params.id },
            orderBy: { createdAt: 'desc' },
            select: { id: true, amount: true, currency: true, status: true, plan: true, months: true, createdAt: true }
        })
        res.json({ payments })
    } catch (err) {
        res.status(500).json({ error: 'Server error' })
    }
})

// NOTE: the live server also has a second, older, unaudited
// `router.delete('/users/:id', ...)` defined after this point. It's dead
// code — Express dispatches to the first matching route, and this file
// already defines '/users/:id' DELETE above (line ~211) with audit logging
// and FK-constraint handling — so it's intentionally not carried over here.

// ── Support tickets ───────────────────────────────────────────────────
// User-facing create/list/reply endpoints live in routes/tickets.js. This
// block is the admin queue: list all tickets (optionally filtered by
// status), read a full thread, reply (flips status -> ANSWERED and emails
// the user), and an explicit close/reopen toggle.
const { sendTicketReplyEmail } = require('../lib/email')
const { createTicketTopic, postTicketMessage, closeTicketTopic, reopenTicketTopic, postToNewsChannel, escapeHtml } = require('../lib/telegram-bot')
const { ARTICLES, articleUrl, suggestedPostText } = require('../lib/blog-articles')

router.get('/tickets', async (req, res) => {
    try {
        const { status } = req.query
        const where = status ? { status: String(status).toUpperCase() } : {}
        const tickets = await prisma.ticket.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true, avatar: true } },
                _count: { select: { messages: true } }
            },
            orderBy: { updatedAt: 'desc' }
        })
        res.json({ tickets })
    } catch (err) {
        console.error('Admin GET /tickets error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/tickets/:id', async (req, res) => {
    try {
        const ticket = await prisma.ticket.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: { id: true, email: true, name: true, avatar: true } },
                messages: { orderBy: { createdAt: 'asc' } }
            }
        })
        if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' })
        res.json(ticket)
    } catch (err) {
        console.error('Admin GET /tickets/:id error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/tickets/:id/messages', async (req, res) => {
    try {
        const { body } = req.body
        if (!body || !String(body).trim()) return res.status(400).json({ error: 'Введите сообщение' })

        const ticket = await prisma.ticket.findUnique({
            where: { id: req.params.id },
            include: { user: { select: { id: true, email: true, name: true } } }
        })
        if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' })

        const [message] = await prisma.$transaction([
            prisma.ticketMessage.create({ data: { ticketId: ticket.id, isAdmin: true, body: String(body).trim() } }),
            prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'ANSWERED' } })
        ])

        audit(req, 'ticket.reply', { id: ticket.id, userId: ticket.userId })

        // Fire-and-forget: sendEmail() itself fails soft (no RESEND_API_KEY
        // = no-op), so this never blocks the admin reply on email delivery.
        sendTicketReplyEmail(ticket.user, ticket, message.body)
            .catch(e => console.error('[tickets] reply email failed:', e.message))

        res.status(201).json({ ok: true, message })

        // Fire-and-forget Telegram mirror (runs after the response is sent,
        // matching the other three sync sites in tickets-server.js/here).
        // Replies made here (the web dashboard) get echoed into the topic so
        // the thread stays complete no matter which side the admin answers
        // from. Replies that originate the other way (admin typing directly
        // in Telegram) come in via the webhook, which writes straight to the
        // DB and does NOT call back into postTicketMessage() — that
        // asymmetry is what prevents an infinite echo loop between the two
        // channels.
        ;(async () => {
            try {
                let threadId = ticket.telegramTopicId
                if (!threadId) {
                    // Ticket predates the Telegram integration (or topic
                    // creation failed originally) — create one lazily.
                    threadId = await createTicketTopic(ticket)
                    if (threadId) await prisma.ticket.update({ where: { id: ticket.id }, data: { telegramTopicId: threadId } })
                }
                if (!threadId) return
                await postTicketMessage(threadId, `<b>Ответ администратора (сайт)</b>\n\n${escapeHtml(message.body)}`)
            } catch (e) { console.error('[tickets] telegram sync (admin reply) failed:', e.message) }
        })()
    } catch (err) {
        console.error('Admin POST /tickets/:id/messages error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.patch('/tickets/:id/status', async (req, res) => {
    try {
        const { status } = req.body
        if (!['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) {
            return res.status(400).json({ error: 'Некорректный статус' })
        }
        const ticket = await prisma.ticket.update({ where: { id: req.params.id }, data: { status } })
        audit(req, 'ticket.status.update', { id: ticket.id, status })
        res.json({ ok: true, ticket })

        if (ticket.telegramTopicId) {
            const syncTopic = status === 'CLOSED' ? closeTicketTopic : reopenTicketTopic
            // OPEN/ANSWERED both just need the topic open (reopen is a no-op
            // on an already-open topic per the Bot API).
            syncTopic(ticket.telegramTopicId).catch(e => console.error('[tickets] telegram topic sync failed:', e.message))
        }
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найден' })
        console.error('Admin PATCH /tickets/:id/status error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Новостной канал (@centrioapp, публичный broadcast-канал в Telegram) ────
// Отдельно от tickets-топиков: postToNewsChannel шлёт в NEWS_CHAT_ID
// (публичный канал), а не в приватную форум-супергруппу поддержки — см.
// шапку lib/telegram-bot.js. NewsPost — история уже опубликованного, чтобы
// (а) не предлагать в кандидатах статью, которая уже была в канале, и
// (б) не дать дважды опубликовать одну и ту же статью (уникальный slug).
router.get('/news/candidates', async (req, res) => {
    try {
        const posted = await prisma.newsPost.findMany({ where: { slug: { not: null } }, select: { slug: true } })
        const postedSlugs = new Set(posted.map(p => p.slug))
        const candidates = ARTICLES
            .filter(a => !postedSlugs.has(a.slug))
            .map(a => ({ slug: a.slug, title: a.title, url: articleUrl(a.slug), suggestedText: suggestedPostText(a) }))
        res.json({ candidates })
    } catch (err) {
        console.error('Admin GET /news/candidates error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/news', async (req, res) => {
    try {
        const posts = await prisma.newsPost.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
        res.json({ posts })
    } catch (err) {
        console.error('Admin GET /news error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/news', async (req, res) => {
    try {
        const { text, slug, disablePreview } = req.body || {}
        if (!text || !String(text).trim()) {
            return res.status(400).json({ error: 'Укажите текст поста' })
        }
        const trimmed = String(text).trim()

        // Telegram's sendMessage hard limit is 4096 chars; lib/telegram-bot.js
        // clip()s to 3900 before sending so the call itself never fails on
        // length — but silently truncating a public post is the wrong
        // failure mode (the admin would have no idea it happened). Reject
        // up front instead so they shorten it themselves.
        if (trimmed.length > 3900) {
            return res.status(400).json({ error: `Текст слишком длинный (${trimmed.length} символов, максимум 3900) — сократите пост` })
        }

        const title = (slug && ARTICLES.find(a => a.slug === slug)?.title) || trimmed.slice(0, 80)

        // Claim the slug in the DB BEFORE sending to Telegram — not after,
        // like an earlier version of this route did. That ordering had a
        // real race: two near-simultaneous requests for the same article
        // could both pass a pre-send existence check and both actually
        // broadcast to the public channel, with the unique index only
        // catching the *second DB row* (by which point the duplicate
        // message had already gone out, and the catch block below would
        // mask it as a success). Claiming first makes the unique index gate
        // the send itself: the loser gets a 409 and never calls
        // postToNewsChannel at all. Manual posts (slug: null) skip this —
        // Postgres treats every NULL as distinct under the unique index, so
        // there's no dedup invariant to protect for them.
        let claim = null
        if (slug) {
            try {
                claim = await prisma.newsPost.create({ data: { slug, title, telegramMessageId: null } })
            } catch (dbErr) {
                if (dbErr.code === 'P2002') return res.status(409).json({ error: 'Эта статья уже опубликована в канале' })
                throw dbErr
            }
        }

        const result = await postToNewsChannel(trimmed, { disablePreview: !!disablePreview })
        if (!result) {
            // Send failed — release the claim so the slug isn't stuck
            // "posted" forever and the admin can retry.
            if (claim) await prisma.newsPost.delete({ where: { id: claim.id } }).catch(() => {})
            return res.status(502).json({ error: 'Не удалось отправить сообщение в Telegram — проверьте логи сервера' })
        }

        let post
        try {
            post = claim
                ? await prisma.newsPost.update({ where: { id: claim.id }, data: { telegramMessageId: result.message_id || null } })
                : await prisma.newsPost.create({ data: { slug: null, title, telegramMessageId: result.message_id || null } })
        } catch (dbErr) {
            // Сообщение уже реально ушло в публичный канал — сбой записи в
            // БД не должен выглядеть как сбой всей операции (иначе админ
            // повторит попытку и продублирует пост). Громко логируем,
            // отвечаем успехом; в истории просто не будет этой записи.
            console.error('[news] posted to Telegram but failed to record NewsPost:', dbErr.message)
            post = { slug: slug || null, title, telegramMessageId: result.message_id || null, createdAt: new Date() }
        }

        res.status(201).json({ ok: true, post })
        audit(req, 'news.post', { slug: slug || null, telegramMessageId: result.message_id })
    } catch (err) {
        console.error('Admin POST /news error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Рассылки (broadcast emails) ─────────────────────────────────────
// Broadcast model added via landing/schema-broadcast.js, already applied
// and live on the server (confirmed in prisma/schema.prisma).
const BROADCAST_AUDIENCES = { ALL: {}, FREE: { plan: 'FREE' }, PRO: { plan: { in: ['PRO', 'TEAM'] } } }

function broadcastEscapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Sends are done in small concurrent batches with a short pause between
// batches — a plain "send to everyone in parallel" risks tripping the
// email provider's rate limit at any real user count; a fully sequential
// loop would just be needlessly slow. Runs after the HTTP response is
// already sent (see POST / below), updating sentCount/failedCount on the
// Broadcast row as it goes so GET /:id can be polled for live progress.
const BROADCAST_BATCH_SIZE = 10
const BROADCAST_BATCH_DELAY_MS = 1000

async function runBroadcastSend(broadcastId, users, subject, html) {
    let sent = 0
    let failed = 0
    for (let i = 0; i < users.length; i += BROADCAST_BATCH_SIZE) {
        const batch = users.slice(i, i + BROADCAST_BATCH_SIZE)
        const results = await Promise.allSettled(
            batch.map(u => sendEmail({ to: u.email, subject, html }))
        )
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value?.ok) sent++
            else failed++
        }
        await prisma.broadcast.update({ where: { id: broadcastId }, data: { sentCount: sent, failedCount: failed } })
        if (i + BROADCAST_BATCH_SIZE < users.length) {
            await new Promise(resolve => setTimeout(resolve, BROADCAST_BATCH_DELAY_MS))
        }
    }
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'SENT', finishedAt: new Date() } })
}

router.get('/broadcasts', async (req, res) => {
    try {
        const broadcasts = await prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
        res.json({ broadcasts })
    } catch (err) {
        console.error('Admin GET /broadcasts error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/broadcasts/:id', async (req, res) => {
    try {
        const broadcast = await prisma.broadcast.findUnique({ where: { id: req.params.id } })
        if (!broadcast) return res.status(404).json({ error: 'Не найдено' })
        res.json({ broadcast })
    } catch (err) {
        console.error('Admin GET /broadcasts/:id error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/broadcasts', async (req, res) => {
    try {
        const { subject, bodyText, audience } = req.body || {}
        if (!subject?.trim() || !bodyText?.trim()) {
            return res.status(400).json({ error: 'Укажите тему и текст письма' })
        }
        const aud = BROADCAST_AUDIENCES[audience] ? audience : 'ALL'

        const users = await prisma.user.findMany({
            where: { isActive: true, ...BROADCAST_AUDIENCES[aud] },
            select: { email: true }
        })

        const broadcast = await prisma.broadcast.create({
            data: {
                subject: subject.trim(),
                bodyText: bodyText.trim(),
                audience: aud,
                status: 'SENDING',
                totalCount: users.length,
            }
        })

        const html = broadcastEscapeHtml(bodyText.trim())
            .split(/\n{2,}/)
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('')

        // Respond immediately with the created broadcast (status SENDING) —
        // the actual send loop can take a while for a large audience, no
        // reason to hold the admin's request open for it.
        res.status(201).json({ ok: true, broadcast })
        audit(req, 'broadcast.create', { id: broadcast.id, audience: aud, totalCount: users.length })

        runBroadcastSend(broadcast.id, users, subject.trim(), html).catch(e => {
            console.error('[broadcast] send loop failed:', e.message)
            prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: 'FAILED', finishedAt: new Date() } }).catch(() => {})
        })
    } catch (err) {
        console.error('Admin POST /broadcasts error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Сессии и история логинов ─────────────────────────────────────────
// Session/LoginEvent модели уже существуют в схеме (используются
// auth-server.js), но до сих пор не было ни одной админ-ручки для их
// просмотра/отзыва — этот блок первый доступ к ним из админки.
router.get('/users/:id/sessions', async (req, res) => {
    try {
        const sessions = await prisma.session.findMany({
            where: { userId: req.params.id },
            orderBy: { createdAt: 'desc' }
        })
        res.json({ sessions })
    } catch (err) {
        console.error('Admin GET /users/:id/sessions error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/sessions/:id', async (req, res) => {
    try {
        await prisma.session.delete({ where: { id: req.params.id } })
        audit(req, 'session.revoke', { id: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Сессия не найдена' })
        res.status(500).json({ error: 'Server error' })
    }
})

// Выйти со всех устройств разом — например, если аккаунт скомпрометирован.
router.delete('/users/:id/sessions', async (req, res) => {
    try {
        const result = await prisma.session.deleteMany({ where: { userId: req.params.id } })
        audit(req, 'session.revokeAll', { userId: req.params.id, count: result.count })
        res.json({ ok: true, count: result.count })
    } catch (err) {
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/users/:id/logins', async (req, res) => {
    try {
        const logins = await prisma.loginEvent.findMany({
            where: { userId: req.params.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        })
        res.json({ logins })
    } catch (err) {
        console.error('Admin GET /users/:id/logins error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Пробные периоды (DeviceTrial) ────────────────────────────────────
// hardwareId keyed, no auth on redeem (см. payments-server.js
// /device-trial-redeem) — единственный способ вручную "простить" устройство,
// которое уже использовало пробный период, это удалить его запись отсюда.
router.get('/device-trials', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const search = (req.query.search || '').trim()
        const where  = search ? { hardwareId: { contains: search, mode: 'insensitive' } } : {}

        const [trials, total] = await Promise.all([
            prisma.deviceTrial.findMany({ where, skip, take: limit, orderBy: { expiresAt: 'desc' } }),
            prisma.deviceTrial.count({ where })
        ])

        // DeviceTrial не хранит userId — это анонимная запись (устройство
        // до регистрации, см. POST /device-trial-redeem). Но для триала,
        // выданного уже ПОСЛЕ регистрации через промокод-код с days
        // (POST /promo/redeem, isTrialStyle), User.planExpiresAt и
        // DeviceTrial.expiresAt в момент выдачи — буквально один и тот же
        // объект даты в коде (см. payments-server.js), так что точное
        // совпадение planExpiresAt — надёжный способ узнать, кому реально
        // достался этот конкретный триал. Для настоящих анонимных
        // (до регистрации) триалов совпадения не будет — это ожидаемо,
        // такое устройство ещё никому не принадлежит.
        const matchedUsers = trials.length
            ? await prisma.user.findMany({
                where: { planExpiresAt: { in: trials.map(t => t.expiresAt) } },
                select: { id: true, email: true, name: true, avatar: true, planExpiresAt: true }
              })
            : []
        const userByExpiry = new Map(matchedUsers.map(u => [u.planExpiresAt.toISOString(), u]))

        const result = trials.map(t => {
            const u = userByExpiry.get(t.expiresAt.toISOString())
            return {
                ...t,
                user: u ? { id: u.id, email: u.email, name: u.name, avatar: u.avatar } : null
            }
        })

        res.json({ trials: result, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin GET /device-trials error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/device-trials/:id', async (req, res) => {
    try {
        await prisma.deviceTrial.delete({ where: { id: req.params.id } })
        audit(req, 'deviceTrial.delete', { id: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Не найдено' })
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Команды (Organization / OrgMember / OrgInvite / OrgAuditLog) ───────
// Суперадмин-обзор поверх org-routes.js — тот файл видит только "мою"
// организацию (владелец/участник), здесь — все организации на платформе.
// Намеренно не полагаемся на предполагаемые названия обратных Prisma-связей
// (Organization.owner/members), которых нигде в коде не видно объявленными —
// вместо этого догружаем email владельца и число мест отдельными запросами
// теми же примитивами (orgMember.count/findMany), что уже проверены в
// lib/org.js и org-routes.js.
router.get('/orgs', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const search = (req.query.search || '').trim()
        const where  = search
            ? { OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } }
              ]}
            : {}

        const [orgs, total] = await Promise.all([
            prisma.organization.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
            prisma.organization.count({ where })
        ])

        const ownerIds = [...new Set(orgs.map(o => o.ownerId))]
        const owners = ownerIds.length
            ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, email: true, name: true } })
            : []
        const ownerById = new Map(owners.map(u => [u.id, u]))

        const result = await Promise.all(orgs.map(async (o) => ({
            ...o,
            ownerEmail: ownerById.get(o.ownerId)?.email || null,
            ownerName: ownerById.get(o.ownerId)?.name || null,
            seatsUsed: await prisma.orgMember.count({ where: { orgId: o.id, status: 'ACTIVE' } })
        })))

        res.json({ orgs: result, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin GET /orgs error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.get('/orgs/:id', async (req, res) => {
    try {
        const org = await prisma.organization.findUnique({ where: { id: req.params.id } })
        if (!org) return res.status(404).json({ error: 'Организация не найдена' })

        const owner = await prisma.user.findUnique({ where: { id: org.ownerId }, select: { id: true, email: true, name: true } })

        const members = await prisma.orgMember.findMany({
            where: { orgId: org.id, status: 'ACTIVE' },
            include: { user: { select: { id: true, email: true, name: true } } },
            orderBy: { joinedAt: 'asc' }
        })

        const pendingInvites = await prisma.orgInvite.findMany({
            where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: 'asc' }
        })

        const auditLog = await prisma.orgAuditLog.findMany({
            where: { orgId: org.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        })

        res.json({ ...org, owner, members, pendingInvites, auditLog })
    } catch (err) {
        console.error('Admin GET /orgs/:id error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Ручная выдача/продление мест — бесплатный грант поверх обычной
// self-service покупки в org-routes.js (та же пара полей, что и там:
// seatLimit — общий лимит мест, seatsExpiresAt — до какой даты они активны).
router.patch('/orgs/:id/seats', async (req, res) => {
    try {
        const { seatLimit, seatsExpiresAt } = req.body
        const data = {}
        if (seatLimit !== undefined) {
            const n = parseInt(seatLimit, 10)
            if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'seatLimit должен быть положительным целым числом' })
            data.seatLimit = n
        }
        if (seatsExpiresAt !== undefined) {
            data.seatsExpiresAt = seatsExpiresAt ? new Date(seatsExpiresAt) : null
        }
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Нечего обновлять' })

        const org = await prisma.organization.update({ where: { id: req.params.id }, data })
        audit(req, 'org.seats.update', { id: org.id, ...data })
        res.json({ ok: true, org })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Организация не найдена' })
        console.error('Admin PATCH /orgs/:id/seats error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

router.delete('/orgs/:id', async (req, res) => {
    try {
        await prisma.organization.delete({ where: { id: req.params.id } })
        audit(req, 'org.delete', { id: req.params.id })
        res.json({ ok: true })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Организация не найдена' })
        if (err.code === 'P2003') return res.status(409).json({ error: 'Нельзя удалить: у организации есть участники/платежи — сначала уберите их' })
        console.error('Admin DELETE /orgs/:id error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Логи автопродления ────────────────────────────────────────────────
router.get('/autorenew-logs', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const status = (req.query.status || '').trim()
        const where  = status ? { status } : {}

        const [logs, total] = await Promise.all([
            prisma.autoRenewLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
            prisma.autoRenewLog.count({ where })
        ])

        const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))]
        const users = userIds.length
            ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
            : []
        const emailById = new Map(users.map(u => [u.id, u.email]))
        const result = logs.map(l => ({ ...l, userEmail: emailById.get(l.userId) || null }))

        res.json({ logs: result, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin GET /autorenew-logs error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Возврат платежа (админ, без ограничения по времени) ────────────────
// Отличие от самостоятельного POST /api/payments/:paymentId/refund
// (payments-server.js): там — окно 14 дней и поиск по providerPayId+userId
// (пользователь возвращает свой платёж сам). Здесь — админ, ищет по
// внутреннему Payment.id (тому, что отдаёт GET /users/:id/payments), без
// возрастного окна, доступно для любого успешного платежа.
router.post('/payments/:id/refund', async (req, res) => {
    try {
        const payment = await prisma.payment.findUnique({ where: { id: req.params.id } })
        if (!payment) return res.status(404).json({ error: 'Платёж не найден' })
        if (payment.status === 'REFUNDED') return res.status(409).json({ error: 'Уже возвращён' })
        if (payment.status !== 'SUCCEEDED') return res.status(409).json({ error: 'Возврат возможен только для успешно оплаченных платежей' })
        if (payment.provider !== 'yookassa') {
            return res.status(501).json({ error: 'Автоматический возврат поддержан только для YooKassa. Остальное — вручную через кабинет провайдера.' })
        }

        // SECURITY (2026-09-06, аудит): раньше status='REFUNDED' писался
        // ПОСЛЕ ответа ЮKассы, а Idempotence-Key был случайным UUID на
        // каждый вызов (не завязан на payment.id) — двойной клик по кнопке
        // "Вернуть" или ретрай после таймаута мог отправить ДВА реальных
        // запроса на возврат в ЮKассу, прежде чем первый успевал записать
        // REFUNDED в БД. Теперь: (1) статус помечается атомарно ДО вызова
        // ЮKассы через updateMany с условием status='SUCCEEDED' — вторая
        // параллельная попытка увидит count:0 и остановится, не дойдя до
        // сети вообще; (2) Idempotence-Key выведен из payment.id, так что
        // даже если оба запроса всё же уйдут (гонка между updateMany двух
        // процессов физически невозможна в Postgres, но на всякий случай),
        // сама ЮKасса не выполнит один и тот же возврат дважды.
        const reserved = await prisma.payment.updateMany({
            where: { id: payment.id, status: 'SUCCEEDED' },
            data: { status: 'REFUNDED' }
        })
        if (reserved.count === 0) return res.status(409).json({ error: 'Уже возвращён' })

        const ikey = `refund-${payment.id}`
        let refund
        try {
            const response = await axios.post(`${YK_API}/refunds`, {
                payment_id: payment.providerPayId,
                amount: { value: payment.amount.toFixed(2), currency: payment.currency }
            }, {
                auth: ykAuth(),
                headers: { 'Idempotence-Key': ikey }
            })
            refund = response.data
        } catch (e) {
            // Откатываем резерв — возврат в ЮKассе не прошёл, платёж
            // остаётся SUCCEEDED, можно попробовать снова.
            await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } }).catch(() => {})
            throw e
        }

        await prisma.user.update({ where: { id: payment.userId }, data: { autoRenew: false } }).catch(() => {})

        const user = await prisma.user.findUnique({ where: { id: payment.userId } })
        if (user) sendRefundConfirmationEmail(user, payment).catch(e => console.error('[email] refund confirmation failed:', e.message))

        audit(req, 'payment.refund', { paymentId: payment.id, userId: payment.userId, amount: payment.amount })
        res.json({ ok: true, refund: { id: refund.id, status: refund.status } })
    } catch (err) {
        console.error('Admin POST /payments/:id/refund error:', err.response?.data || err.message)
        res.status(500).json({ error: 'Ошибка оформления возврата' })
    }
})

// ── Финансы ──────────────────────────────────────────────────────────
// Раньше платежи были видны только по одному пользователю
// (GET /users/:id/payments) — здесь общий список по всей платформе и
// агрегированная статистика за период. period: 'week' (7 дней) или
// 'month' (30 дней); без параметра — за всё время. from/to (ISO-даты)
// перекрывают period, если переданы — это и есть "произвольный период",
// а также способ посмотреть один конкретный день (from=00:00 этого дня,
// to=00:00 следующего) при клике по столбику графика на клиенте.
function periodSince(period) {
    if (period === 'week') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    if (period === 'month') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return null
}

// Возвращает { gte, lt } под Prisma-фильтр createdAt, либо null если ни
// from/to, ни period не заданы (значит "за всё время", без фильтра).
function resolveDateRange(query) {
    const from = query.from ? new Date(query.from) : null
    const to   = query.to   ? new Date(query.to)   : null
    if ((query.from && isNaN(from)) || (query.to && isNaN(to))) return { invalid: true }
    if (from || to) {
        return { range: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    }
    const since = periodSince(query.period)
    return { range: since ? { gte: since } : null }
}

router.get('/payments', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || '1'))
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')))
        const skip   = (page - 1) * limit
        const status = (req.query.status || '').trim().toUpperCase()

        const { range, invalid } = resolveDateRange(req.query)
        if (invalid) return res.status(400).json({ error: 'Некорректная дата в from/to' })

        const where = {
            ...(range ? { createdAt: range } : {}),
            ...(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status) ? { status } : {})
        }

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where, skip, take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, email: true, name: true, avatar: true } } }
            }),
            prisma.payment.count({ where })
        ])

        res.json({ payments, total, page, pages: Math.ceil(total / limit) })
    } catch (err) {
        console.error('Admin GET /payments error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Считаем "успешным платежом" (для счётчиков/выручки/среднего чека/топа)
// только реально оплаченное — status=SUCCEEDED И amount > 0. $0-строки
// тоже пишутся в Payment для бесплатных promo-грантов (см. payments-server.js
// /promo/redeem), это не платёж, а бесплатная выдача, их наличие раньше
// раздувало счётчик и триггерило уведомление "Новый платёж: 0 RUB".
function isRealPayment(p) {
    return p.status === 'SUCCEEDED' && p.amount > 0
}

router.get('/finance/summary', async (req, res) => {
    try {
        // Произвольный период через from/to (ISO-даты) перекрывает пресеты
        // week/month — так клиент может запросить любой диапазон, а не
        // только два зашитых варианта. until по умолчанию "сейчас".
        const customFrom = req.query.from ? new Date(req.query.from) : null
        const customTo   = req.query.to   ? new Date(req.query.to)   : null
        if ((req.query.from && isNaN(customFrom)) || (req.query.to && isNaN(customTo))) {
            return res.status(400).json({ error: 'Некорректная дата в from/to' })
        }

        const period = req.query.period === 'month' ? 'month' : 'week'
        const since  = customFrom || periodSince(period)
        const until  = customTo || new Date()
        const periodMs = until.getTime() - since.getTime()
        const prevSince = new Date(since.getTime() - periodMs)
        const prevUntil = since

        const [payments, prevPayments, newUsersCount] = await Promise.all([
            prisma.payment.findMany({
                where: { createdAt: { gte: since, lt: until } },
                orderBy: { createdAt: 'asc' },
                include: { user: { select: { id: true, email: true, name: true, avatar: true } } }
            }),
            // Тот же по длине период непосредственно ДО текущего — чтобы
            // показать "выручка выросла/упала на X%" не в вакууме.
            prisma.payment.findMany({ where: { createdAt: { gte: prevSince, lt: prevUntil } } }),
            prisma.user.count({ where: { createdAt: { gte: since, lt: until } } })
        ])

        const succeeded = payments.filter(isRealPayment)
        const refunded   = payments.filter(p => p.status === 'REFUNDED')
        const pending     = payments.filter(p => p.status === 'PENDING')
        const prevSucceeded = prevPayments.filter(isRealPayment)

        const totalRevenue    = succeeded.reduce((sum, p) => sum + p.amount, 0)
        const refundedAmount  = refunded.reduce((sum, p) => sum + p.amount, 0)
        const prevRevenue     = prevSucceeded.reduce((sum, p) => sum + p.amount, 0)
        const avgPayment      = succeeded.length ? totalRevenue / succeeded.length : 0

        const byProvider = {}
        const byPlan = {}
        for (const p of succeeded) {
            byProvider[p.provider] = (byProvider[p.provider] || 0) + p.amount
            byPlan[p.plan] = (byPlan[p.plan] || 0) + p.amount
        }

        // День -> выручка, для графика на клиенте. Явно проходим каждый
        // календарный день периода (а не только дни с платежами) — иначе
        // график из недели с 2 платёжными днями рисует всего 2 столбика
        // вместо 7, и подписать дни датами по порядку не получится.
        // При произвольном (from/to) периоде диапазон может быть очень
        // длинным — свыше ~3 месяцев переходим на понедельные корзины,
        // чтобы не гонять по дню на каждую итерацию и не раздувать ответ.
        const totalDays = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)))
        const bucketByWeek = totalDays > 92

        function bucketKey(date) {
            if (!bucketByWeek) return date.toISOString().slice(0, 10)
            // Понедельник той недели, в ISO-формате даты — стабильный и
            // сортируемый ключ корзины без сторонних библиотек недель.
            const d = new Date(date)
            const day = (d.getUTCDay() + 6) % 7 // 0=понедельник
            d.setUTCDate(d.getUTCDate() - day)
            d.setUTCHours(0, 0, 0, 0)
            return d.toISOString().slice(0, 10)
        }

        const seriesMap = new Map()
        for (const p of succeeded) {
            const key = bucketKey(p.createdAt)
            seriesMap.set(key, (seriesMap.get(key) || 0) + p.amount)
        }
        const series = []
        const cursor = new Date(since)
        cursor.setUTCHours(0, 0, 0, 0)
        const step = bucketByWeek ? 7 : 1
        let guard = 0
        while (cursor <= until && guard < 500) {
            const key = bucketKey(cursor)
            if (!series.length || series[series.length - 1].date !== key) {
                series.push({ date: key, revenue: seriesMap.get(key) || 0 })
            }
            cursor.setUTCDate(cursor.getUTCDate() + step)
            guard++
        }

        // Топ-5 плательщиков за период — суммируем по userId.
        const byUser = new Map()
        for (const p of succeeded) {
            if (!p.user) continue
            const entry = byUser.get(p.userId) || { user: p.user, total: 0, count: 0 }
            entry.total += p.amount
            entry.count += 1
            byUser.set(p.userId, entry)
        }
        const topPayers = [...byUser.values()]
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .map(e => ({ userId: e.user.id, email: e.user.email, name: e.user.name, avatar: e.user.avatar, total: e.total, count: e.count }))

        const payingUsersCount = byUser.size

        res.json({
            period,
            since,
            until,
            bucketByWeek,
            totalRevenue,
            successCount: succeeded.length,
            avgPayment,
            payingUsersCount,
            newUsersCount,
            // Конверсия новых регистраций периода в оплату — грубая (платит
            // не обязательно тот, кто зарегистрировался в этом же периоде),
            // но по годам-месяцам такая оценка обычно ожидаемая, а не точная.
            conversionRate: newUsersCount > 0 ? payingUsersCount / newUsersCount : null,
            revenueChangePct: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null,
            prevRevenue,
            refundedAmount,
            refundedCount: refunded.length,
            pendingCount: pending.length,
            byProvider,
            byPlan,
            series,
            topPayers
        })
    } catch (err) {
        console.error('Admin GET /finance/summary error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

module.exports = router
