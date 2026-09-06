'use strict'

// SECURITY (2026-09-06, аудит): узкий мост между security:verify-pin
// (main/ipc/window.js) и generic store:set (main.js) для ключа 'security'.
// Легитимный UI (renderer/lock.js/settings-bind.js) уже требует ввести
// текущий PIN перед его отключением (tryDisablePin -> security:verify-pin,
// затем store.set('security', {enabled:false,...})) — но сам store:set не
// проверял вообще ничего, так что тот же самый вызов store.set('security',
// {...}) можно было сделать напрямую из DevTools Console в обход
// verify-pin, молча сняв или подменив PIN на уже разблокированной/открытой
// сессии. Разовый короткоживущий "грант" ниже: успешная проверка PIN даёт
// главному процессу право на ОДНУ следующую запись в 'security' в течение
// нескольких секунд — этого достаточно для существующих сценариев
// (отключение PIN, сброс при разблокировке), но не даёт просто
// перезаписать 'security' без предварительного знания текущего PIN.
const GRANT_TTL_MS = 10_000
let grantedUntil = 0

function grantSecurityChange() {
    grantedUntil = Date.now() + GRANT_TTL_MS
}

// Разовый — использование грант тут же гасит, повторный store:set снова
// потребует свежей проверки PIN.
function consumeSecurityChangeGrant() {
    const ok = Date.now() < grantedUntil
    grantedUntil = 0
    return ok
}

module.exports = { grantSecurityChange, consumeSecurityChangeGrant }
