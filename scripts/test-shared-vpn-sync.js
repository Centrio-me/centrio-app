'use strict'
// The team VPN in the cabinet is usually a subscription url (https://...). 'vpn-connect-saved' only parses a single
// vless/vmess/... link and throws on https, so every employee's sync failed silently and the VPN never came up.
// The sync must go through 'vpn-connect', which takes both a subscription and a single link.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'org-team.js'), 'utf8')
const body = src.slice(src.indexOf('async function syncSharedVpn'), src.indexOf('async function syncSharedVpn') + 900)

test('the team VPN sync connects through vpn-connect (subscriptions work)', () => {
    assert.match(body, /invokeIpc\('vpn-connect', link\)/)
    assert.doesNotMatch(body, /vpn-connect-saved/)
})

test('a missing engine is still downloaded first', () => {
    assert.match(body, /needsDownload[\s\S]*vpn-download-and-connect/)
})
