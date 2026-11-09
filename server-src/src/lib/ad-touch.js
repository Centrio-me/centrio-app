// Which ad brought a sign-up (2026-11-06). An ad opens the website, but most people register later inside the desktop
// app, where the link and its labels are gone. So the website notes "this address came from an ad" and the sign-up
// looks that note up. This is an estimate: the same network can be shared by several people, and a changed network
// loses the match. Only a salted hash of the address is kept, for 14 days, and the site sends nothing if the visitor
// chose "necessary cookies only".
const crypto = require('crypto')
const prisma = require('../utils/prisma')

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const CLEANUP_CHANCE = 0.02
const FIELD_MAX = 120

function ipHash(req) {
  return crypto.createHash('sha256').update(`${req.ip}:${process.env.JWT_SECRET || 'centrio'}`).digest('hex')
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, FIELD_MAX) : null)
// Metrica client id and Direct click id let a matched sign-up go back to Metrica as a conversion (lib/metrika-offline.js).
const { cleanClientId, cleanYclid } = require('./metrika-offline')

async function recordAdTouch(req) {
  const body = req.body || {}
  const data = { source: clean(body.source), campaign: clean(body.campaign), content: clean(body.content), term: clean(body.term), landing: clean(body.landing), ymClientId: cleanClientId(body.clientId), yclid: cleanYclid(body.yclid), createdAt: new Date() }
  if (!data.source) return false
  const hash = ipHash(req)
  await prisma.adTouch.upsert({ where: { ipHash: hash }, create: { ipHash: hash, ...data }, update: data })
  if (Math.random() < CLEANUP_CHANCE) {
    prisma.adTouch.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS) } } }).catch(() => {})
  }
  return true
}

// Never throws and never delays a sign-up.
function attachSignupSource(userId, req) {
  (async () => {
    const touch = await prisma.adTouch.findUnique({ where: { ipHash: ipHash(req) } })
    if (!touch || Date.now() - touch.createdAt.getTime() > WINDOW_MS) return
    const { source, campaign, content, term, landing, ymClientId, yclid } = touch
    await prisma.user.update({ where: { id: userId }, data: { signupSource: JSON.stringify({ source, campaign, content, term, landing, ymClientId, yclid }) } })
  })().catch(e => console.error('[ad-touch] attach failed:', e.message))
}

module.exports = { recordAdTouch, attachSignupSource }
