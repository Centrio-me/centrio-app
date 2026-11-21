// NOTE on deploy path: this file is deployed to
// /var/www/centrio-api/src/routes/auth.js (see scripts/deploy-phase1-auth.js),
// so `../lib/email` resolves to /var/www/centrio-api/src/lib/email.js.
// landing/lib/email.js must already be deployed there (Phase 2 deploy).
//
// Based 1:1 on the live server's src/routes/auth.js (fetched via SSH on
// 2026-07-29 once key-based access was restored — see
// centrio-hardening.plan.md). The only functional change here is wiring in
// sendWelcomeEmail() at every place a brand-new user row is created:
// password registration, and the first-login branch of each OAuth provider
// (Google web + desktop, Yandex web + electron, GitHub, Telegram). Everything
// else is untouched from the live version.
const { isBetaTester } = require("../lib/beta-testers")
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const { generateAccessToken, generateRefreshToken, refreshTokens } = require('../utils/tokens')
const authMiddleware = require('../middleware/auth')
const { OAuth2Client } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')
const { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendRegistrationCodeEmail, sendEmailAttachCodeEmail } = require('../lib/email')
const { rateLimit } = require('../middleware/rateLimit')
const { grantSignupTrial } = require('../lib/signup-trial')
const { notifyAdminSignup } = require('../lib/admin-push')
const { attachSignupSource } = require('../lib/ad-touch')
// Корпоративная версия (TEAM) — Phase 1. orgSummary is null for users who
// aren't in an organization, so this is a strict additive change: existing
// clients that don't know about the field simply ignore it.
const { getOrgSummaryForUser } = require('../lib/org')
const loginAccounts = require('../lib/login-accounts')
const { withLoginShape } = require('../lib/profile-shape')

// ── Email verification ──────────────────────────────────────────────────
// Only password-registered users start unverified — every OAuth provider
// branch below already sets emailVerified: true at creation (the provider
// itself already confirmed the address), so this flow only ever applies to
// the /register path and to re-sends triggered from the dashboard.
const EMAIL_VERIFY_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour
const verifyEmailSendLimiter = rateLimit({ name: 'verify-email-send', windowMs: 60 * 60 * 1000, max: 5 })
const forgotPasswordLimiter = rateLimit({ name: 'forgot-password', windowMs: 60 * 60 * 1000, max: 5 })
// /login and /register previously had no route-specific limiter at all —
// they only inherited the blanket global /api/* limiter in index.js, shared
// with every other endpoint (stats, sync, notifications...). A desktop app
// session's own background polling could burn through that shared budget
// and then lock the SAME IP out of logging in — worse for anyone behind a
// NAT/office/carrier IP shared with another active user. These give login
// and register their own reasonable ceiling, independent of general API use.
// 120: an office behind one address signs in together in the morning (sign-ins by login also have their own lock per login)
const loginLimiter    = rateLimit({ name: 'login',    windowMs: 15 * 60 * 1000, max: 120 })
const registerLimiter = rateLimit({ name: 'register', windowMs: 60 * 60 * 1000, max: 20 })

function hashVerifyToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Mints a fresh single-use token, persists only its hash (so a DB read/log
// leak can't hand out a working verification link), and fires the email.
// Fire-and-forget by design, same as sendWelcomeEmail — a broken email
// provider must never fail or delay the caller's response.
async function issueAndSendVerification(user) {
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyTokenHash: hashVerifyToken(token),
      emailVerifyTokenExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TOKEN_TTL_MS)
    }
  })
  await sendVerificationEmail(user, token)
}

// ── Login history ────────────────────────────────────────────────────────
// Append-only log of successful logins, separate from Session (which is
// deleted on logout/revoke or 30-day expiry — see /devices in user-route.js).
// Unlike the "active devices" list, this survives logout, so a user can
// still see "someone logged in from an unfamiliar IP" even after that
// session ended. Deliberately fire-and-forget, same rationale as the email
// senders above: a DB hiccup writing an audit-log row must never fail or
// delay an actual login response.
function recordLoginEvent(userId, provider, req) {
  prisma.loginEvent.create({
    data: {
      userId,
      provider,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    }
  }).catch(e => console.error('[login-history] record failed:', e.message))
}

const googleWebClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.API_URL}/api/auth/google/callback`
)

const googleDesktopClient = new OAuth2Client(
  process.env.GOOGLE_DESKTOP_CLIENT_ID,
  process.env.GOOGLE_DESKTOP_CLIENT_SECRET
)

// ── Desktop OAuth state/nonce store ───────────────────────────────────────
// The browser-based desktop login (Google/Yandex "from=desktop") used to
// hand the Electron app's centrio:// deep-link callback a hardcoded literal
// state ('desktop') instead of a real per-attempt nonce. Since the centrio://
// protocol handler is registered OS-wide once the app is installed, ANY
// other app or web page could invoke `centrio://auth?accessToken=...` and
// the old client had no way to tell that apart from a real callback — a
// login-CSRF / token-injection risk. See main/ipc/oauth.js and
// main/services/protocol.js in the desktop app repo for the matching
// client-side half of this fix.
//
// New flow: the desktop app generates its own nonce and sends it here as
// `client_nonce` when it opens this URL in the system browser. We mint a
// fresh random `state`, map it to that nonce, and hand `state` to the OAuth
// provider as the actual CSRF state param. On callback we look the state up
// (single-use — deleted on lookup either way) and only redirect to
// centrio://auth with a token if it's found and unexpired, echoing back the
// original client_nonce as `state` so the app can confirm the callback
// belongs to the attempt it itself started. An unknown/expired/missing
// state falls back to the normal web success/error redirect instead of
// ever handing a token to centrio:// — fail closed, not open.
const oauthStateStore = new Map() // state -> { clientNonce, expiresAt }
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000 // 5 minutes, mirrors admin-otp.js's session TTL pattern

setInterval(() => {
  const now = Date.now()
  for (const [state, entry] of oauthStateStore) {
    if (entry.expiresAt < now) oauthStateStore.delete(state)
  }
}, 60 * 1000)

function issueDesktopState(clientNonce, kind = 'app') {
  const state = crypto.randomBytes(16).toString('hex')
  oauthStateStore.set(state, {
    clientNonce: typeof clientNonce === 'string' ? clientNonce.slice(0, 256) : '',
    kind,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS
  })
  return state
}

// Single-use lookup: always deletes the entry so a captured/replayed
// callback URL can't be replayed a second time. Returns the original
// client_nonce string on success, or null if the state is missing, unknown,
// or expired (including: not a desktop flow at all).
function consumeDesktopState(state) {
  if (!state || typeof state !== 'string') return null
  const entry = oauthStateStore.get(state)
  oauthStateStore.delete(state)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) return null
  return entry.clientNonce
}

// Phone sign-in through the browser (Yandex): which flow a state belongs to, without using it up.
function peekOAuthKind(state) {
  const entry = typeof state === 'string' ? oauthStateStore.get(state) : null
  return entry && entry.expiresAt >= Date.now() ? entry.kind : null
}

// One-time codes the phone trades for tokens: code -> { userId, provider, nonce, expiresAt }.
const mobileCodeStore = new Map()
const MOBILE_CODE_TTL_MS = 2 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [code, entry] of mobileCodeStore) if (entry.expiresAt < now) mobileCodeStore.delete(code)
}, 60 * 1000)

function issueMobileCode(userId, provider, nonce) {
  const code = crypto.randomBytes(24).toString('hex')
  mobileCodeStore.set(code, { userId, provider, nonce: String(nonce || ''), expiresAt: Date.now() + MOBILE_CODE_TTL_MS })
  return code
}

// ===== REGISTER =====
// ── Registration with an emailed code (2026-11-06) ───────────────────────────
// Fake or mistyped addresses used to register freely (the account was created before anything proved the
// mailbox exists). Now POST /register/start only sends a 6-digit code and keeps the pending signup in memory;
// the account is created by POST /register/confirm once the code from the email is entered, with
// emailVerified already true. Pending signups live 15 minutes and are lost on restart (the person just asks
// for a new code). The old POST /register below stays for already-released app versions; set
// REGISTER_LEGACY_OFF=1 in .env to close it once the new app is out.
const REG_CODE_TTL_MS     = 15 * 60 * 1000
const REG_MAX_ATTEMPTS    = 5
const REG_RESEND_GAP_MS   = 45 * 1000
const REG_EMAIL_RE        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const regPending = new Map() // lowercased email -> { email, name, passwordHash, referredById, codeHash, expiresAt, attempts, sentAt }
const regStartLimiter   = rateLimit({ name: 'register-start',   windowMs: 60 * 60 * 1000, max: 15 })
const regConfirmLimiter = rateLimit({ name: 'register-confirm', windowMs: 15 * 60 * 1000, max: 40 })

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of regPending) if (entry.expiresAt < now) regPending.delete(key)
}, 60 * 1000).unref()

function hashRegCode(email, code) {
  return crypto.createHash('sha256').update(`${email}:${code}:${process.env.JWT_SECRET || 'centrio'}`).digest('hex')
}

function newRegCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function readRegEmail(body) {
  const raw = body && body.email
  if (typeof raw !== 'string') return null
  const email = raw.trim()
  return REG_EMAIL_RE.test(email) && email.length <= 254 ? email : null
}

async function sendPendingCode(entry, sender = sendRegistrationCodeEmail) {
  const code = newRegCode()
  const sent = await sender(entry.email, code)
  if (!sent || !sent.ok) return false
  entry.codeHash  = hashRegCode(entry.email.toLowerCase(), code)
  entry.expiresAt = Date.now() + REG_CODE_TTL_MS
  entry.attempts  = 0
  entry.sentAt    = Date.now()
  return true
}

router.post('/register/start', regStartLimiter, async (req, res) => {
  try {
    const email = readRegEmail(req.body)
    const password = req.body && req.body.password
    if (!email) return res.status(400).json({ error: 'Введите корректный email' })
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Пароль должен быть минимум 8 символов' })
    if (password.length > 200) return res.status(400).json({ error: 'Пароль слишком длинный' })
    const key = email.toLowerCase()
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (existing) return res.status(409).json({ error: 'Пользователь с таким email уже существует. Войдите или восстановите пароль.' })

    let referredById = null
    const referralCode = req.body.referralCode
    if (referralCode && typeof referralCode === 'string') {
      const referrer = await prisma.user.findUnique({ where: { id: referralCode }, select: { id: true } })
      if (referrer) referredById = referrer.id
    }

    const previous = regPending.get(key)
    if (previous && Date.now() - previous.sentAt < REG_RESEND_GAP_MS) {
      const wait = Math.ceil((REG_RESEND_GAP_MS - (Date.now() - previous.sentAt)) / 1000)
      return res.status(429).json({ error: `Код уже отправлен. Повторить можно через ${wait} с`, retryAfter: wait })
    }

    const name = typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 80) : email.split('@')[0]
    const entry = {
      email, name, referredById,
      passwordHash: await bcrypt.hash(password, 12),
      codeHash: '', expiresAt: 0, attempts: 0, sentAt: 0
    }
    if (!(await sendPendingCode(entry))) {
      return res.status(502).json({ error: 'Не удалось отправить письмо с кодом. Проверьте адрес и попробуйте ещё раз.' })
    }
    regPending.set(key, entry)
    res.json({ pending: true, email, expiresInSec: REG_CODE_TTL_MS / 1000, resendInSec: REG_RESEND_GAP_MS / 1000 })
  } catch (err) {
    console.error('Register start error:', err)
    res.status(500).json({ error: 'Ошибка при регистрации' })
  }
})

router.post('/register/resend', regStartLimiter, async (req, res) => {
  try {
    const email = readRegEmail(req.body)
    const entry = email ? regPending.get(email.toLowerCase()) : null
    if (!entry) return res.status(400).json({ error: 'Регистрация не найдена или код истёк. Начните заново.' })
    if (Date.now() - entry.sentAt < REG_RESEND_GAP_MS) {
      const wait = Math.ceil((REG_RESEND_GAP_MS - (Date.now() - entry.sentAt)) / 1000)
      return res.status(429).json({ error: `Повторить можно через ${wait} с`, retryAfter: wait })
    }
    if (!(await sendPendingCode(entry))) return res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте ещё раз.' })
    res.json({ pending: true, email: entry.email, expiresInSec: REG_CODE_TTL_MS / 1000, resendInSec: REG_RESEND_GAP_MS / 1000 })
  } catch (err) {
    console.error('Register resend error:', err)
    res.status(500).json({ error: 'Ошибка при отправке кода' })
  }
})

router.post('/register/confirm', regConfirmLimiter, async (req, res) => {
  try {
    const email = readRegEmail(req.body)
    const code = req.body && typeof req.body.code === 'string' ? req.body.code.replace(/\s/g, '') : ''
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Введите 6 цифр из письма' })
    const key = email.toLowerCase()
    const entry = regPending.get(key)
    if (!entry || entry.expiresAt < Date.now()) {
      regPending.delete(key)
      return res.status(400).json({ error: 'Код истёк. Запросите новый.', code: 'code_expired' })
    }
    entry.attempts += 1
    const given = Buffer.from(hashRegCode(key, code))
    const wanted = Buffer.from(entry.codeHash)
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
      if (entry.attempts >= REG_MAX_ATTEMPTS) {
        regPending.delete(key)
        return res.status(429).json({ error: 'Слишком много неверных попыток. Запросите новый код.', code: 'code_locked' })
      }
      return res.status(400).json({ error: `Неверный код. Осталось попыток: ${REG_MAX_ATTEMPTS - entry.attempts}`, code: 'code_wrong' })
    }
    const existing = await prisma.user.findFirst({ where: { email: { equals: entry.email, mode: 'insensitive' } }, select: { id: true } })
    if (existing) { regPending.delete(key); return res.status(409).json({ error: 'Пользователь с таким email уже существует' }) }

    let user = await prisma.user.create({
      data: { email: entry.email, name: entry.name, passwordHash: entry.passwordHash, referredById: entry.referredById, emailVerified: true },
      select: { id: true, email: true, name: true, avatar: true, plan: true, planExpiresAt: true, planStartedAt: true, emailVerified: true }
    })
    regPending.delete(key)
    user = await grantSignupTrial(user)
    attachSignupSource(user.id, req)
    sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'password', req)
    res.status(201).json({ message: 'Регистрация успешна', user, accessToken, refreshToken })
  } catch (err) {
    console.error('Register confirm error:', err)
    res.status(500).json({ error: 'Ошибка при регистрации' })
  }
})

router.post('/register', registerLimiter, async (req, res) => {
  if (process.env.REGISTER_LEGACY_OFF === '1') return res.status(426).json({ error: 'Обновите Centrio до последней версии, чтобы зарегистрироваться', code: 'upgrade_required' })
  try {
    const { email, password, name, referralCode } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
    // Простой, но достаточный формат-чек — раньше сюда мог попасть любой
    // текст (например номер телефона), из-за чего письма (приветственное,
    // подтверждение, сброс пароля) потом молча никогда не доходили.
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Введите корректный email' })
    }
    if (password.length < 8) return res.status(400).json({ error: 'Пароль должен быть минимум 8 символов' })
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
    const passwordHash = await bcrypt.hash(password, 12)

    // Referral link uses the referrer's own user id as the code — no separate
    // code field/table needed. Invalid/missing codes are silently ignored
    // (never block registration over a bad ?ref= param); self-referral is
    // impossible here since the referrer must already exist before this user
    // does. The actual +14 day bonus is granted later, on first real payment
    // — see landing/lib/referral.js.
    let referredById = null
    if (referralCode && typeof referralCode === 'string') {
      const referrer = await prisma.user.findUnique({ where: { id: referralCode }, select: { id: true } })
      if (referrer) referredById = referrer.id
    }

    const user = await prisma.user.create({
      data: { email, name: name || email.split('@')[0], passwordHash, referredById },
      select: { id: true, email: true, name: true, avatar: true, plan: true, planExpiresAt: true, planStartedAt: true, emailVerified: true }
    })
    sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    notifyAdminSignup(user).catch(e => console.error('[admin-push]', e.message))
    attachSignupSource(user.id, req)
    issueAndSendVerification(user).catch(e => console.error('[email] verification send failed:', e.message))
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'password', req)
    res.status(201).json({ message: 'Регистрация успешна', user, accessToken, refreshToken })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Ошибка при регистрации' })
  }
})

// ===== LOGIN =====
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
    // A field without «@» is a login of a team account (2026-11-21); the number of wrong passwords per login is limited.
    const byLogin = typeof email === 'string' && loginAccounts.looksLikeLogin(email)
    const loginKey = byLogin ? loginAccounts.normalizeLogin(email) : null
    if (byLogin) {
      const lock = loginAccounts.loginLock.check(loginKey)
      if (lock.locked) {
        res.set('Retry-After', String(lock.retryAfterSec))
        return res.status(429).json({ error: `Слишком много неверных попыток. Подождите ${Math.ceil(lock.retryAfterSec / 60)} мин. или попросите руководителя сбросить пароль.`, code: 'login_locked' })
      }
    }
    const user = byLogin ? await prisma.user.findUnique({ where: { login: loginKey } }) : await prisma.user.findUnique({ where: { email } })
    if (byLogin && (!user || !user.passwordHash)) {
      loginAccounts.loginLock.fail(loginKey)
      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }
    if (user && !user.passwordHash) {
      const provider = user.googleId ? 'Google' : user.yandexId ? 'Яндекс' : user.mailId ? 'Mail.ru' : user.githubId ? 'GitHub' : null
      return res.status(401).json(provider
        ? { error: `Этот аккаунт создан через ${provider}. Нажмите кнопку «Войти через ${provider}».`, code: 'use_oauth' }
        : { error: 'Для этого аккаунта ещё не задан пароль. Нажмите «Забыли пароль», и мы пришлём ссылку на почту.', code: 'no_password' })
    }
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' })
    if (!user.isActive) return res.status(403).json({ error: 'Аккаунт заблокирован' })
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      if (byLogin) loginAccounts.loginLock.fail(loginKey)
      return res.status(401).json({ error: byLogin ? 'Неверный логин или пароль' : 'Неверный email или пароль' })
    }
    if (byLogin) loginAccounts.loginLock.clear(loginKey)
    // Мобильное приложение шлёт этот заголовок на login — см. AuthRepository
    // в мобильном репозитории. Веб/десктоп его не отправляют, поэтому их
    // поведение не меняется (isMobile остаётся false).
    const isMobile = req.headers['x-client-platform'] === 'mobile'
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, isMobile)
    recordLoginEvent(user.id, 'password', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({
      message: 'Вход выполнен успешно',
      user: withLoginShape({ id: user.id, email: user.email, login: user.login, name: user.name, avatar: user.avatar, plan: user.plan, planExpiresAt: user.planExpiresAt, planStartedAt: user.planStartedAt, emailVerified: user.emailVerified, orgSummary }),
      accessToken,
      refreshToken
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Ошибка при входе' })
  }
})

// ===== FORGOT PASSWORD =====
// Always responds with the same generic message regardless of whether the
// email exists or has a password at all (OAuth-only accounts have no
// passwordHash) — this prevents using this endpoint to enumerate registered
// emails. Token handling mirrors issueAndSendVerification() above: a raw
// single-use token is emailed, only its SHA-256 hash is persisted.
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body
    const generic = { message: 'Если такой email зарегистрирован, на него отправлено письмо со ссылкой для сброса пароля' }
    if (!email || typeof email !== 'string') return res.json(generic)

    const user = await prisma.user.findUnique({ where: { email } })
    // Also allow OAuth-only accounts (passwordHash === null) through this
    // flow — it lets someone who signed up via Google/Yandex set a password
    // for the first time, so they're not stuck with "nothing happens" if
    // they don't remember which provider they used. Still requires owning
    // the inbox (the token is emailed), so this doesn't weaken anything.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hashVerifyToken(token),
          passwordResetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      })
      sendPasswordResetEmail(user, token).catch(e => console.error('[email] password reset send failed:', e.message))
    }
    res.json(generic)
  } catch (err) {
    console.error('Forgot-password error:', err)
    res.status(500).json({ error: 'Не удалось выполнить запрос' })
  }
})

// ===== RESET PASSWORD =====
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ error: 'Токен и новый пароль обязательны' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'Пароль должен быть минимум 8 символов' })

    const user = await prisma.user.findFirst({ where: { passwordResetTokenHash: hashVerifyToken(token) } })
    if (!user || !user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Ссылка недействительна или устарела' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetTokenExpiresAt: null }
    })
    res.json({ message: 'Пароль обновлён' })
  } catch (err) {
    console.error('Reset-password error:', err)
    res.status(500).json({ error: 'Не удалось сбросить пароль' })
  }
})

// ===== REFRESH =====
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'Refresh токен обязателен' })
    const tokens = await refreshTokens(refreshToken, req.headers['user-agent'], req.ip)
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

// ===== LOGOUT =====
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) await prisma.session.deleteMany({ where: { refreshToken } })
    res.json({ message: 'Выход выполнен успешно' })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при выходе' })
  }
})

router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    await prisma.session.deleteMany({ where: { userId: req.user.id } })
    res.json({ message: 'Выход со всех устройств выполнен' })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при выходе' })
  }
})

// ===== ME =====
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, login: true, name: true, avatar: true, plan: true, planExpiresAt: true, planStartedAt: true, emailVerified: true,
        googleId: true, yandexId: true, githubId: true, telegramId: true, vkId: true, mailId: true
      }
    })
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
    const { googleId, yandexId, githubId, telegramId, vkId, mailId, ...rest } = user
    // Аккаунты через OAuth уже подтверждены провайдером на этапе входа — кнопка
    // "подтвердить email" им не нужна в принципе, даже если emailVerified почему-то
    // не проставился (например, старая запись до появления этого поля).
    const hasOAuth = !!(googleId || yandexId || githubId || telegramId || vkId || mailId)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { ...withLoginShape(rest), hasOAuth, orgSummary, betaTester: isBetaTester(user.id) } })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения профиля' })
  }
})

// ===== ATTACH A REAL EMAIL to a team account made with a login and a password (2026-11-21) =====
// The person types a mailbox, gets a 6-digit code, enters it: the stand-in address is replaced by the real one, the login keeps working.
const attachPending = new Map() // userId -> { email, codeHash, expiresAt, attempts, sentAt }
const attachLimiter = rateLimit({ name: 'email-attach', windowMs: 60 * 60 * 1000, max: 12, keyGenerator: (req) => (req.headers.authorization || req.ip || 'x').slice(-40) })
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attachPending) if (entry.expiresAt < now) attachPending.delete(key)
}, 60 * 1000).unref()

async function loginOnlyUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, login: true } })
  return user && loginAccounts.isLoginOnlyEmail(user.email) ? user : null
}

router.post('/email/attach/start', attachLimiter, authMiddleware, async (req, res) => {
  try {
    const user = await loginOnlyUser(req.user.id)
    if (!user) return res.status(409).json({ error: 'К этому аккаунту уже привязана почта' })
    const email = readRegEmail(req.body)
    if (!email) return res.status(400).json({ error: 'Введите корректный email' })
    const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (taken) return res.status(409).json({ error: 'Эта почта уже используется в другом аккаунте Centrio' })
    const previous = attachPending.get(user.id)
    if (previous && Date.now() - previous.sentAt < REG_RESEND_GAP_MS) {
      const wait = Math.ceil((REG_RESEND_GAP_MS - (Date.now() - previous.sentAt)) / 1000)
      return res.status(429).json({ error: `Код уже отправлен. Повторить можно через ${wait} с`, retryAfter: wait })
    }
    const entry = { email, codeHash: '', expiresAt: 0, attempts: 0, sentAt: 0 }
    if (!(await sendPendingCode(entry, sendEmailAttachCodeEmail))) return res.status(502).json({ error: 'Не удалось отправить письмо с кодом. Проверьте адрес и попробуйте ещё раз.' })
    attachPending.set(user.id, entry)
    res.json({ pending: true, email, expiresInSec: REG_CODE_TTL_MS / 1000, resendInSec: REG_RESEND_GAP_MS / 1000 })
  } catch (err) {
    console.error('Email attach start error:', err)
    res.status(500).json({ error: 'Не удалось отправить код' })
  }
})

router.post('/email/attach/confirm', attachLimiter, authMiddleware, async (req, res) => {
  try {
    const user = await loginOnlyUser(req.user.id)
    if (!user) return res.status(409).json({ error: 'К этому аккаунту уже привязана почта' })
    const code = req.body && typeof req.body.code === 'string' ? req.body.code.replace(/\s/g, '') : ''
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Введите 6 цифр из письма' })
    const entry = attachPending.get(user.id)
    if (!entry || entry.expiresAt < Date.now()) {
      attachPending.delete(user.id)
      return res.status(400).json({ error: 'Код истёк. Запросите новый.', code: 'code_expired' })
    }
    entry.attempts += 1
    const given = Buffer.from(hashRegCode(entry.email.toLowerCase(), code))
    const wanted = Buffer.from(entry.codeHash)
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
      if (entry.attempts >= REG_MAX_ATTEMPTS) {
        attachPending.delete(user.id)
        return res.status(429).json({ error: 'Слишком много неверных попыток. Запросите новый код.', code: 'code_locked' })
      }
      return res.status(400).json({ error: `Неверный код. Осталось попыток: ${REG_MAX_ATTEMPTS - entry.attempts}`, code: 'code_wrong' })
    }
    try {
      await prisma.user.update({ where: { id: user.id }, data: { email: entry.email, emailVerified: true } })
    } catch (err) {
      if (err && err.code === 'P2002') { attachPending.delete(user.id); return res.status(409).json({ error: 'Эта почта уже используется в другом аккаунте Centrio' }) }
      throw err
    }
    attachPending.delete(user.id)
    res.json({ message: 'Почта привязана', user: withLoginShape({ id: user.id, email: entry.email, login: user.login, emailVerified: true }) })
  } catch (err) {
    console.error('Email attach confirm error:', err)
    res.status(500).json({ error: 'Не удалось привязать почту' })
  }
})

// ===== EMAIL VERIFICATION =====

// POST /api/auth/verify-email/send — dashboard "Отправить письмо" button.
// Rate-limited per IP: this triggers a real Resend API call per request.
router.post('/verify-email/send', verifyEmailSendLimiter, authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' })
    if (user.emailVerified) return res.json({ message: 'Email уже подтверждён', alreadyVerified: true })

    await issueAndSendVerification(user)
    res.json({ message: 'Письмо для подтверждения отправлено' })
  } catch (err) {
    console.error('verify-email/send error:', err)
    res.status(500).json({ error: 'Ошибка отправки письма' })
  }
})

// GET /api/auth/verify-email?token=... — the link clicked from the inbox.
// Public (no authMiddleware — the token itself IS the credential, same
// pattern as a password-reset link). Always redirects back to the web
// dashboard rather than returning JSON, since this is only ever opened
// directly in a browser tab from an email client.
router.get('/verify-email', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  const fail = () => res.redirect(`${process.env.FRONTEND_URL}/dashboard?emailVerified=0`)
  if (!token) return fail()
  try {
    const user = await prisma.user.findFirst({ where: { emailVerifyTokenHash: hashVerifyToken(token) } })
    if (!user || !user.emailVerifyTokenExpiresAt || user.emailVerifyTokenExpiresAt < new Date()) {
      return fail()
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyTokenHash: null, emailVerifyTokenExpiresAt: null }
    })
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?emailVerified=1`)
  } catch (err) {
    console.error('verify-email error:', err)
    fail()
  }
})

// ===== GOOGLE =====
router.get('/google', (req, res) => {
  const from = req.query.from || ''
  const state = from === 'desktop' ? issueDesktopState(req.query.client_nonce) : (from === 'mobile' ? issueDesktopState(req.query.client_nonce, 'mobile') : undefined)
  const url = googleWebClient.generateAuthUrl({
    access_type: 'offline', scope: ['email', 'profile'], prompt: 'consent',
    state
  })
  res.redirect(url)
})

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
    const { tokens } = await googleWebClient.getToken(code)
    googleWebClient.setCredentials(tokens)
    const ticket  = await googleWebClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture } = payload
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar: picture, googleId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, avatar: picture } })
    }
    if (peekOAuthKind(req.query.state) === 'mobile') {
      const nonce = consumeDesktopState(req.query.state)
      const code = issueMobileCode(user.id, 'google', nonce)
      return res.redirect(`centriomobile://oauth/yandex?code=${code}&state=${encodeURIComponent(nonce || '')}`)
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'google', req)
    const clientNonce = consumeDesktopState(req.query.state)
    if (clientNonce !== null) {
      return res.redirect(`centrio://auth?accessToken=${accessToken}&refreshToken=${refreshToken}&state=${encodeURIComponent(clientNonce)}`)
    }
    res.redirect(`${process.env.FRONTEND_URL}/auth/success?accessToken=${accessToken}&refreshToken=${refreshToken}`)
  } catch (err) {
    console.error('Google callback error:', err)
    if (peekOAuthKind(req.query.state) === 'mobile') {
      const nonce = consumeDesktopState(req.query.state)
      return res.redirect(`centriomobile://oauth/yandex?error=google_failed&state=${encodeURIComponent(nonce || '')}`)
    }
    if (consumeDesktopState(req.query.state) !== null) {
      return res.redirect('centrio://auth?error=google_failed')
    }
    res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
  }
})

router.post('/google/electron-code', async (req, res) => {
  try {
    const { code, redirectUri } = req.body
    if (!code) return res.status(400).json({ error: 'code обязателен' })
    const { tokens } = await googleDesktopClient.getToken({
      code, redirect_uri: redirectUri || 'http://localhost:9842/oauth/google/callback'
    })
    googleDesktopClient.setCredentials(tokens)
    const ticket  = await googleDesktopClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_DESKTOP_CLIENT_ID })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture } = payload
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar: picture, googleId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, avatar: picture } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'google', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Google electron-code error:', err)
    res.status(401).json({ error: 'Ошибка Google авторизации' })
  }
})

// ===== GOOGLE (mobile) =====
// Flutter's google_sign_in plugin, configured with serverClientId =
// GOOGLE_CLIENT_ID (the same "Web" OAuth client the browser flow above
// already uses), returns an idToken audienced to that client directly — no
// authorization-code exchange needed, unlike the desktop's
// /google/electron-code flow above. Requires the Android app's SHA-1
// fingerprint to be registered against this OAuth client in Google Cloud
// Console (a one-time console step, not code — see the mobile app's own
// setup docs).
router.post('/google/mobile', async (req, res) => {
  try {
    const { idToken } = req.body
    if (!idToken) return res.status(400).json({ error: 'idToken обязателен' })
    const ticket = await googleWebClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture } = payload
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar: picture, googleId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, avatar: picture } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, true)
    recordLoginEvent(user.id, 'google', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Google mobile error:', err)
    res.status(401).json({ error: 'Ошибка Google авторизации' })
  }
})

// ===== YANDEX =====
router.get('/yandex', (req, res) => {
  const from = req.query.from || ''
  const stateParam = from === 'desktop' ? `&state=${issueDesktopState(req.query.client_nonce)}` : (from === 'mobile' ? `&state=${issueDesktopState(req.query.client_nonce, 'mobile')}` : '')
  const url = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${process.env.YANDEX_CLIENT_ID}&redirect_uri=${process.env.API_URL}/api/auth/yandex/callback${stateParam}`
  res.redirect(url)
})

router.get('/yandex/callback', async (req, res) => {
  try {
    const { code } = req.query
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
    const tokenRes = await axios.post('https://oauth.yandex.ru/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env.YANDEX_CLIENT_ID, client_secret: process.env.YANDEX_CLIENT_SECRET }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    const { access_token } = tokenRes.data
    const userRes = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${access_token}` }, params: { format: 'json' }
    })
    const { id: yandexId, default_email: email, real_name: name, default_avatar_id } = userRes.data
    const avatar = default_avatar_id ? `https://avatars.yandex.net/get-yapic/${default_avatar_id}/islands-200` : null
    let user = await prisma.user.findFirst({ where: { OR: [{ yandexId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, yandexId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.yandexId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { yandexId, avatar } })
    }
    if (peekOAuthKind(req.query.state) === 'mobile') {
      const nonce = consumeDesktopState(req.query.state)
      const code = issueMobileCode(user.id, 'yandex', nonce)
      return res.redirect(`centriomobile://oauth/yandex?code=${code}&state=${encodeURIComponent(nonce || '')}`)
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'yandex', req)
    const clientNonce = consumeDesktopState(req.query.state)
    if (clientNonce !== null) {
      return res.redirect(`centrio://auth?accessToken=${accessToken}&refreshToken=${refreshToken}&state=${encodeURIComponent(clientNonce)}`)
    }
    res.redirect(`${process.env.FRONTEND_URL}/auth/success?accessToken=${accessToken}&refreshToken=${refreshToken}`)
  } catch (err) {
    console.error('Yandex callback error:', err)
    if (peekOAuthKind(req.query.state) === 'mobile') {
      const nonce = consumeDesktopState(req.query.state)
      return res.redirect(`centriomobile://oauth/yandex?error=yandex_failed&state=${encodeURIComponent(nonce || '')}`)
    }
    if (consumeDesktopState(req.query.state) !== null) {
      return res.redirect('centrio://auth?error=yandex_failed')
    }
    res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
  }
})

router.post('/yandex/electron', async (req, res) => {
  try {
    const { accessToken: yandexToken } = req.body
    if (!yandexToken) return res.status(400).json({ error: 'accessToken обязателен' })
    const userRes = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${yandexToken}` }, params: { format: 'json' }
    })
    const { id: yandexId, default_email: email, real_name: name, default_avatar_id } = userRes.data
    const avatar = default_avatar_id ? `https://avatars.yandex.net/get-yapic/${default_avatar_id}/islands-200` : null
    let user = await prisma.user.findFirst({ where: { OR: [{ yandexId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, yandexId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.yandexId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { yandexId, avatar } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'yandex', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Yandex electron error:', err)
    res.status(401).json({ error: 'Ошибка Яндекс авторизации' })
  }
})

// ===== YANDEX (mobile) =====
// Mirrors /yandex/electron exactly: the Flutter app runs Yandex's implicit
// grant flow itself (system browser via flutter_web_auth_2, hitting
// oauth.yandex.ru/authorize?response_type=token with the mobile app's own
// registered redirect URI — a Yandex OAuth console setting, not code) and
// hands the resulting Yandex accessToken here for verification.
router.post('/yandex/mobile', async (req, res) => {
  try {
    const { accessToken: yandexToken } = req.body
    if (!yandexToken) return res.status(400).json({ error: 'accessToken обязателен' })
    const userRes = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${yandexToken}` }, params: { format: 'json' }
    })
    const { id: yandexId, default_email: email, real_name: name, default_avatar_id } = userRes.data
    const avatar = default_avatar_id ? `https://avatars.yandex.net/get-yapic/${default_avatar_id}/islands-200` : null
    let user = await prisma.user.findFirst({ where: { OR: [{ yandexId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, yandexId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.yandexId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { yandexId, avatar } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, true)
    recordLoginEvent(user.id, 'yandex', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Yandex mobile error:', err)
    res.status(401).json({ error: 'Ошибка Яндекс авторизации' })
  }
})

// POST /api/auth/mobile-exchange { code, nonce } — the phone app trades the one-time code it got from the browser (with the
// secret nonce it made itself) for tokens. The session is created HERE, by the app's own request, so it is a phone session
// with the phone's identity (device id, model, app version) instead of an anonymous browser one.
const mobileExchangeLimiter = rateLimit({ name: 'mobile-exchange', windowMs: 10 * 60 * 1000, max: 30 })
router.post('/mobile-exchange', mobileExchangeLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || '')
    const nonce = String(req.body?.nonce || '')
    const entry = mobileCodeStore.get(code)
    mobileCodeStore.delete(code)
    if (!entry || entry.expiresAt < Date.now() || !nonce || entry.nonce !== nonce) {
      return res.status(401).json({ error: 'Код входа недействителен или устарел. Попробуйте ещё раз.' })
    }
    const user = await prisma.user.findUnique({ where: { id: entry.userId } })
    if (!user || user.isActive === false) return res.status(401).json({ error: 'Аккаунт не найден или заблокирован' })
    const accessToken = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, true, deviceMetaFromReq(req))
    recordLoginEvent(user.id, entry.provider, req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(() => null)
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Mobile exchange error:', err)
    res.status(500).json({ error: 'Не удалось завершить вход' })
  }
})

// ===== GITHUB =====
router.get('/github', (req, res) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&allow_signup=true`
  res.redirect(url)
})

router.post('/github/electron-code', async (req, res) => {
  try {
    const { code, redirectUri } = req.body
    if (!code) return res.status(400).json({ error: 'code обязателен' })

    // Меняем code на access_token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id:     process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  redirectUri || 'http://localhost:9843/oauth/github/callback'
      },
      { headers: { Accept: 'application/json' } }
    )

    const { access_token, error } = tokenRes.data
    if (error || !access_token) {
      return res.status(401).json({ error: error || 'Не удалось получить токен GitHub' })
    }

    // Получаем профиль
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': 'Centrio' }
    })

    let { id: githubId, email, name, avatar_url: avatar, login } = userRes.data
    githubId = githubId.toString()
    name = name || login

    // Если email не публичный — запрашиваем отдельно
    if (!email) {
      const emailRes = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': 'Centrio' }
      })
      const primary = emailRes.data.find(e => e.primary && e.verified)
      email = primary?.email || `github_${githubId}@centrio.me`
    }

    let user = await prisma.user.findFirst({ where: { OR: [{ githubId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, avatar, githubId, emailVerified: true }
      })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.githubId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { githubId, avatar }
      })
    }

    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'github', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary },
      accessToken,
      refreshToken
    })
  } catch (err) {
    console.error('GitHub electron-code error:', err)
    res.status(401).json({ error: 'Ошибка GitHub авторизации' })
  }
})

// ===== TELEGRAM =====
router.get('/telegram/electron', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://oauth.telegram.org; frame-src https://oauth.telegram.org;"
  )
  const callback = req.query.callback || ''
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
  const sep = callback.includes('?') ? '&' : '?'
  res.send('<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><title>Centrio — Войти через Telegram</title>' +
    '<style>body{background:#17212b;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#fff}h3{margin-bottom:24px;font-weight:400;font-size:20px}</style>' +
    '</head><body><h3>Войти через Telegram</h3>' +
    '<script>function onTelegramAuth(u){var p=new URLSearchParams();Object.keys(u).forEach(function(k){p.set(k,u[k])});window.location.href="' + callback + sep + '"+p.toString()}</script>' +
    '<script async src="https://telegram.org/js/telegram-widget.js?22"' +
    ' data-telegram-login="' + botUsername + '"' +
    ' data-size="large" data-radius="5"' +
    ' data-onauth="onTelegramAuth(user)"></script>' +
    '</body></html>')
})


router.post('/telegram/electron', async (req, res) => {
  try {
    const { hash, ...rest } = req.body
    if (!hash) return res.status(400).json({ error: 'hash обязателен' })

    const dataCheckString = Object.keys(rest).sort().map(k => k + '=' + rest[k]).join('\n')
    const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    // Timing-safe compare (mirrors the FRIDE webhook signature check in payments.js)
    const hmacBuf = Buffer.from(String(hmac), 'hex')
    const hashBuf = Buffer.from(String(hash), 'hex')
    const isValidHmac = hmacBuf.length === hashBuf.length && crypto.timingSafeEqual(hmacBuf, hashBuf)
    if (!isValidHmac) return res.status(401).json({ error: 'Невалидная подпись Telegram' })
    if (Date.now() / 1000 - Number(rest.auth_date) > 86400) return res.status(401).json({ error: 'Данные авторизации устарели' })

    const telegramId = String(rest.id)
    const name = [rest.first_name, rest.last_name].filter(Boolean).join(' ') || 'Telegram User'
    const avatar = rest.photo_url || null
    const email = 'tg_' + telegramId + '@centrio.me'

    let user = await prisma.user.findFirst({ where: { telegramId } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, telegramId, emailVerified: true } })
      user = await grantSignupTrial(user)
      attachSignupSource(user.id, req)
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (avatar && avatar !== user.avatar) {
      user = await prisma.user.update({ where: { id: user.id }, data: { avatar } })
    }

    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'telegram', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary },
      accessToken,
      refreshToken
    })
  } catch (err) {
    console.error('Telegram electron error:', err)
    res.status(401).json({ error: 'Ошибка Telegram авторизации' })
  }
})

module.exports = router
module.exports.recordLoginEvent = recordLoginEvent
