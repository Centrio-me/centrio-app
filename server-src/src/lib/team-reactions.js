// Records reaction time when a waiting team messenger is read (TEAM control, 2026-11-08).
const prisma = require('../utils/prisma')
const { normalizeAlertSettings } = require('./org-alerts')
const { teamScheduleOf, localDay } = require('./team-schedule')
const { reactionUpdate } = require('./team-report')

// cleared: [{ waitingSince }] — stats whose unread just went from >0 to 0.
async function recordReactions(orgId, userId, cleared, now = new Date()) {
    if (cleared.length === 0) return
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { alertSettingsJson: true } })
    const settings = normalizeAlertSettings(org?.alertSettingsJson)
    const { timeZone } = teamScheduleOf(settings)
    const day = localDay(timeZone, now)
    let reactionSecSum = 0
    let overThreshold = 0
    let count = 0
    for (const c of cleared) {
        const r = reactionUpdate(c.waitingSince, now, settings.thresholdMinutes)
        if (!r) continue
        reactionSecSum += r.reactionSecSum
        overThreshold += r.overThreshold
        count++
    }
    if (count === 0) return
    await prisma.orgPresenceDaily.upsert({
        where: { orgId_userId_day: { orgId, userId, day } },
        create: { orgId, userId, day, reactionSecSum, reactionCount: count, overThreshold },
        update: { reactionSecSum: { increment: reactionSecSum }, reactionCount: { increment: count }, overThreshold: { increment: overThreshold } }
    })
}

module.exports = { recordReactions }
