// "Клиент ждёт ответа" — team owner alerts when an employee's assigned
// messenger has had unread messages for longer than the owner's threshold.
//
// Data source: OrgMessengerStat rows pushed by every member's desktop app
// (renderer/org-team.js). The server — not the client — stamps
// `waitingSince` when a row's unreadCount goes 0 → >0 and clears it on 0
// (see POST /:orgId/messenger-stats), so the clock can't be skewed by a
// member's local time. runAlertsTick() runs every minute from
// src/cron/orgAlerts.js (single fork process — no duplicate sends).
const prisma = require('../utils/prisma')
const { Prisma } = require('@prisma/client')
const { sendOrgWaitingAlertEmail } = require('./email')
const { sendDirectMessage, escapeHtml } = require('./telegram-bot')

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const OFFLINE_AFTER_MS = 10 * 60 * 1000
const MAX_MEMBER_FILTER = 200
const MAX_MESSENGER_FILTER = 100

const DEFAULT_ALERT_SETTINGS = Object.freeze({
  enabled: false,
  thresholdMinutes: 15,
  repeatMinutes: 30,
  maxRepeats: 3,
  workHours: { enabled: false, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] },
  timezone: 'Europe/Moscow',
  memberUserIds: [],
  messengerNames: [],
  channels: { app: true, email: false, telegram: false },
  emailTo: ''
})

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Accepts anything (stored JSON or a request body) and always returns a
// complete, safe settings object — unknown keys are dropped, every value
// is bounded. Never throws.
function normalizeAlertSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const d = DEFAULT_ALERT_SETTINGS
  const wh = src.workHours && typeof src.workHours === 'object' ? src.workHours : {}
  const ch = src.channels && typeof src.channels === 'object' ? src.channels : {}

  const days = Array.isArray(wh.days)
    ? [...new Set(wh.days.map(x => Math.trunc(Number(x))).filter(x => x >= 1 && x <= 7))].sort()
    : [...d.workHours.days]

  const emailTo = typeof src.emailTo === 'string' ? src.emailTo.trim().slice(0, 254) : ''

  return {
    enabled: src.enabled === true,
    thresholdMinutes: clampInt(src.thresholdMinutes, 1, 1440, d.thresholdMinutes),
    repeatMinutes: clampInt(src.repeatMinutes, 0, 1440, d.repeatMinutes),
    maxRepeats: clampInt(src.maxRepeats, 0, 20, d.maxRepeats),
    workHours: {
      enabled: wh.enabled === true,
      from: HHMM_RE.test(wh.from) ? wh.from : d.workHours.from,
      to: HHMM_RE.test(wh.to) ? wh.to : d.workHours.to,
      days
    },
    timezone: isValidTimezone(src.timezone) ? src.timezone : d.timezone,
    memberUserIds: Array.isArray(src.memberUserIds)
      ? [...new Set(src.memberUserIds.filter(x => typeof x === 'string' && x.length <= 64))].slice(0, MAX_MEMBER_FILTER)
      : [],
    messengerNames: Array.isArray(src.messengerNames)
      ? [...new Set(src.messengerNames
          .filter(x => typeof x === 'string')
          .map(x => x.trim().slice(0, 100))
          .filter(Boolean))].slice(0, MAX_MESSENGER_FILTER)
      : [],
    channels: {
      app: ch.app !== false,
      email: ch.email === true,
      telegram: ch.telegram === true
    },
    emailTo: emailTo && EMAIL_RE.test(emailTo) ? emailTo : ''
  }
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function isWithinWorkHours(now, settings) {
  if (!settings.workHours.enabled) return true
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
  const get = (type) => parts.find(p => p.type === type)?.value
  const day = WEEKDAY_INDEX[get('weekday')]
  const previousDay = day === 1 ? 7 : day - 1
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  const days = settings.workHours.days

  const from = toMinutes(settings.workHours.from)
  const to = toMinutes(settings.workHours.to)
  if (from === to) return days.includes(day)
  if (from < to) return days.includes(day) && minutes >= from && minutes < to
  // Overnight shift (e.g. 22:00–06:00): the part after midnight belongs to
  // the shift that started on the previous day.
  if (minutes >= from) return days.includes(day)
  if (minutes < to) return days.includes(previousDay)
  return false
}

function formatWaited(minutes) {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m ? `${h} ч ${m} мин` : `${h} ч`
  const days = Math.floor(h / 24)
  return `${days} дн ${h % 24} ч`
}

function buildTelegramText(orgName, items, isTest) {
  const header = isTest
    ? `✅ <b>Проверка оповещений</b>\nКоманда «${escapeHtml(orgName)}». Так будут приходить оповещения:`
    : `⏰ <b>Клиенты ждут ответа</b>\nКоманда «${escapeHtml(orgName)}»`
  const lines = items.map(it => {
    const offline = it.offline ? ' <i>(приложение сотрудника закрыто)</i>' : ''
    return `• <b>${escapeHtml(it.memberName)}</b> — ${escapeHtml(it.messengerName)}: ждёт ${escapeHtml(it.waitedLabel)}${offline}`
  })
  return `${header}\n\n${lines.join('\n')}\n\nНастройки: centrio.me/team`
}

function memberDisplayName(user) {
  return (user?.name && String(user.name).trim()) || user?.email || 'Сотрудник'
}

// Returns { email: bool|null, telegram: bool|null, app: bool|null } — null
// means the channel is disabled, true/false whether the send succeeded.
async function deliverAlert(org, settings, items, { isTest = false } = {}) {
  const result = { app: null, email: null, telegram: null }

  if (settings.channels.app) result.app = true

  if (settings.channels.email) {
    const to = settings.emailTo || org.owner?.email
    const sent = await sendOrgWaitingAlertEmail({ to, orgName: org.name, items, isTest })
    result.email = !!sent?.ok
  }

  if (settings.channels.telegram) {
    if (org.alertTelegramChatId) {
      const sent = await sendDirectMessage(org.alertTelegramChatId, buildTelegramText(org.name, items, isTest))
      result.telegram = !!sent
    } else {
      result.telegram = false
    }
  }

  return result
}

function statMatchesFilters(stat, settings) {
  if (settings.memberUserIds.length > 0 && !settings.memberUserIds.includes(stat.userId)) return false
  if (settings.messengerNames.length > 0) {
    const name = String(stat.messengerName || '').trim().toLowerCase()
    if (!settings.messengerNames.some(n => n.toLowerCase() === name)) return false
  }
  return true
}

function isStatDue(stat, settings, now) {
  if (!stat.waitingSince || stat.unreadCount <= 0) return false
  const waitedMs = now - stat.waitingSince
  if (waitedMs < settings.thresholdMinutes * 60 * 1000) return false
  if (stat.alertCount === 0) return true
  if (settings.repeatMinutes === 0) return false
  if (stat.alertCount > settings.maxRepeats) return false
  return !stat.alertSentAt || (now - stat.alertSentAt) >= settings.repeatMinutes * 60 * 1000
}

async function processOrg(org, now) {
  const settings = normalizeAlertSettings(org.alertSettingsJson)
  if (!settings.enabled) return
  if (!org.seatsExpiresAt || org.seatsExpiresAt <= now) return
  if (!isWithinWorkHours(now, settings)) return

  const [stats, members, assignments] = await Promise.all([
    prisma.orgMessengerStat.findMany({
      where: { orgId: org.id, unreadCount: { gt: 0 }, waitingSince: { not: null } }
    }),
    prisma.orgMember.findMany({
      where: { orgId: org.id, status: 'ACTIVE' },
      select: { userId: true, user: { select: { name: true, email: true } } }
    }),
    prisma.orgMessengerAssignment.findMany({
      where: { orgId: org.id },
      select: { id: true, userId: true }
    })
  ])
  const memberById = new Map(members.map(m => [m.userId, m.user]))
  // A stat row outlives an assignment that was removed while it had unread
  // messages (the app simply stops reporting it) — never alert on those.
  const liveAssignments = new Set(assignments.map(a => `${a.userId}:${a.id}`))

  const due = stats.filter(s =>
    memberById.has(s.userId) &&
    liveAssignments.has(`${s.userId}:${s.messengerKey}`) &&
    statMatchesFilters(s, settings) &&
    isStatDue(s, settings, now)
  )
  if (due.length === 0) return

  const items = due.map(s => {
    const waitedMinutes = Math.max(1, Math.floor((now - s.waitingSince) / 60000))
    return {
      stat: s,
      memberName: memberDisplayName(memberById.get(s.userId)),
      messengerName: s.messengerName || 'Мессенджер',
      waitedMinutes,
      waitedLabel: formatWaited(waitedMinutes),
      offline: (now - s.updatedAt) > OFFLINE_AFTER_MS
    }
  })

  // Deliver first: if every enabled external channel failed and the in-app
  // feed is off, nothing reached the owner — leave the counters untouched so
  // the next tick retries instead of silently consuming the alert.
  const result = await deliverAlert(org, settings, items)
  const delivered = result.app === true || result.email === true || result.telegram === true
  if (!delivered) {
    console.warn(`[org-alerts] org ${org.id}: delivery failed on all channels, will retry`)
    return
  }

  await prisma.orgAlert.createMany({
    data: items.map(it => ({
      orgId: org.id,
      userId: it.stat.userId,
      messengerKey: it.stat.messengerKey,
      messengerName: it.messengerName,
      waitingSince: it.stat.waitingSince,
      waitedMinutes: it.waitedMinutes
    }))
  })

  // Raw SQL on purpose: a Prisma update would bump @updatedAt, which is the
  // member app's heartbeat used for the "app is closed" flag.
  await prisma.$executeRaw`
    UPDATE "OrgMessengerStat"
    SET "alertSentAt" = ${now}, "alertCount" = "alertCount" + 1
    WHERE "id" IN (${Prisma.join(due.map(s => s.id))})`
}

let tickRunning = false

async function runAlertsTick(now = new Date()) {
  if (tickRunning) return
  tickRunning = true
  try {
    const orgs = await prisma.organization.findMany({
      where: { alertSettingsJson: { not: Prisma.DbNull } },
      select: {
        id: true, name: true, seatsExpiresAt: true, alertSettingsJson: true,
        alertTelegramChatId: true, owner: { select: { email: true } }
      }
    })
    for (const org of orgs) {
      try {
        await processOrg(org, now)
      } catch (err) {
        console.error(`[org-alerts] org ${org.id} failed:`, err.message)
      }
    }
  } catch (err) {
    console.error('[org-alerts] tick failed:', err.message)
  } finally {
    tickRunning = false
  }
}

// Sample alert for the "Отправить проверку" button — uses the org's real
// members/messengers when there are any, so the owner sees a realistic
// preview, and never touches OrgMessengerStat/OrgAlert state.
async function sendTestAlert(orgId) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, alertSettingsJson: true, alertTelegramChatId: true,
      owner: { select: { email: true } }
    }
  })
  if (!org) return null
  const settings = normalizeAlertSettings(org.alertSettingsJson)
  const sample = await prisma.orgMessengerAssignment.findFirst({
    where: { orgId },
    select: { name: true, user: { select: { name: true, email: true } } }
  })
  const items = [{
    memberName: sample ? memberDisplayName(sample.user) : 'Анна',
    messengerName: sample?.name || 'Telegram',
    waitedMinutes: settings.thresholdMinutes,
    waitedLabel: formatWaited(settings.thresholdMinutes),
    offline: false
  }]
  return deliverAlert(org, settings, items, { isTest: true })
}

module.exports = {
  DEFAULT_ALERT_SETTINGS,
  normalizeAlertSettings,
  isWithinWorkHours,
  isStatDue,
  formatWaited,
  runAlertsTick,
  sendTestAlert
}
