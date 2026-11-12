// Achievements of the signed-in person. Mounted on /api/achievements.
const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')
const { getAchievements, report, claimReward } = require('../lib/achievements')

const reportLimiter = rateLimit({ name: 'achievements-report', windowMs: 10 * 60 * 1000, max: 60 })
const claimLimiter = rateLimit({ name: 'achievements-claim', windowMs: 60 * 60 * 1000, max: 10 })

const fail = (res, where, err) => {
  console.error(`Achievements ${where} error:`, err.message)
  res.status(500).json({ error: 'Не удалось загрузить достижения' })
}

// ?with=beta_friend — the newer badges this app can draw
const knownOf = (req) => String(req.query.with || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)

router.get('/', authMiddleware, async (req, res) => {
  try { res.json(await getAchievements(req.user.id, knownOf(req))) } catch (err) { fail(res, 'get', err) }
})

router.post('/report', reportLimiter, authMiddleware, async (req, res) => {
  try { res.json(await report(req.user.id, req.body || {}, knownOf(req))) } catch (err) { fail(res, 'report', err) }
})

router.post('/claim-reward', claimLimiter, authMiddleware, async (req, res) => {
  try {
    const result = await claimReward(req.user.id)
    res.status(result.ok ? 200 : 400).json(result)
  } catch (err) { fail(res, 'claim', err) }
})

module.exports = router
