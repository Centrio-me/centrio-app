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
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const prisma = require('../utils/prisma')
const { generateAccessToken, generateRefreshToken, refreshTokens } = require('../utils/tokens')
const authMiddleware = require('../middleware/auth')
const { OAuth2Client } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')
const { sendWelcomeEmail, sendVerificationEmail } = require('../lib/email')
const { rateLimit } = require('../middleware/rateLimit')
// Корпоративная версия (TEAM) — Phase 1. orgSummary is null for users who
// aren't in an organization, so this is a strict additive change: existing
// clients that don't know about the field simply ignore it.
const { getOrgSummaryForUser } = require('../lib/org')

// ── Email verification ──────────────────────────────────────────────────
// Only password-registered users start unverified — every OAuth provider
// branch below already sets emailVerified: true at creation (the provider
// itself already confirmed the address), so this flow only ever applies to
// the /register path and to re-sends triggered from the dashboard.
const EMAIL_VERIFY_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour
const verifyEmailSendLimiter = rateLimit({ name: 'verify-email-send', windowMs: 60 * 60 * 1000, max: 5 })

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

function issueDesktopState(clientNonce) {
  const state = crypto.randomBytes(16).toString('hex')
  oauthStateStore.set(state, {
    clientNonce: typeof clientNonce === 'string' ? clientNonce.slice(0, 256) : '',
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

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, referralCode } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Неверный email или пароль' })
    if (!user.isActive) return res.status(403).json({ error: 'Аккаунт заблокирован' })
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль' })
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    recordLoginEvent(user.id, 'password', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({
      message: 'Вход выполнен успешно',
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, planExpiresAt: user.planExpiresAt, planStartedAt: user.planStartedAt, emailVerified: user.emailVerified, orgSummary },
      accessToken,
      refreshToken
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Ошибка при входе' })
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
        id: true, email: true, name: true, avatar: true, plan: true, planExpiresAt: true, planStartedAt: true, emailVerified: true,
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
    res.json({ user: { ...rest, hasOAuth, orgSummary } })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения профиля' })
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
  const state = from === 'desktop' ? issueDesktopState(req.query.client_nonce) : undefined
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
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, avatar: picture } })
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

// ===== YANDEX =====
router.get('/yandex', (req, res) => {
  const from = req.query.from || ''
  const stateParam = from === 'desktop' ? `&state=${issueDesktopState(req.query.client_nonce)}` : ''
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
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.yandexId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { yandexId, avatar } })
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
