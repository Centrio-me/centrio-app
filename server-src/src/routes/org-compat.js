// Team endpoints the desktop app polls that were added after the 22 Sep 2026 backup this server was restored from.
// Where the data still exists in the database (shared VPN, forced settings, assigned messengers) it is read from there;
// where the tables were lost (tasks, team quick replies, folders structure, alerts) the answer is "nothing here yet"
// instead of 404, so the app's Sync panel stays calm. Mounted BEFORE routes/org.js: only the paths below are handled
// here, everything else falls through to it.
const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')
const { requireOrgRole } = require('../lib/org')

const anyMember = [authMiddleware, requireOrgRole(['OWNER', 'ADMIN', 'MEMBER'])]
const adminOnly = [authMiddleware, requireOrgRole(['OWNER', 'ADMIN'])]

const fail = (res, label, err) => {
  console.error(label, err.message)
  res.status(500).json({ success: false, error: 'Ошибка сервера' })
}

router.get('/:orgId/vpn', ...anyMember, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId }, select: { vpnConfigName: true, vpnConfigLink: true } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    res.json({ success: true, data: org.vpnConfigLink ? { name: org.vpnConfigName, link: org.vpnConfigLink } : null })
  } catch (err) { fail(res, 'Org get vpn error:', err) }
})

router.get('/:orgId/settings', ...anyMember, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.orgId }, select: { forcedSettingsJson: true } })
    if (!org) return res.status(404).json({ success: false, error: 'Организация не найдена' })
    res.json({ success: true, data: org.forcedSettingsJson || null })
  } catch (err) { fail(res, 'Org get settings error:', err) }
})

router.get('/:orgId/messenger-assignments', ...anyMember, async (req, res) => {
  try {
    const isManager = req.orgMembership.role === 'OWNER' || req.orgMembership.role === 'ADMIN'
    const rows = await prisma.orgMessengerAssignment.findMany({
      where: { orgId: req.params.orgId, ...(isManager ? {} : { userId: req.user.id }) },
      orderBy: { sortOrder: 'asc' }
    })
    res.json({ success: true, data: rows.map(a => ({ ...a, folderId: null, useVpn: false, credentialAvailable: false })) })
  } catch (err) { fail(res, 'Org get assignments error:', err) }
})

// Unread counters are not rebuilt yet; accepting them keeps the app from reporting a sync error.
router.post('/:orgId/messenger-stats', ...anyMember, (req, res) => res.json({ success: true }))

router.post('/:orgId/device-keys', ...anyMember, (req, res) =>
  res.status(503).json({ success: false, error: 'Хранилище паролей команды временно недоступно: идёт восстановление после сбоя' }))

router.get('/:orgId/my-structure', ...anyMember, (req, res) => res.json({ success: true, data: { workspaces: [], folders: [] } }))
router.get('/:orgId/tasks', ...anyMember, (req, res) => res.json({ success: true, data: [], unseen: 0 }))
router.post('/:orgId/tasks/seen', ...anyMember, (req, res) => res.json({ success: true }))
router.get('/:orgId/quick-replies', ...anyMember, (req, res) => res.json({ success: true, data: [] }))
router.get('/:orgId/alerts', ...adminOnly, (req, res) => res.json({ success: true, data: { channelEnabled: false, items: [] } }))

module.exports = router
