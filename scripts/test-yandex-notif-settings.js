'use strict'
// 3.7.4: Яндекс Телемост (and the Yandex messenger in it) keeps «Получать уведомления» off until the site asks the
// browser for permission. Centrio grants the permission up front, so the site never asked and never notified:
// 0 notifications from Telemost. Centrio switches them on once per account, the way a browser user would.
const test = require('node:test')
const assert = require('node:assert/strict')
const { enableOnce, SETTINGS_KEY_RE, DONE_PREFIX } = require('../shared/yandex-notif-settings')

const off = { sendByEnter: true, enableNotifications: false, enableNotificationText: false, enableNotificationSound: false, notificationPopupShown: false }

test('notifications that were never set up are switched on with the message text', () => {
    const next = enableOnce(off)
    assert.equal(next.enableNotifications, true)
    assert.equal(next.enableNotificationText, true)
    assert.equal(next.enableNotificationSound, false) // Centrio plays its own sound
    assert.equal(next.sendByEnter, true)
})

test('settings already on are left as they are', () => {
    assert.equal(enableOnce({ ...off, enableNotifications: true }), null)
})

test('anything that is not a settings object is ignored', () => {
    assert.equal(enableOnce(null), null)
    assert.equal(enableOnce('x'), null)
    assert.equal(enableOnce({ sendByEnter: true }), null)
})

test('only the Yandex messenger settings keys are touched', () => {
    assert.ok(SETTINGS_KEY_RE.test('mssngr/settings/73cc50f5-f22f-85bd-1efb-57cb09c7c874'))
    assert.ok(!SETTINGS_KEY_RE.test('mssngr/call-settings/0'))
    assert.ok(!SETTINGS_KEY_RE.test('other'))
    assert.ok(DONE_PREFIX.startsWith('centrio:'))
})
