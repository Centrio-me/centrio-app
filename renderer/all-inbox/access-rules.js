'use strict'
// «Все мессенджеры»: who gets the mode. It is a PRO mode (alpha testing, 11.2026), on by default, and the person can
// switch it off in Settings → Все мессенджеры. Saved as store `allInbox: { enabled }`.

/** @param {unknown} saved the store value `allInbox` */
function isEnabledIn(saved) {
    return !(saved && typeof saved === 'object' && saved.enabled === false)
}

/**
 * @param {{ enabled: boolean, pro: boolean }} who
 * @returns {'open' | 'locked' | 'hidden'} hidden: no button; locked: the button asks for PRO; open: the mode works
 */
function accessOf({ enabled, pro }) {
    if (!enabled) return 'hidden'
    return pro ? 'open' : 'locked'
}

module.exports = { accessOf, isEnabledIn }
