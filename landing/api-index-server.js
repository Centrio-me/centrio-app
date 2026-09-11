const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001
app.set('trust proxy', 1)

// Middleware
app.use(helmet())

// Reject oversized bodies on the Telegram webhook before the global 10mb
// json parser (sized for upload-ish endpoints) buffers them — real Telegram
// updates are a few KB. Runs pre-parse so it can't be bypassed by whatever
// ends up handling the route.
app.use('/api/telegram/webhook', (req, res, next) => {
  const len = parseInt(req.headers['content-length'] || '0', 10)
  if (len > 262144) return res.status(413).json({ error: 'Payload too large' })
  next()
})

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// CORS
// BUGFIX (2026-09-11, "Сообщения с сайта не отправляются" — live user
// report, root-caused after the widget-token fix didn't resolve it): this
// strict allowlist applied to EVERY /api/* route, including the new public
// widget endpoints (routes/widget.js) — which, by design, must be callable
// from an ARBITRARY customer website (e.g. print-empire.ru), not just
// centrio.me. A request from any other origin never got an
// Access-Control-Allow-Origin header, so the browser blocked the fetch
// client-side before it ever reached this server — widget.js's fetch calls
// just silently rejected (caught by an empty .catch()), which is exactly
// "nothing happens, no error shown" the user described. /api/widget gets
// its own permissive CORS (no cookies/credentials involved there — it's
// public, token-in-body auth, the same posture Intercom/Jivo-style widget
// APIs use) and is excluded from the strict one below.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/widget')) return next() // handled by the permissive CORS mounted on that path below
  return cors({
    origin: [
      process.env.FRONTEND_URL,'https://centrio.me','https://www.centrio.me',
      'http://localhost:3000',
      'app://.'  // Electron
    ],
    credentials: true
  })(req, res, next)
})
app.use('/api/widget', cors({ origin: true, credentials: false }))

// Rate limiting — защита публичных/анонимных маршрутов от злоупотреблений.
// /api/admin специально исключён (skip): это не анонимный трафик — каждый
// запрос уже требует TOTP-сессионный токен (см. adminAuth в routes/admin.js),
// а единственный клиент — Android-приложение одного администратора, которое
// само опрашивает несколько эндпоинтов параллельно (дашборд) и в фоне
// (AdminMonitorService, каждые ~30с) — общий лимит 100 запросов/15 минут на
// весь /api/ бил именно по этому легитимному трафику, а не по атакам.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Слишком много запросов, попробуйте позже' },
  skip: (req) => req.path.startsWith('/admin')
})
app.use('/api/', limiter)

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/user', require('./routes/user'))
app.use('/api/workspaces', require('./routes/workspaces'))
app.use('/api/payments', require('./routes/payments'))
app.use('/api/stats', require('./routes/stats'))
app.use('/api/sync', require('./routes/sync'))
app.use('/api/upload', require('./routes/upload'))
app.use('/api/admin',  require('./routes/admin'))
app.use('/api/visitors', require('./routes/visitors'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/contact', require('./routes/contact'))
app.use('/api/tickets', require('./routes/tickets'))
app.use('/api/notes', require('./routes/notes'))
app.use('/api/assistant', require('./routes/assistant'))
app.use('/api/telegram', require('./routes/telegram-webhook'))
// Корпоративная версия (TEAM) — Phase 1 (см. Obsidian → Centrio → Корпоративная версия)
app.use('/api/org', require('./routes/org'))
// Онлайн-чат для сайта клиента (2026-09-11, Pro-фича) — /chat-sites требует
// авторизации Centrio-аккаунтом (управление из приложения), /widget не
// требует вообще (публичный виджет на чужом сайте) — см. routes/widget.js.
app.use('/api/chat-sites', require('./routes/chat-sites'))
app.use('/api/widget', require('./routes/widget'))
app.use('/uploads', require('express').static('/var/www/centrio-api/uploads'))

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
})

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Внутренняя ошибка сервера' })
})

// AutoRenew cron
try {
  const { startAutoRenewCron } = require('./cron/autoRenew')
  startAutoRenewCron()
} catch (e) { console.error('AutoRenew cron error:', e.message) }

app.listen(PORT, () => {
  console.log(`✅ Centrio API запущен на порту ${PORT}`)
})

module.exports = app
