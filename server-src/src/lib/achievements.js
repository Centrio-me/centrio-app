// Achievements: what a person reached with Centrio. Money, time and usage are read from our own tables, so they cannot be
// faked. App features are reported by the app, which only ever gives a badge. Unlocked badges stay, whatever happens later.
// One small file per person: no schema change, and a lost file only means badges are worked out again from the data.
const fs = require('fs')
const path = require('path')
const prisma = require('../utils/prisma')
const { isBetaTester } = require('./beta-testers')

const DIR = path.join(__dirname, '..', '..', 'data', 'achievements')
const DAY_MS = 86400000
const SECONDS_IN_HOUR = 3600
const REWARD_DAYS = 3
const MAX_REPORTED_SERVICES = 500

const FEATURE_KEYS = ['notification', 'split', 'folder', 'task', 'note', 'quick_reply', 'vpn', 'passwords', 'assistant', 'first_steps']
// What the "first steps" reward asks for. Two services are checked separately.
const FIRST_STEPS = ['notification', 'split']
// The badge for first steps also goes to those who did all this before the steps existed.
const PAST_STEPS = ['notification', 'split', 'folder']

const feature = (key, group, icon) => ({ key, group, icon, feature: key })
const metric = (key, group, icon, name, target) => ({ key, group, icon, metric: name, target })

const LIST = [
  metric('service_1', 'start', '🚀', 'services', 1),
  feature('notification', 'start', '🔔'),
  metric('service_2', 'start', '🧩', 'services', 2),
  feature('split', 'start', '🪟'),
  feature('folder', 'start', '📁'),
  feature('first_steps', 'start', '🎓'),

  metric('service_5', 'usage', '📚', 'services', 5),
  metric('service_10', 'usage', '🏛', 'services', 10),
  feature('task', 'usage', '✅'),
  feature('note', 'usage', '📝'),
  feature('quick_reply', 'usage', '⚡'),
  feature('vpn', 'usage', '🛡'),
  feature('passwords', 'usage', '🔐'),
  feature('assistant', 'usage', '✨'),

  metric('days_7', 'time', '🌱', 'days', 7),
  metric('days_30', 'time', '🌿', 'days', 30),
  metric('days_100', 'time', '🌳', 'days', 100),
  metric('days_365', 'time', '🎂', 'days', 365),
  metric('hours_10', 'time', '⏱', 'hours', 10),
  metric('hours_100', 'time', '⏳', 'hours', 100),
  metric('messages_100', 'time', '💬', 'messages', 100),
  metric('messages_1000', 'time', '📣', 'messages', 1000),

  metric('pay_first', 'support', '💎', 'payments', 1),
  metric('pay_again', 'support', '🔁', 'payments', 2),
  metric('pay_year', 'support', '👑', 'yearPayments', 1),
  metric('auto_renew', 'support', '🤝', 'autoRenew', 1),
  metric('invite_1', 'support', '🎁', 'invited', 1),
  metric('invite_5', 'support', '🏆', 'invited', 5),
  metric('telegram', 'support', '✈️', 'telegram', 1),
  // «Друг Centrio» (3.8.2): a beta tester. Shown only to apps that know it (GET ?with=beta_friend), older ones would print its key
  metric('beta_friend', 'support', '💜', 'betaTester', 1),
]
const NEWER_ITEMS = ['beta_friend']

const FILE_NAME = /^[0-9a-f-]{20,40}$/i
const isFilled = (value) => Array.isArray(value) && value.length > 0

// What people did before achievements existed, read from their synced data. It opens badges, never the first steps gift.
function pastFeatures({ folders, foldered, notes, assistant, usage, settings }) {
  const extra = settings?.extra && typeof settings.extra === 'object' ? settings.extra : {}
  return {
    folder: folders + foldered > 0,
    note: notes > 0,
    assistant: (assistant._sum.messagesUsed || 0) > 0,
    notification: (usage._sum.notifCount || 0) + (usage._sum.msgReceived || 0) > 0,
    task: isFilled(extra.todos?.items),
    quick_reply: isFilled(extra.quickReplies),
    split: isFilled(extra.splitPresets) || extra.extensionsState?.split === true,
    passwords: !!extra.pmVault,
    vpn: extra.globalProxy?.enabled === true,
  }
}

const fileOf = (userId) => {
  if (!FILE_NAME.test(userId)) throw new Error('bad user id')
  return path.join(DIR, `${userId}.json`)
}

function readRecord(userId) {
  try {
    return { unlocked: {}, reported: {}, services: 0, rewardAt: null, ...JSON.parse(fs.readFileSync(fileOf(userId), 'utf8')) }
  } catch {
    return { unlocked: {}, reported: {}, services: 0, rewardAt: null }
  }
}

function writeRecord(userId, record) {
  fs.mkdirSync(DIR, { recursive: true })
  const file = fileOf(userId)
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(record))
  fs.renameSync(temp, file)
}

async function loadMetrics(userId, record) {
  const [user, services, paid, usage, invited, folders, foldered, notes, assistant, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, autoRenew: true, telegramId: true } }),
    prisma.messenger.count({ where: { userId } }),
    prisma.payment.findMany({ where: { userId, status: 'SUCCEEDED', amount: { gt: 0 } }, select: { months: true, days: true } }),
    prisma.usageStat.aggregate({ where: { userId }, _sum: { appTime: true, msgSent: true, notifCount: true, msgReceived: true } }),
    prisma.user.count({ where: { referredById: userId, referralBonusGranted: true } }),
    prisma.folder.count({ where: { userId } }),
    prisma.messenger.count({ where: { userId, folderId: { not: null } } }),
    prisma.note.count({ where: { userId } }),
    prisma.aiUsage.aggregate({ where: { userId }, _sum: { messagesUsed: true } }),
    prisma.syncSettings.findUnique({ where: { userId }, select: { extra: true } }),
  ])
  const past = pastFeatures({ folders, foldered, notes, assistant, usage, settings })
  const serviceCount = Math.max(services, record.services)
  return {
    past: { ...past, first_steps: serviceCount >= 2 && PAST_STEPS.every(key => past[key] || record.reported[key]) },
    services: serviceCount,
    days: Math.floor((Date.now() - user.createdAt.getTime()) / DAY_MS),
    hours: Math.floor((usage._sum.appTime || 0) / SECONDS_IN_HOUR),
    messages: usage._sum.msgSent || 0,
    payments: paid.length,
    yearPayments: paid.filter(payment => (payment.months || 0) >= 12).length,
    autoRenew: user.autoRenew ? 1 : 0,
    invited,
    telegram: user.telegramId ? 1 : 0,
    betaTester: isBetaTester(userId) ? 1 : 0,
  }
}

const hasFeature = (key, metrics, record) => !!record.reported[key] || !!metrics.past[key]
const isReached = (item, metrics, record) => (item.feature ? hasFeature(item.feature, metrics, record) : metrics[item.metric] >= item.target)

// Works out new badges, keeps them for good and says which ones are new.
async function evaluate(userId, record) {
  const metrics = await loadMetrics(userId, record)
  const at = new Date().toISOString()
  const fresh = LIST.filter(item => !record.unlocked[item.key] && isReached(item, metrics, record)).map(item => item.key)
  const next = fresh.length ? { ...record, unlocked: { ...record.unlocked, ...Object.fromEntries(fresh.map(key => [key, at])) } } : record
  return { record: next, metrics, fresh }
}

function view({ record, metrics, fresh }, known = []) {
  const shown = LIST.filter(item => !NEWER_ITEMS.includes(item.key) || known.includes(item.key))
  const items = shown.map(item => ({
    key: item.key,
    group: item.group,
    icon: item.icon,
    unlockedAt: record.unlocked[item.key] || null,
    current: item.feature ? (hasFeature(item.feature, metrics, record) ? 1 : 0) : Math.min(metrics[item.metric], item.target),
    target: item.feature ? 1 : item.target,
  }))
  return {
    items,
    fresh: fresh.filter(key => shown.some(item => item.key === key)),
    unlocked: items.filter(item => item.unlockedAt).length,
    total: items.length,
    stats: { services: metrics.services, days: metrics.days, hours: metrics.hours, messages: metrics.messages },
    reward: { days: REWARD_DAYS, claimedAt: record.rewardAt, available: !record.rewardAt && firstStepsDone(record, metrics) },
  }
}

const firstStepsDone = (record, metrics) => metrics.services >= 2 && FIRST_STEPS.every(key => record.reported[key])

async function getAchievements(userId, known = []) {
  const state = await evaluate(userId, readRecord(userId))
  if (state.fresh.length) writeRecord(userId, state.record)
  return view(state, known)
}

async function report(userId, { keys, services }, drawable = []) {
  const record = readRecord(userId)
  const at = new Date().toISOString()
  const known = (Array.isArray(keys) ? keys : []).filter(key => FEATURE_KEYS.includes(key) && !record.reported[key])
  const count = Number.isInteger(services) && services >= 0 ? Math.min(services, MAX_REPORTED_SERVICES) : 0
  const updated = { ...record, reported: { ...record.reported, ...Object.fromEntries(known.map(key => [key, at])) }, services: Math.max(record.services, count) }
  const state = await evaluate(userId, updated)
  writeRecord(userId, state.record)
  return view(state, drawable)
}

// Once per account. A team member's plan belongs to the team, so the reward is for personal plans only.
async function claimReward(userId) {
  const record = readRecord(userId)
  if (record.rewardAt) return { ok: false, error: 'Награда уже получена' }
  const metrics = await loadMetrics(userId, record)
  if (!firstStepsDone(record, metrics)) return { ok: false, error: 'Сначала пройдите первые шаги' }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } })
  if (user.plan === 'TEAM') return { ok: false, error: 'Для команд награда не действует' }
  writeRecord(userId, { ...record, rewardAt: new Date().toISOString() })
  const now = Date.now()
  const base = user.planExpiresAt && user.planExpiresAt.getTime() > now ? user.planExpiresAt.getTime() : now
  const planExpiresAt = new Date(base + REWARD_DAYS * DAY_MS)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { plan: 'PRO', planExpiresAt } }),
    prisma.payment.create({ data: { userId, amount: 0, currency: 'RUB', status: 'SUCCEEDED', provider: 'promo', plan: 'PRO', months: 0, days: REWARD_DAYS } }),
  ])
  return { ok: true, days: REWARD_DAYS, planExpiresAt }
}

module.exports = { getAchievements, report, claimReward, evaluate, readRecord }
