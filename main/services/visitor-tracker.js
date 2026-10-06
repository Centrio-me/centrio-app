'use strict'

/**
 * Visitor tracker — отслеживает анонимных пользователей (без входа в аккаунт).
 * Отправляет пинг на сервер с анонимным UUID при каждом запуске.
 */

const { app }  = require('electron')
const store    = require('./store')
const https    = require('https')
const http     = require('http')

const API_URL       = 'https://api.centrio.me'
const PING_INTERVAL = 5 * 60 * 1000  // 5 минут

let _interval = null

// Launches made by development, tests or QA must never reach the statistics: an unpackaged app, a debugging port,
// a throw-away profile folder or CENTRIO_NO_STATS all mean "not a real person".
function countsAsVisitor () {
    if (!app.isPackaged) return false
    if (process.env.CENTRIO_NO_STATS) return false
    return !process.argv.some((arg) => /^--(remote-debugging-port|user-data-dir|inspect)/.test(arg))
}

// Anonymous product events (what people do in the first minutes). Names only, no content; allow-listed on both sides.
const EVENT_NAME = /^[a-z0-9_]{3,40}$/
function track (event, props) {
    if (!countsAsVisitor()) return Promise.resolve(null)
    if (typeof event !== 'string' || !EVENT_NAME.test(event)) return Promise.resolve(null)
    const safeProps = {}
    if (props && typeof props === 'object') {
        for (const [key, value] of Object.entries(props).slice(0, 5)) {
            if (/^[a-z0-9_]{1,20}$/.test(key) && (typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && value.length <= 40))) safeProps[key] = value
        }
    }
    return post('/api/visitors/event', { visitorId: getVisitorId(), event, props: safeProps, platform: process.platform, appVersion: app.getVersion() })
}

// ── Получить или создать анонимный ID ─────────────────────────────
function getVisitorId () {
    let id = store.get('visitorId')
    if (!id) {
        id = generateUUID()
        store.set('visitorId', id)
    }
    return id
}

function generateUUID () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
}

// ── Проверить: пользователь вошёл? ────────────────────────────────
function isLoggedIn () {
    const token = store.get('cloud.accessToken')
    return !!token
}

// ── Получить кол-во мессенджеров из store ─────────────────────────
function getMessengersCount () {
    try {
        const messengers = store.get('messengers', [])
        return Array.isArray(messengers) ? messengers.length : 0
    } catch { return 0 }
}

// ── Отправить запрос ──────────────────────────────────────────────
function post (endpoint, body) {
    return new Promise((resolve) => {
        try {
            const data   = JSON.stringify(body)
            const urlStr = API_URL + endpoint
            const mod    = urlStr.startsWith('https') ? https : http
            const urlObj = new URL(urlStr)

            const req = mod.request({
                hostname: urlObj.hostname,
                port:     urlObj.port || (urlStr.startsWith('https') ? 443 : 80),
                path:     urlObj.pathname,
                method:   'POST',
                headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            }, (res) => {
                res.resume()  // drain response
                resolve(res.statusCode)
            })

            req.on('error', () => resolve(null))
            req.setTimeout(8000, () => { req.destroy(); resolve(null) })
            req.write(data)
            req.end()
        } catch { resolve(null) }
    })
}

// ── Пинг ──────────────────────────────────────────────────────────
async function ping () {
    if (!countsAsVisitor()) return
    if (isLoggedIn()) return   // авторизованные пользователи не нужны здесь
    try {
        await post('/api/visitors/ping', {
            visitorId:       getVisitorId(),
            platform:        process.platform,
            appVersion:      app.getVersion(),
            messengersCount: getMessengersCount()
        })
    } catch {}
}

// ── Регистрация новой сессии ──────────────────────────────────────
async function registerSession () {
    if (!countsAsVisitor()) return
    if (isLoggedIn()) return
    try {
        await post('/api/visitors/session', {
            visitorId:  getVisitorId(),
            platform:   process.platform,
            appVersion: app.getVersion()
        })
    } catch {}
}

// ── Start / stop ──────────────────────────────────────────────────
function start () {
    if (_interval) return
    // Регистрируем сессию при запуске
    registerSession().catch(() => {})
    // Периодический пинг
    _interval = setInterval(() => {
        ping().catch(() => {})
    }, PING_INTERVAL)
}

function stop () {
    if (_interval) {
        clearInterval(_interval)
        _interval = null
    }
}

// Пересмотреть при авторизации/деавторизации: остановить пинги когда юзер вошёл
function onAuthStateChange () {
    if (isLoggedIn()) {
        stop()
    } else {
        start()
    }
}

module.exports = { start, stop, onAuthStateChange, getVisitorId, track, countsAsVisitor }
