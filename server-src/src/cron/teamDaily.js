// Every 5 minutes (TEAM control, 2026-11-08):
//  • the owner's daily summary in Telegram once the team's work day is over;
//  • reminders 7/3/1 days before and on the last day of a team subscription without auto-renew
//    (they were lost in the server move — TEAM audit A1);
//  • presence kept 7 days, daily rollups 90 days.
const cron = require('node-cron')
const prisma = require('../utils/prisma')
const { normalizeAlertSettings } = require('../lib/org-alerts')
const { sendDirectMessage } = require('../lib/telegram-bot')
const { sendOrgExpiryEmail } = require('../lib/email')
const { teamScheduleOf, shiftEndAt, localDay } = require('../lib/team-schedule')
const { buildDailySummary, expiryNoticeDue } = require('../lib/team-report')

const SEND_WINDOW_MS = 6 * 60 * 60 * 1000
const PRESENCE_KEEP_DAYS = 7
const DAILY_KEEP_DAYS = 90
let running = false

function weekdayOf(day) {
    const d = new Date(`${day}T12:00:00Z`).getUTCDay()
    return d === 0 ? 7 : d
}

async function alreadyLogged(orgId, action, key, value) {
    const rows = await prisma.orgAuditLog.findMany({
        where: { orgId, action, createdAt: { gt: new Date(Date.now() - 40 * 86400000) } },
        select: { metaJson: true }
    })
    return rows.some((r) => r.metaJson && r.metaJson[key] === value)
}

async function sendDailySummaries(now) {
    const orgs = await prisma.organization.findMany({
        where: { alertTelegramChatId: { not: null }, seatsExpiresAt: { gt: now } },
        select: { id: true, name: true, alertSettingsJson: true, alertTelegramChatId: true }
    })
    for (const org of orgs) {
        const { schedule, timeZone } = teamScheduleOf(normalizeAlertSettings(org.alertSettingsJson))
        if (!schedule) continue
        const today = localDay(timeZone, now)
        const yesterday = localDay(timeZone, new Date(now - 86400000))
        for (const day of [yesterday, today]) {
            if (!schedule.days.includes(weekdayOf(day))) continue
            const end = shiftEndAt(schedule, timeZone, day)
            if (now < end || now - end > SEND_WINDOW_MS) continue
            if (await alreadyLogged(org.id, 'daily.sent', 'day', day)) continue

            const members = await prisma.orgMember.findMany({
                where: { orgId: org.id, status: 'ACTIVE', role: { not: 'OWNER' } },
                include: { user: { select: { name: true, email: true } } }
            })
            if (members.length === 0) continue
            const [dailies, stats] = await Promise.all([
                prisma.orgPresenceDaily.findMany({ where: { orgId: org.id, day } }),
                prisma.orgMessengerStat.findMany({ where: { orgId: org.id, loginState: 'out' }, select: { userId: true } })
            ])
            const people = members.map((m) => ({
                name: (m.user.name && m.user.name.trim()) || m.user.email,
                daily: dailies.find((d) => d.userId === m.userId) || null,
                signInProblems: stats.filter((s) => s.userId === m.userId).length
            }))
            const sent = await sendDirectMessage(org.alertTelegramChatId, buildDailySummary(org.name, day, timeZone, people))
            await prisma.orgAuditLog.create({ data: { orgId: org.id, actorUserId: 'system', action: 'daily.sent', metaJson: { day, ok: !!sent } } })
        }
    }
}

async function sendExpiryNotices(now) {
    const orgs = await prisma.organization.findMany({
        where: { autoRenewSeats: false, seatsExpiresAt: { gt: now, lt: new Date(now.getTime() + 8 * 86400000) } },
        select: { id: true, name: true, seatsExpiresAt: true, alertTelegramChatId: true, owner: { select: { email: true, name: true } } }
    })
    for (const org of orgs) {
        const forKey = org.seatsExpiresAt.toISOString()
        const logs = await prisma.orgAuditLog.findMany({ where: { orgId: org.id, action: 'expiry.notice' }, select: { metaJson: true } })
        const sent = logs.filter((l) => l.metaJson && l.metaJson.for === forKey).map((l) => l.metaJson.days)
        const days = expiryNoticeDue(org.seatsExpiresAt, now, sent)
        if (days === null) continue
        await sendOrgExpiryEmail(org.owner, org.name, org.seatsExpiresAt, days).catch((e) => console.error('[team-daily] expiry email failed:', e.message))
        if (org.alertTelegramChatId) {
            const when = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${days === 3 ? "дня" : "дней"}`
            await sendDirectMessage(org.alertTelegramChatId, `Подписка команды «${org.name}» заканчивается ${when}. Продлить: https://centrio.me/team`).catch(() => {})
        }
        await prisma.orgAuditLog.create({ data: { orgId: org.id, actorUserId: 'system', action: 'expiry.notice', metaJson: { for: forKey, days } } })
    }
}

async function purgeOld(now) {
    await prisma.orgPresence.deleteMany({ where: { at: { lt: new Date(now - PRESENCE_KEEP_DAYS * 86400000) } } })
    const cutoff = localDay('UTC', new Date(now - DAILY_KEEP_DAYS * 86400000))
    await prisma.orgPresenceDaily.deleteMany({ where: { day: { lt: cutoff } } })
}

async function runTeamDailyTick(now = new Date()) {
    if (running) return
    running = true
    try {
        for (const [name, step] of [['daily', sendDailySummaries], ['expiry', sendExpiryNotices], ['purge', purgeOld]]) {
            try {
                await step(now)
            } catch (err) {
                console.error(`[team-daily] ${name} failed:`, err.message)
            }
        }
    } finally {
        running = false
    }
}

function startTeamDailyCron() {
    cron.schedule('*/5 * * * *', () => { runTeamDailyTick() })
    console.log('[team-daily] cron scheduled (every 5 minutes)')
}

module.exports = { startTeamDailyCron, runTeamDailyTick }
