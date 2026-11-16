'use strict'
// The owner's side: the list with numbers, create, change, switch off, delete, and a picture upload.
// Mounted in admin.js after adminAuth, so every route here is behind the admin session.
const router = require('express').Router()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const store = require('../lib/announcements')

const UPLOAD_DIR = '/var/www/centrio-api/uploads/announcements'
const PUBLIC_BASE = 'https://api.centrio.me/uploads/announcements/'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

const fail = (res, r) => res.status(r.notFound ? 404 : 400).json({ error: r.error })

router.get('/announcements', (req, res) => res.json({ ok: true, items: store.list() }))

router.post('/announcements', (req, res) => {
    const r = store.create(req.body)
    return r.ok ? res.json({ ok: true, item: r.value }) : fail(res, r)
})

router.put('/announcements/:id', (req, res) => {
    const r = store.update(req.params.id, req.body)
    return r.ok ? res.json({ ok: true, item: r.value }) : fail(res, r)
})

router.delete('/announcements/:id', (req, res) => {
    return store.remove(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Окно не найдено' })
})

// body: { dataUrl: 'data:image/png;base64,...' } -> { url }
router.post('/announcements-image', (req, res) => {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body && req.body.dataUrl) || ''))
    if (!m) return res.status(400).json({ error: 'Нужна картинка PNG, JPG, WebP или GIF' })
    const bytes = Buffer.from(m[2], 'base64')
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Картинка больше 2 МБ' })
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${TYPES[m[1]]}`
    try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true })
        fs.writeFileSync(path.join(UPLOAD_DIR, name), bytes)
        res.json({ ok: true, url: PUBLIC_BASE + name })
    } catch (err) {
        console.error('[announcements] image:', err.message)
        res.status(500).json({ error: 'Не удалось сохранить картинку' })
    }
})

module.exports = router
