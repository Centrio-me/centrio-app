'use strict'
// 3.7.4: Яндекс Телемост and the Yandex messenger keep «Получать уведомления» off until the site itself asks the
// browser for permission (its «Включить уведомления» prompt). Centrio grants the permission up front, so the site
// never asked, the setting stayed off and Telemost sent no notifications at all. Once per account Centrio switches
// them on — exactly what a browser user does by accepting the prompt. A done-mark per account means a person who
// switches them off later is never overruled.

const SETTINGS_KEY_RE = /^mssngr\/settings\/[0-9a-f-]{6,64}$/i
const DONE_PREFIX = 'centrio:notif-enabled:'

/** @returns {object|null} the settings to save, or null when nothing should change */
function enableOnce(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
    if (settings.enableNotifications !== false) return null
    return { ...settings, enableNotifications: true, enableNotificationText: true, notificationPopupShown: true }
}

// Injected into the page on dom-ready (main/bootstrap/registerAppEvents.js). Built from the regexes above so the
// page script and the tested helper never drift; plain ES5 inside, no names that minification could change.
const PAGE_SCRIPT = `(function () {
    try {
        var keyRe = ${SETTINGS_KEY_RE.toString()}
        var done = ${JSON.stringify(DONE_PREFIX)}
        var changed = false
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i)
            if (!key || !keyRe.test(key) || localStorage.getItem(done + key)) continue
            var settings = null
            try { settings = JSON.parse(localStorage.getItem(key)) } catch (e) {}
            localStorage.setItem(done + key, '1')
            if (!settings || typeof settings !== 'object' || settings.enableNotifications !== false) continue
            settings.enableNotifications = true
            settings.enableNotificationText = true
            settings.notificationPopupShown = true
            localStorage.setItem(key, JSON.stringify(settings))
            changed = true
        }
        // the site reads its settings when it starts: one reload makes it notify from now on
        if (changed && !sessionStorage.getItem(done + 'reloaded')) {
            sessionStorage.setItem(done + 'reloaded', '1')
            location.reload()
        }
        return changed
    } catch (e) { return false }
})()`

/** Only Yandex pages keep these settings. @param {string} url */
function appliesTo(url) {
    try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'telemost.yandex.ru' || host === 'telemost.360.yandex.ru' || /(^|\.)messenger\.yandex\.(ru|com)$/.test(host) || /(^|\.)yandex\.(ru|com|by|kz)$/.test(host)
    } catch { return false }
}

/** Pages that rely on web push while hidden and therefore stay «visible» (main/services/keepVisible.js). @param {string} url */
function staysVisible(url) {
    try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'telemost.yandex.ru' || host === 'telemost.360.yandex.ru' || /(^|.)messenger.yandex.(ru|com)$/.test(host)
    } catch { return false }
}

module.exports = { SETTINGS_KEY_RE, DONE_PREFIX, enableOnce, PAGE_SCRIPT, appliesTo, staysVisible }
