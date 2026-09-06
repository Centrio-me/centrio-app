const router = require('express').Router()
const axios = require('axios')
const authMiddleware = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')
const prisma = require('../utils/prisma')

// PRO-прокси инференса для AI-ассистента Centrio Electron-приложения (см.
// main/services/aiProviders/centrioProxy.js в основном репо и
// .claude/plans/ai-assistant.plan.md §4.3). Единственный режим ассистента,
// где расходы несём мы — поэтому здесь и авторизация по PRO, и жёсткая
// месячная квота, и намеренно НИКАКОГО логирования содержимого переписки
// (только агрегированный счётчик сообщений в AiUsage).
const AGENT_PLATFORM_BASE_URL = process.env.AGENTPLATFORM_BASE_URL || 'https://api.agentplatform.ru/v1'
const AGENT_PLATFORM_API_KEY = process.env.AGENTPLATFORM_API_KEY
// DeepSeek через Agent Platform стоит столько же, сколько GPT у того же
// провайдера — решили не платить за DeepSeek, когда можно сразу брать модель
// уровня GPT-4o mini (та же ценовая категория, что и прежний DeepSeek-V4-Flash,
// но не рассуждающая модель — reasoning_content-костыль ниже больше не нужен).
const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || 'openai/gpt-4o-mini'
const PRO_MONTHLY_QUOTA = parseInt(process.env.ASSISTANT_PRO_MONTHLY_QUOTA || '100', 10)
const IS_REASONING_MODEL = /deepseek|reasoning|-r1\b/i.test(ASSISTANT_MODEL)

// Квота считается по инференс-ВЫЗОВАМ, а не по "сообщениям пользователя" в
// бытовом смысле: один вопрос пользователя, приведший к tool-calling (модель
// вызвала 2 инструмента), даёт main-процессу Electron-клиента 3 раунда
// "спросить модель" (см. MAX_TOOL_ROUNDS в main/ipc/assistant.js), то есть 3
// отдельных запроса сюда. Это осознанно самый безопасный вариант с точки
// зрения контроля расходов (риск §8 плана "расходы выходят из-под
// контроля") — реальная стоимость на нашей стороне тоже привязана к числу
// инференс-вызовов, а не к тому, сколько раз пользователь нажал Enter.
function currentMonthKey(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function isActivePro(user) {
    if (user.plan !== 'PRO') return false
    if (!user.planExpiresAt) return true
    return new Date(user.planExpiresAt) > new Date()
}

async function getUsage(userId, month) {
    return prisma.aiUsage.findUnique({ where: { userId_month: { userId, month } } })
}

// POST /api/assistant/chat — тело идентично тому, что main-процесс Electron
// шлёт остальным OpenAI-совместимым провайдерам ({messages, tools, stream}),
// см. main/services/aiProviders/openaiCompatible.js. Модель на этом уровне
// не выбирается клиентом — всегда ASSISTANT_MODEL, чтобы держать
// себестоимость предсказуемой.
router.post('/chat', rateLimit({ windowMs: 5 * 60 * 1000, max: 40, name: 'assistant-chat', keyGenerator: (req) => req.user?.id || req.ip }), authMiddleware, async (req, res) => {
    if (!AGENT_PLATFORM_API_KEY) {
        return res.status(503).json({ error: 'assistant_not_configured' })
    }
    if (!isActivePro(req.user)) {
        return res.status(403).json({ error: 'pro_required' })
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : []
    if (rawMessages.length === 0) {
        return res.status(400).json({ error: 'invalid_request' })
    }
    // Костыль ниже нужен только для рассуждающих моделей за litellm-прокси
    // Agent Platform (DeepSeek-R1/V4 и т.п.) — тот валидирует, что КАЖДОЕ
    // assistant-сообщение в истории несёт поле reasoning_content (иначе 400
    // "Missing reasoning_content field..." — поймано в проде 2026-08-20).
    // GPT не рассуждающая модель в этом смысле и такого поля не ждёт, поэтому
    // применяем патч только когда ASSISTANT_MODEL — reasoning-модель.
    const messages = IS_REASONING_MODEL
        ? rawMessages.map((m) => (
            m?.role === 'assistant' && m.reasoning_content === undefined
                ? { ...m, reasoning_content: ' ' }
                : m
        ))
        : rawMessages
    const tools = Array.isArray(req.body?.tools) && req.body.tools.length > 0 ? req.body.tools : undefined

    // SECURITY/CORRECTNESS (2026-09-06, аудит): раньше здесь было
    // "прочитать messagesUsed -> (сходить в апстрим) -> инкрементировать" —
    // классический check-then-act race. Несколько параллельных запросов от
    // одного пользователя (или скриптом) читали ОДНО И ТО ЖЕ значение
    // messagesUsed ДО того, как хоть один из них успевал инкрементировать —
    // все проходили проверку, все реально шли в платный апстрим, и только
    // потом (после ответа за секунды) счётчик догонял фактическое число
    // вызовов. При per-user rate-limit'е 40 запросов/5мин это давало пробить
    // месячную квоту на десятки инференс-вызовов сверх лимита.
    // Фикс: атомарный "резерв" через одно conditional UPDATE (increment
    // ТОЛЬКО если ещё не достигнут лимит, WHERE messagesUsed < quota) —
    // Postgres гарантирует, что при гонке инкремент применится ровно
    // столько раз, сколько реально было "мест" под квотой, остальные
    // updateMany просто не найдут подходящую строку (count: 0). Резерв
    // снимается (decrement) если апстрим в итоге не ответил успешно — та же
    // семантика "квота списывается только за реально успешные ответы",
    // просто в другом порядке (резервируем, откатываем при неудаче, а не
    // читаем, потом коммитим при удаче).
    const month = currentMonthKey()
    await prisma.aiUsage.upsert({
        where: { userId_month: { userId: req.user.id, month } },
        update: {},
        create: { userId: req.user.id, month, messagesUsed: 0 }
    })
    const reserved = await prisma.aiUsage.updateMany({
        where: { userId: req.user.id, month, messagesUsed: { lt: PRO_MONTHLY_QUOTA } },
        data: { messagesUsed: { increment: 1 } }
    })
    if (reserved.count === 0) {
        return res.status(429).json({ error: 'quota_exceeded', code: 'AI_QUOTA_EXCEEDED', limit: PRO_MONTHLY_QUOTA })
    }

    const releaseReservation = () => prisma.aiUsage.update({
        where: { userId_month: { userId: req.user.id, month } },
        data: { messagesUsed: { decrement: 1 } }
    }).catch((e) => console.error('[assistant chat] failed to release quota reservation:', e.message))

    let upstream
    try {
        upstream = await axios.post(`${AGENT_PLATFORM_BASE_URL}/chat/completions`, {
            model: ASSISTANT_MODEL,
            messages,
            ...(tools ? { tools } : {}),
            stream: true
        }, {
            headers: { Authorization: `Bearer ${AGENT_PLATFORM_API_KEY}` },
            responseType: 'stream',
            timeout: 60000,
            validateStatus: () => true
        })
    } catch (e) {
        console.error('[assistant chat] upstream unreachable:', e.message)
        await releaseReservation()
        return res.status(502).json({ error: 'upstream_unreachable' })
    }

    if (upstream.status < 200 || upstream.status >= 300) {
        let errBody = ''
        upstream.data.on('data', (chunk) => { if (errBody.length < 2000) errBody += chunk.toString('utf8') })
        upstream.data.on('end', () => {
            console.error('[assistant chat] upstream non-2xx:', upstream.status, errBody.slice(0, 2000))
        })
        await releaseReservation()
        return res.status(502).json({ error: 'upstream_error' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    upstream.data.pipe(res)
    const abortUpstream = () => { try { upstream.data.destroy() } catch {} }
    req.on('close', abortUpstream)
    upstream.data.on('error', (e) => {
        console.error('[assistant chat] stream error:', e.message)
        if (!res.writableEnded) res.end()
    })
})

// GET /api/assistant/usage — для индикатора "осталось N сообщений" в
// настройках Electron-клиента (Настройки → AI-ассистент → PRO).
router.get('/usage', authMiddleware, async (req, res) => {
    const isPro = isActivePro(req.user)
    const month = currentMonthKey()
    const usage = await getUsage(req.user.id, month)
    // Плоский формат ответа (без success/data-обёртки) — как и
    // /api/stats/summary, см. stats.js. Раньше здесь было
    // { success:true, data:{...} }, что main/ipc/api.js::wrapApi()
    // оборачивало ЕЩЁ РАЗ в { success, data }, и клиент читал
    // res.data.used на один уровень выше, чем реально лежали данные —
    // всегда получал undefined -> NaN -> "Не удалось загрузить данные
    // о лимите", хотя сервер отвечал 200 с валидными данными.
    res.json({
        isPro,
        used: usage?.messagesUsed || 0,
        limit: PRO_MONTHLY_QUOTA,
        planExpiresAt: req.user.planExpiresAt || null
    })
})

module.exports = router
