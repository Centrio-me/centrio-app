'use strict'
// In-app windows from the owner: asks the server which are for this person and tells it what the person did with one.
// Works without an account (the install id stands in for the person). Network only; the rules are in the renderer.
const https = require('https')
const store = require('./store')
const { decryptValue } = require('./secureStore')
const visitorTracker = require('./visitor-tracker')

const HOST = 'api.centrio.me'
const TIMEOUT_MS = 8000
const EVENTS = ['shown', 'click', 'close', 'reopen']
const ID_RE = /^[a-f0-9]{6,32}$/

function request(method, path, body) {
    return new Promise((resolve) => {
        try {
            const token = decryptValue(store.get('cloud.accessToken', null))
            const data = body ? JSON.stringify(body) : null
            const headers = { Accept: 'application/json' }
            if (token) headers.Authorization = `Bearer ${token}`
            if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data) }
            const req = https.request({ host: HOST, path, method, headers }, (res) => {
                let text = ''
                res.setEncoding('utf8')
                res.on('data', (chunk) => { if (text.length < 200000) text += chunk })
                res.on('end', () => {
                    try { resolve({ status: res.statusCode, json: JSON.parse(text) }) } catch { resolve({ status: res.statusCode, json: null }) }
                })
            })
            req.on('error', () => resolve(null))
            req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve(null) })
            if (data) req.write(data)
            req.end()
        } catch { resolve(null) }
    })
}

/** @returns {Promise<object[]>} the windows for this person, [] when the server cannot be reached */
async function fetchActive() {
    const r = await request('GET', `/api/announcements/active?visitorId=${encodeURIComponent(visitorTracker.getVisitorId())}`)
    return r && r.status === 200 && r.json && Array.isArray(r.json.items) ? r.json.items : []
}

/** The numbers in the admin count real people only: a development or test launch does not send events. */
async function sendEvent(id, event) {
    if (!ID_RE.test(String(id)) || !EVENTS.includes(event)) return false
    if (!visitorTracker.countsAsVisitor()) return false
    const r = await request('POST', `/api/announcements/${id}/event`, { event, visitorId: visitorTracker.getVisitorId() })
    return !!r && r.status === 200
}

module.exports = { fetchActive, sendEvent }
