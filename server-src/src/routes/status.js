'use strict'
// The public status page's data: no account needed, cached for a short time.
const router = require('express').Router()
const { rateLimit } = require('../middleware/rateLimit')
const store = require('../lib/status-store')
const monitor = require('../cron/statusMonitor')

const limiter = rateLimit({ name: 'status-read', windowMs: 60 * 1000, max: 60 })
let cache = { at: 0, body: null }

router.get('/', limiter, (req, res) => {
    const now = Date.now()
    if (!cache.body || now - cache.at > 20000) {
        cache = { at: now, body: store.publicStatus(monitor.getState(), store.loadNotices(), now) }
    }
    res.setHeader('Cache-Control', 'public, max-age=20')
    res.json(cache.body)
})

module.exports = router
