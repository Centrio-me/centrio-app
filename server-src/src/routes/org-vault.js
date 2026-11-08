// Team password vault (2026-10-05). End-to-end design: the server only ever stores ciphertext.
//
//  - Every desktop install generates its own ECDH P-256 key pair and keeps the PRIVATE key in the OS secure
//    storage (Electron safeStorage: DPAPI on Windows, Keychain on macOS) — the same protection browsers use for
//    saved passwords. Only the PUBLIC key is registered here (POST /device-keys).
//  - The owner/admin encrypts a login+password IN THE BROWSER for each of the employee's device public keys
//    (ECIES: ephemeral ECDH + HKDF-SHA256 + AES-256-GCM, bound to org|assignment|device with AAD) and uploads
//    only the resulting blobs (PUT /credentials). The plaintext never reaches this server.
//  - The employee's app downloads the blob for ITS device, decrypts it in the main process and fills the login
//    form of the matching site. The password is never shown to the employee.
// Nobody (including the owner) can read a saved password back through the API: there is no endpoint for it.
const router = require('express').Router()
const crypto = require('crypto')
const prisma = require('../utils/prisma')
const authMiddleware = require('../middleware/auth')
const { requireOrgRole } = require('../lib/org')
const { rateLimit } = require('../middleware/rateLimit')

const MAX_DEVICE_KEYS_PER_USER = 10
const MAX_BLOB_BYTES = 4096
const byUser = (req) => req.user?.id || req.ip

const deviceKeyLimiter = rateLimit({ name: 'vault-device-key', windowMs: 60 * 60 * 1000, max: 30, keyGenerator: byUser })
const credentialSetLimiter = rateLimit({ name: 'vault-credential-set', windowMs: 60 * 60 * 1000, max: 120, keyGenerator: byUser })
const credentialFetchLimiter = rateLimit({ name: 'vault-credential-fetch', windowMs: 10 * 60 * 1000, max: 60, keyGenerator: byUser })

async function audit(orgId, actorUserId, action, meta) {
  try {
    await prisma.orgAuditLog.create({ data: { orgId, actorUserId, action, metaJson: meta ?? undefined } })
  } catch (err) {
    console.error('[vault] audit write failed:', err.message)
  } finally {
    const evt = require('../lib/team-events').eventForAudit(action, meta)
    if (evt) require('../lib/team-events').emitOrgEvent(orgId, evt.type, evt.data)
  }
}

function isValidP256Spki(b64) {
  try {
    if (typeof b64 !== 'string' || b64.length > 400) return false
    const der = Buffer.from(b64, 'base64')
    if (der.length < 80 || der.length > 120) return false
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1'
  } catch {
    return false
  }
}

// A blob is { v: 1, epk: <65-byte raw P-256 point, b64>, iv: <12 bytes, b64>, ct: <AES-GCM ciphertext+tag, b64> }.
function normalizeBlob(raw) {
  try {
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!blob || blob.v !== 1) return null
    const epk = Buffer.from(String(blob.epk || ''), 'base64')
    const iv = Buffer.from(String(blob.iv || ''), 'base64')
    const ct = Buffer.from(String(blob.ct || ''), 'base64')
    if (epk.length !== 65 || epk[0] !== 4 || iv.length !== 12 || ct.length < 17 || ct.length > 2048) return null
    const out = JSON.stringify({ v: 1, epk: epk.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') })
    return Buffer.byteLength(out) <= MAX_BLOB_BYTES ? out : null
  } catch {
    return null
  }
}

// ── POST /api/org/:orgId/device-keys ── a member registers THIS device's public key ─────────────────────
router.post('/:orgId/device-keys', deviceKeyLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || '').trim().slice(0, 100)
    const publicKey = String(req.body?.publicKey || '').trim()
    const name = req.body?.name ? String(req.body.name).trim().slice(0, 80) : null
    if (!deviceId || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) return res.status(400).json({ success: false, error: 'Некорректный идентификатор устройства' })
    if (!isValidP256Spki(publicKey)) return res.status(400).json({ success: false, error: 'Некорректный ключ устройства' })

    const orgId = req.params.orgId
    const existing = await prisma.orgDeviceKey.findUnique({ where: { userId_deviceId: { userId: req.user.id, deviceId } } })
    if (existing && existing.orgId === orgId && existing.publicKey === publicKey) {
      await prisma.orgDeviceKey.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), name: name || existing.name } })
      return res.json({ success: true, data: { id: existing.id, changed: false } })
    }
    if (!existing) {
      const count = await prisma.orgDeviceKey.count({ where: { userId: req.user.id, orgId } })
      if (count >= MAX_DEVICE_KEYS_PER_USER) return res.status(409).json({ success: false, error: 'Слишком много устройств. Удалите ненужные в личном кабинете.' })
    }
    // A new key for a known device (reinstall / reset): every blob made for the old key is useless — drop them.
    let row
    if (existing) {
      await prisma.orgCredential.deleteMany({ where: { deviceKeyId: existing.id } })
      row = await prisma.orgDeviceKey.update({ where: { id: existing.id }, data: { orgId, publicKey, name: name || existing.name, lastSeenAt: new Date() } })
    } else {
      row = await prisma.orgDeviceKey.create({ data: { orgId, userId: req.user.id, deviceId, publicKey, name } })
    }
    await audit(orgId, req.user.id, 'vault.device', { deviceId, replaced: !!existing })
    res.json({ success: true, data: { id: row.id, changed: true } })
  } catch (err) {
    console.error('vault device-key error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка регистрации устройства' })
  }
})

// ── GET /api/org/:orgId/members/:userId/device-keys ── OWNER/ADMIN: public keys to encrypt for ────────
router.get('/:orgId/members/:userId/device-keys', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const member = await prisma.orgMember.findUnique({ where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } } })
    if (!member || member.status !== 'ACTIVE') return res.status(404).json({ success: false, error: 'Сотрудник не найден' })
    const keys = await prisma.orgDeviceKey.findMany({
      where: { orgId: req.params.orgId, userId: req.params.userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, deviceId: true, publicKey: true, name: true, createdAt: true, lastSeenAt: true }
    })
    res.json({ success: true, data: keys })
  } catch (err) {
    console.error('vault list device keys error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения устройств' })
  }
})

async function loadAssignment(req) {
  return prisma.orgMessengerAssignment.findFirst({ where: { id: req.params.id, orgId: req.params.orgId } })
}

// ── PUT /api/org/:orgId/messenger-assignments/:id/credentials ── OWNER/ADMIN stores blobs ───────────────
router.put('/:orgId/messenger-assignments/:id/credentials', credentialSetLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const assignment = await loadAssignment(req)
    if (!assignment) return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, MAX_DEVICE_KEYS_PER_USER) : []
    if (entries.length === 0) return res.status(400).json({ success: false, error: 'Нет устройств, для которых можно сохранить доступ' })

    const keys = await prisma.orgDeviceKey.findMany({ where: { orgId: req.params.orgId, userId: assignment.userId }, select: { id: true } })
    const allowed = new Set(keys.map(k => k.id))
    const rows = []
    for (const entry of entries) {
      const deviceKeyId = String(entry?.deviceKeyId || '')
      const blob = normalizeBlob(entry?.blob)
      if (!allowed.has(deviceKeyId) || !blob) return res.status(400).json({ success: false, error: 'Некорректные данные доступа' })
      rows.push({ deviceKeyId, blob })
    }
    await prisma.$transaction([
      prisma.orgCredential.deleteMany({ where: { assignmentId: assignment.id } }),
      prisma.orgCredential.createMany({ data: rows.map(r => ({ orgId: req.params.orgId, assignmentId: assignment.id, deviceKeyId: r.deviceKeyId, blob: r.blob, setById: req.user.id })) })
    ])
    await audit(req.params.orgId, req.user.id, 'credential.set', { userId: assignment.userId, name: assignment.name, devices: rows.length })
    res.json({ success: true, data: { devices: rows.length } })
  } catch (err) {
    console.error('vault set credentials error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка сохранения доступа' })
  }
})

// ── GET .../credentials/status ── OWNER/ADMIN: which of the employee's devices already got the access ───
router.get('/:orgId/messenger-assignments/:id/credentials/status', authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const assignment = await loadAssignment(req)
    if (!assignment) return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    const [keys, creds] = await Promise.all([
      prisma.orgDeviceKey.findMany({ where: { orgId: req.params.orgId, userId: assignment.userId }, select: { id: true, name: true, lastSeenAt: true } }),
      prisma.orgCredential.findMany({ where: { assignmentId: assignment.id }, select: { deviceKeyId: true, updatedAt: true } })
    ])
    const have = new Map(creds.map(c => [c.deviceKeyId, c.updatedAt]))
    res.json({
      success: true,
      data: {
        hasCredentials: creds.length > 0,
        devices: keys.map(k => ({ id: k.id, name: k.name, lastSeenAt: k.lastSeenAt, shared: have.has(k.id), updatedAt: have.get(k.id) || null }))
      }
    })
  } catch (err) {
    console.error('vault status error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения статуса' })
  }
})

// ── DELETE .../credentials ── OWNER/ADMIN removes the saved access ──────────────────────────────────────
router.delete('/:orgId/messenger-assignments/:id/credentials', credentialSetLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const assignment = await loadAssignment(req)
    if (!assignment) return res.status(404).json({ success: false, error: 'Мессенджер не найден' })
    const result = await prisma.orgCredential.deleteMany({ where: { assignmentId: assignment.id } })
    await audit(req.params.orgId, req.user.id, 'credential.delete', { userId: assignment.userId, name: assignment.name })
    res.json({ success: true, data: { removed: result.count } })
  } catch (err) {
    console.error('vault delete credentials error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка удаления доступа' })
  }
})

// ── GET .../credential?deviceKeyId= ── the EMPLOYEE'S OWN device downloads its blob (ciphertext only) ────
router.get('/:orgId/messenger-assignments/:id/credential', credentialFetchLimiter, authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER']), async (req, res) => {
  try {
    const assignment = await loadAssignment(req)
    // Only the person the messenger is assigned to may fetch it — not even the owner (they have no use for ciphertext).
    if (!assignment || assignment.userId !== req.user.id) return res.status(404).json({ success: false, error: 'Доступ не найден' })
    const deviceKeyId = String(req.query?.deviceKeyId || '')
    const key = await prisma.orgDeviceKey.findFirst({ where: { id: deviceKeyId, orgId: req.params.orgId, userId: req.user.id }, select: { id: true } })
    if (!key) return res.status(404).json({ success: false, error: 'Устройство не зарегистрировано' })
    const cred = await prisma.orgCredential.findUnique({ where: { assignmentId_deviceKeyId: { assignmentId: assignment.id, deviceKeyId: key.id } } })
    if (!cred) return res.status(404).json({ success: false, error: 'Для этого устройства доступ не передан' })
    await audit(req.params.orgId, req.user.id, 'credential.used', { name: assignment.name })
    res.json({ success: true, data: { blob: cred.blob, aad: `${req.params.orgId}|${assignment.id}|${key.id}`, url: assignment.url } })
  } catch (err) {
    console.error('vault fetch credential error:', err.message)
    res.status(500).json({ success: false, error: 'Ошибка получения доступа' })
  }
})

module.exports = router
