const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '/var/www/centrio-api/uploads/avatars')
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg'
        cb(null, `${req.user.id}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true)
        else cb(new Error('Только изображения'))
    }
})

// multer errors (file too large, fileFilter rejection) surface via the
// callback passed to upload.single(), NOT via this route's own try/catch —
// they happen inside the multer middleware itself, before the handler below
// ever runs. Without catching them here explicitly, they'd fall through to
// Express's default error handler (an HTML page / bare 500), not the clean
// JSON error shape the dashboard's upload UI expects.
router.post('/avatar', authMiddleware, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (!err) return next()
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл слишком большой (максимум 5 МБ)' })
        }
        return res.status(400).json({ error: err.message || 'Не удалось загрузить файл' })
    })
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' })
        const avatarUrl = `${process.env.API_URL}/uploads/avatars/${req.file.filename}`
        await prisma.user.update({
            where: { id: req.user.id },
            data: { avatar: avatarUrl }
        })
        res.json({ avatar: avatarUrl })
    } catch (err) {
        console.error('Upload error:', err)
        res.status(500).json({ error: 'Ошибка загрузки' })
    }
})

module.exports = router
