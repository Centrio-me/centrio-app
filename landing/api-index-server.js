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
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,'https://centrio.me','https://www.centrio.me',
    'http://localhost:3000',
    'app://.'  // Electron
  ],
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Слишком много запросов, попробуйте позже' }
})
app.use('/api/', limiter)

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/user', require('./routes/user'))
app.use('/api/workspaces', require('./routes/workspaces'))
app.use('/api/payments', require('./routes/payments'))
app.use('/api/stats', require('./routes/stats'))
app.use('/api/sync', require('./routes/sync'))
app.use('/api/unread-summary', require('./routes/unread'))
app.use('/api/upload', require('./routes/upload'))
app.use('/api/admin',  require('./routes/admin'))
app.use('/api/visitors', require('./routes/visitors'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/contact', require('./routes/contact'))
app.use('/api/tickets', require('./routes/tickets'))
app.use('/api/telegram', require('./routes/telegram-webhook'))
// Корпоративная версия (TEAM) — Phase 1 (см. Obsidian → Centrio → Корпоративная версия)
app.use('/api/org', require('./routes/org'))
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
