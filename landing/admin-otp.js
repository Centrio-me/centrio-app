const crypto  = require('crypto')
const otplib  = require('otplib')
const QRCode  = require('qrcode')

// ── Сессионные токены: token -> expiresAt ────────────────────────────────────
const sessionStore = new Map()

// ── Брутфорс-защита TOTP: clientKey -> { attempts, lockedUntil } ────────────
// Поднято с 5 до 30 (2026-09) — единственный клиент это Android-приложение,
// которое само генерирует TOTP-код из локального времени телефона; при
// сбое подстройки времени сервера (ServerTime.fetchOffsetMillis, см.
// android-admin) несколько попыток подряд могут провалиться по совершенно
// легитимной причине (не брутфорс), и старый лимит в 5 запирал вход на
// 15 минут слишком часто для одного-единственного администратора.
const MAX_ATTEMPTS = 30
const LOCKOUT_MS    = 5 * 60 * 1000
const attemptStore  = new Map()

function generateToken() { return crypto.randomBytes(32).toString('hex') }

// Периодическая очистка просроченных сессий и снятых блокировок
setInterval(() => {
    const now = Date.now()
    for (const [k, v] of sessionStore) { if (v < now) sessionStore.delete(k) }
    for (const [k, v] of attemptStore) { if (v.lockedUntil && v.lockedUntil < now) attemptStore.delete(k) }
}, 60_000)

// ── Получить QR-код (data URL) для первичной настройки ───────────────────────
async function getQrDataUrl() {
    const secret = process.env.TOTP_SECRET
    const uri = otplib.generateURI({
        type:   'totp',
        label:  'Centrio Admin',
        issuer: 'Centrio',
        secret
    })
    return QRCode.toDataURL(uri, { width: 240, margin: 2, color: { dark: '#000', light: '#fff' } })
}

// ── Проверить TOTP-код (с блокировкой по clientKey после MAX_ATTEMPTS неудачных попыток) ─
function verifyTotp(token, clientKey) {
    const key = clientKey || 'unknown'
    const now = Date.now()
    let entry = attemptStore.get(key)

    if (entry && entry.lockedUntil) {
        if (entry.lockedUntil > now) {
            return {
                ok: false,
                locked: true,
                error: 'Слишком много неверных попыток. Попробуйте позже',
                retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000)
            }
        }
        // Блокировка истекла — сбрасываем счётчик
        attemptStore.delete(key)
        entry = null
    }

    const secret = process.env.TOTP_SECRET
    if (!secret) return { ok: false, error: 'TOTP_SECRET не настроен на сервере' }

    try {
        // ВАЖНО (security fix): otplib v13 сделал verify() асинхронным (возвращает
        // Promise) — Promise-объект всегда truthy, поэтому "if (!valid)" никогда не
        // срабатывал и ЛЮБОЙ 6-значный код проходил проверку. Используем verifySync,
        // который возвращает { valid: boolean, ... } синхронно, как и было задумано.
        const result = otplib.verifySync({ type: 'totp', secret, token: String(token).trim() })
        const valid = !!(result && result.valid)
        if (!valid) {
            const attempts = (entry && entry.attempts ? entry.attempts : 0) + 1
            if (attempts >= MAX_ATTEMPTS) {
                attemptStore.set(key, { attempts, lockedUntil: now + LOCKOUT_MS })
                return {
                    ok: false,
                    locked: true,
                    error: 'Слишком много неверных попыток. Попробуйте позже',
                    retryAfterSec: Math.ceil(LOCKOUT_MS / 1000)
                }
            }
            attemptStore.set(key, { attempts, lockedUntil: null })
            return { ok: false, error: 'Неверный код' }
        }
        attemptStore.delete(key)
        const sessionToken = generateToken()
        sessionStore.set(sessionToken, now + 8 * 60 * 60 * 1000)  // 8 часов
        return { ok: true, token: sessionToken }
    } catch (e) {
        return { ok: false, error: 'Ошибка проверки кода' }
    }
}

// ── Проверить валидность сессионного токена ──────────────────────────────────
function checkSession(token) {
    if (!token) return false
    const exp = sessionStore.get(token)
    if (!exp) return false
    if (Date.now() > exp) { sessionStore.delete(token); return false }
    return true
}

module.exports = { getQrDataUrl, verifyTotp, checkSession }
