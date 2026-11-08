// /api/org-device — a device fetches and confirms commands meant for it (TEAM control, 2026-11-08).
// Works with the user's token, or — after the person was removed from the team — with the device's
// own key: X-Device-Key (OrgDeviceKey.id) + X-Device-Proof (ECDSA P-256 over proofMessage()).
const router = require('express').Router()
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const { rateLimit } = require('../middleware/rateLimit')
const { verifyDeviceProof } = require('../lib/team-commands')
const { emitOrgEvent } = require('../lib/team-events')

const deviceLimiter = rateLimit({ name: 'org-device', windowMs: 60 * 1000, max: 30, keyGenerator: (req) => String(req.headers['x-device-key'] || req.ip) })

function userIdFromToken(req) {
    try {
        const header = req.headers.authorization || ''
        if (!header.startsWith('Bearer ')) return null
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] })
        return decoded?.userId || null
    } catch {
        return null
    }
}

// Which command rows this caller may see: { userId, deviceKeyIds: [...] } or null.
async function resolveCaller(req) {
    const deviceKeyId = req.headers['x-device-key'] ? String(req.headers['x-device-key']).slice(0, 64) : null
    const device = deviceKeyId ? await prisma.orgDeviceKey.findUnique({ where: { id: deviceKeyId } }) : null
    const tokenUser = userIdFromToken(req)

    if (tokenUser) {
        const ids = [`user:${tokenUser}`]
        if (device && device.userId === tokenUser) ids.push(device.id)
        return { userId: tokenUser, deviceKeyIds: ids }
    }
    if (device && verifyDeviceProof({ publicKey: device.publicKey, deviceKeyId: device.id, proof: req.headers['x-device-proof'], now: new Date() })) {
        return { userId: device.userId, deviceKeyIds: [device.id, `user:${device.userId}`] }
    }
    return null
}

router.get('/commands', deviceLimiter, async (req, res) => {
    try {
        const caller = await resolveCaller(req)
        if (!caller) return res.status(401).json({ success: false, error: 'Устройство не опознано' })
        const rows = await prisma.orgCommand.findMany({
            where: { userId: caller.userId, deviceKeyId: { in: caller.deviceKeyIds }, doneAt: null },
            orderBy: { createdAt: 'asc' },
            take: 50,
            select: { id: true, orgId: true, kind: true, payload: true, createdAt: true }
        })
        res.json({ success: true, data: rows })
    } catch (err) {
        console.error('Org device commands error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка получения команд' })
    }
})

router.post('/commands/:id/done', deviceLimiter, async (req, res) => {
    try {
        const caller = await resolveCaller(req)
        if (!caller) return res.status(401).json({ success: false, error: 'Устройство не опознано' })
        const cmd = await prisma.orgCommand.findUnique({ where: { id: req.params.id } })
        if (!cmd || cmd.userId !== caller.userId || !caller.deviceKeyIds.includes(cmd.deviceKeyId)) {
            return res.status(404).json({ success: false, error: 'Команда не найдена' })
        }
        if (!cmd.doneAt) {
            await prisma.orgCommand.update({ where: { id: cmd.id }, data: { doneAt: new Date() } })
            emitOrgEvent(cmd.orgId, 'command', { userId: cmd.userId, commandId: cmd.id, kind: cmd.kind, done: true })
        }
        res.json({ success: true })
    } catch (err) {
        console.error('Org device command done error:', err.message)
        res.status(500).json({ success: false, error: 'Ошибка подтверждения команды' })
    }
})

module.exports = router
