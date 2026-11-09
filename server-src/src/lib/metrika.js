// Yandex Metrica integration (2026-10-02): token storage (AES-256-GCM, key in
// env), Reporting/Management API calls, a compact site summary and an AI
// analysis that also proposes concrete tasks. Used by routes/admin-metrika.js
// (platform owner only, behind the admin session).
const crypto = require('crypto')
const axios = require('axios')
const prisma = require('../utils/prisma')

const CLIENT_ID = process.env.YANDEX_METRIKA_CLIENT_ID
const CLIENT_SECRET = process.env.YANDEX_METRIKA_CLIENT_SECRET
const REDIRECT_URI = process.env.YANDEX_METRIKA_REDIRECT_URI || 'https://oauth.yandex.ru/verification_code'
const TOKEN_KEY_HEX = process.env.METRIKA_TOKEN_KEY
const API = 'https://api-metrika.yandex.net'
const CONNECTION_ID = 'main'
const SUMMARY_TTL_MS = 5 * 60 * 1000

const AGENT_BASE = process.env.AGENTPLATFORM_BASE_URL || 'https://api.agentplatform.ru/v1'
const AGENT_KEY = process.env.AGENTPLATFORM_API_KEY
const ANALYSIS_MODEL = process.env.METRIKA_ANALYSIS_MODEL || process.env.ASSISTANT_MODEL || 'openai/gpt-4o-mini'

const summaryCache = new Map()

function encryptionKey() {
  if (!TOKEN_KEY_HEX || TOKEN_KEY_HEX.length !== 64) throw new Error('METRIKA_TOKEN_KEY is not configured')
  return Buffer.from(TOKEN_KEY_HEX, 'hex')
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.')
}

function decrypt(packed) {
  const [iv, tag, body] = String(packed).split('.').map((p) => Buffer.from(p, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

async function exchangeCode(code) {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Yandex Metrica OAuth app is not configured')
  const params = new URLSearchParams({ grant_type: 'authorization_code', code: String(code).trim(), client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
  const { data } = await axios.post('https://oauth.yandex.ru/token', params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })
  if (!data?.access_token) throw new Error('Yandex did not return a token')
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null
  let login = null
  try {
    const info = await axios.get('https://login.yandex.ru/info', { headers: { Authorization: `OAuth ${data.access_token}` }, params: { format: 'json' }, timeout: 10000 })
    login = info.data?.login || null
  } catch { /* the login is informational only */ }
  const record = {
    accessTokenEnc: encrypt(data.access_token),
    refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : null,
    expiresAt,
    login
  }
  await prisma.metrikaConnection.upsert({ where: { id: CONNECTION_ID }, create: { id: CONNECTION_ID, ...record }, update: record })
  summaryCache.clear()
  return { login, expiresAt }
}

async function getConnection() {
  return prisma.metrikaConnection.findUnique({ where: { id: CONNECTION_ID } })
}

async function accessToken() {
  const connection = await getConnection()
  if (!connection) throw new Error('Метрика не подключена')
  return decrypt(connection.accessTokenEnc)
}

async function apiGetNow(path, params, attempt = 0) {
  const token = await accessToken()
  try {
    const { data } = await axios.get(`${API}${path}`, { params, headers: { Authorization: `OAuth ${token}` }, timeout: 25000 })
    return data
  } catch (e) {
    // Yandex limits parallel requests per user; wait and retry once on 429.
    if (e.response && e.response.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      return apiGetNow(path, params, attempt + 1)
    }
    throw e
  }
}

// Metrika allows very few parallel requests per user, so run them one at a time.
let apiQueue = Promise.resolve()
function apiGet(path, params) {
  const run = apiQueue.then(() => apiGetNow(path, params))
  apiQueue = run.catch(() => {})
  return run
}

// Writes to Metrica (goals, offline conversions). Same token and queue as reads.
async function apiSendNow(method, path, { params, data, headers } = {}) {
  const token = await accessToken()
  const res = await axios({ method, url: `${API}${path}`, params, data, headers: { Authorization: `OAuth ${token}`, ...(headers || {}) }, timeout: 30000 })
  return res.data
}
function apiSend(method, path, options) {
  const run = apiQueue.then(() => apiSendNow(method, path, options))
  apiQueue = run.catch(() => {})
  return run
}

async function listCounters() {
  const data = await apiGet('/management/v1/counters', { per_page: 100 })
  return (data.counters || []).map((c) => ({ id: c.id, name: c.name, site: c.site2?.site || c.site || '', status: c.status }))
}

const DAY = (n) => (n === 0 ? 'today' : `${n}daysAgo`)

async function report(counterId, metrics, extra = {}) {
  const data = await apiGet('/stat/v1/data', { ids: counterId, metrics: metrics.join(','), accuracy: 'full', limit: 10, ...extra })
  return data
}

function totalsOf(data) {
  const t = data.totals
  if (!Array.isArray(t)) return []
  // The API returns a flat array of totals, or an array holding one array.
  return Array.isArray(t[0]) ? t[0] : t
}

async function loadSummary(counterId) {
  const core = ['ym:s:visits', 'ym:s:users', 'ym:s:pageviews', 'ym:s:bounceRate', 'ym:s:avgVisitDurationSeconds']
  const [today, yesterday, week, prevWeek, series, sources, pages, devices, goalsList] = await Promise.all([
    report(counterId, core, { date1: DAY(0), date2: DAY(0) }),
    report(counterId, core, { date1: DAY(1), date2: DAY(1) }),
    report(counterId, core, { date1: DAY(6), date2: DAY(0) }),
    report(counterId, core, { date1: DAY(13), date2: DAY(7) }),
    apiGet('/stat/v1/data/bytime', { ids: counterId, metrics: 'ym:s:visits,ym:s:users', date1: DAY(13), date2: DAY(0), group: 'day', accuracy: 'full' }),
    report(counterId, ['ym:s:visits', 'ym:s:users'], { dimensions: 'ym:s:lastTrafficSource', date1: DAY(6), date2: DAY(0), sort: '-ym:s:visits' }),
    report(counterId, ['ym:pv:pageviews'], { dimensions: 'ym:pv:URLPath', date1: DAY(6), date2: DAY(0), sort: '-ym:pv:pageviews', limit: 10 }),
    report(counterId, ['ym:s:visits'], { dimensions: 'ym:s:deviceCategory', date1: DAY(6), date2: DAY(0), sort: '-ym:s:visits' }),
    apiGet(`/management/v1/counter/${counterId}/goals`).catch(() => ({ goals: [] }))
  ])

  const names = ['visits', 'users', 'pageviews', 'bounceRate', 'avgVisitSeconds']
  const pick = (data) => Object.fromEntries(totalsOf(data).map((v, i) => [names[i], Math.round((v || 0) * 10) / 10]))
  const rows = (data, valueIndex = 0) => (data.data || []).map((row) => ({
    name: row.dimensions?.[0]?.name || row.dimensions?.[0]?.id || '—',
    value: Math.round((row.metrics?.[valueIndex] || 0) * 10) / 10
  }))

  const goals = (goalsList.goals || []).slice(0, 10)
  let goalRows = []
  if (goals.length > 0) {
    const metrics = goals.map((g) => `ym:s:goal${g.id}reaches`)
    const data = await report(counterId, metrics, { date1: DAY(6), date2: DAY(0), limit: 1 })
    goalRows = goals.map((g, i) => ({ name: g.name, reaches: Math.round(totalsOf(data)[i] || 0) }))
  }

  return {
    counterId,
    generatedAt: new Date().toISOString(),
    today: pick(today),
    yesterday: pick(yesterday),
    last7: pick(week),
    previous7: pick(prevWeek),
    daily: (series.time_intervals || []).map((interval, i) => ({
      date: String(interval[0]).slice(0, 10),
      visits: Math.round(series.data?.[0]?.metrics?.[0]?.[i] || 0),
      users: Math.round(series.data?.[0]?.metrics?.[1]?.[i] || 0)
    })),
    sources: rows(sources),
    topPages: rows(pages),
    devices: rows(devices),
    goals: goalRows
  }
}

async function getSummary(counterId, { force = false } = {}) {
  const key = String(counterId)
  const cached = summaryCache.get(key)
  if (!force && cached && Date.now() - cached.at < SUMMARY_TTL_MS) return cached.value
  const value = await loadSummary(key)
  summaryCache.set(key, { at: Date.now(), value })
  return value
}

const ANALYSIS_PROMPT = `Ты аналитик сайта. Тебе дают сводку из Яндекс Метрики (последние 7 дней против предыдущих 7, источники, страницы, устройства, цели).
Отвечай строго JSON такого вида:
{"headline":"одна фраза с главным выводом","insights":[{"title":"...","detail":"что видно в данных","impact":"high|medium|low"}],"risks":["..."],"tasks":[{"title":"конкретное задание, начинается с глагола","why":"почему это важно по данным","priority":"HIGH|NORMAL"}]}
Правила: опирайся только на присланные цифры, не выдумывай данные; если данных мало, так и скажи; 3-5 выводов и 3-5 заданий; задания конкретные и выполнимые за неделю; пиши по-русски, коротко.`

async function analyze(counterId) {
  if (!AGENT_KEY) throw new Error('AI не настроен на сервере')
  const summary = await getSummary(counterId, { force: true })
  const upstream = await axios.post(`${AGENT_BASE}/chat/completions`, {
    model: ANALYSIS_MODEL,
    messages: [{ role: 'system', content: ANALYSIS_PROMPT }, { role: 'user', content: JSON.stringify(summary) }],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  }, { headers: { Authorization: `Bearer ${AGENT_KEY}` }, timeout: 60000 })
  const raw = upstream?.data?.choices?.[0]?.message?.content
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error('Не удалось разобрать ответ AI') }
  const analysis = {
    headline: String(parsed.headline || '').slice(0, 300),
    insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 6) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 6).map((t) => ({
      title: String(t.title || '').slice(0, 200),
      why: String(t.why || '').slice(0, 500),
      priority: t.priority === 'HIGH' ? 'HIGH' : 'NORMAL'
    })).filter((t) => t.title) : []
  }
  const saved = await prisma.metrikaInsight.create({
    data: { counterId: String(counterId), summaryJson: summary, analysisJson: analysis },
    select: { id: true, createdAt: true }
  })
  return { id: saved.id, createdAt: saved.createdAt, analysis, summary }
}

// ---- overview of every counter, refreshed in the background every 30 minutes
let overviewCache = { at: 0, refreshing: false, items: [] }

async function loadOverviewItem(counter) {
  const core = ['ym:s:visits', 'ym:s:users', 'ym:s:pageviews', 'ym:s:bounceRate']
  const names = ['visits', 'users', 'pageviews', 'bounceRate']
  const pickTotals = (data) => Object.fromEntries(totalsOf(data).map((v, i) => [names[i], Math.round((v || 0) * 10) / 10]))
  const today = await report(counter.id, core, { date1: DAY(0), date2: DAY(0) })
  const yesterday = await report(counter.id, core, { date1: DAY(1), date2: DAY(1) })
  const week = await report(counter.id, core, { date1: DAY(6), date2: DAY(0) })
  const prev = await report(counter.id, core, { date1: DAY(13), date2: DAY(7) })
  const wow = pickTotals(week)
  const before = pickTotals(prev)
  return {
    id: counter.id, name: counter.name, site: counter.site,
    today: pickTotals(today), yesterday: pickTotals(yesterday), last7: wow, previous7: before,
    visitsChangePercent: before.visits ? Math.round(((wow.visits - before.visits) / before.visits) * 1000) / 10 : null
  }
}

async function refreshOverview() {
  if (overviewCache.refreshing) return overviewCache
  overviewCache.refreshing = true
  try {
    const counters = (await listCounters()).filter((c) => c.status === 'Active')
    const items = []
    for (const counter of counters) {
      try { items.push(await loadOverviewItem(counter)) } catch (err) { console.error('[metrika] overview failed for', counter.id, err.message) }
    }
    overviewCache = { at: Date.now(), refreshing: false, items }
  } catch (err) {
    overviewCache.refreshing = false
    throw err
  }
  return overviewCache
}

async function getOverview() {
  if (overviewCache.items.length === 0 || Date.now() - overviewCache.at > 35 * 60 * 1000) await refreshOverview()
  return { updatedAt: new Date(overviewCache.at).toISOString(), counters: overviewCache.items }
}

// Counters the daily AI review covers (env METRIKA_COUNTERS, comma separated).
const DEFAULT_REVIEW_COUNTERS = ['108785516', '110283896', '110597670', '96405557', '111150664', '92111401']
const reviewCounters = () => (process.env.METRIKA_COUNTERS ? process.env.METRIKA_COUNTERS.split(',').map((x) => x.trim()).filter(Boolean) : DEFAULT_REVIEW_COUNTERS)

async function runDailyReview() {
  for (const counterId of reviewCounters()) {
    try { await analyze(counterId) } catch (err) { console.error('[metrika] daily review failed for', counterId, err.message) }
  }
}

async function latestInsights() {
  const result = []
  for (const counterId of reviewCounters()) {
    const row = await prisma.metrikaInsight.findFirst({ where: { counterId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, analysisJson: true } })
    if (row) result.push({ counterId, createdAt: row.createdAt, analysis: row.analysisJson })
  }
  return result
}

module.exports = {
  apiGet, apiSend,
  getOverview, refreshOverview, runDailyReview, latestInsights, reviewCounters, exchangeCode, getConnection, listCounters, getSummary, analyze, authorizeUrl: () => `https://oauth.yandex.ru/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` }
