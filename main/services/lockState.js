// ── Состояние "экран блокировки активен" в main-процессе ────────────────────
// До этого main-процесс вообще не знал, заблокирован ли сейчас экран — только
// renderer/lock.js хранил это как CSS-класс body.startup-locked. Из-за этого
// нативные OS-уведомления (main/ipc/notifications.js) продолжали всплывать
// поверх лок-скрина, что противоречит самому смыслу блокировки экрана.
//
// Простой in-memory флаг (не electron-store — переживать перезапуск ему не
// нужно: при старте приложения лок-скрин либо сам покажется и пришлёт true,
// либо не покажется вовсе). renderer/lock.js шлёт актуальное состояние через
// IPC 'lock:set-state' из showLockScreen()/hideLockScreen() — см. регистрацию
// слушателя в main/ipc/notifications.js.
let locked = false
const listeners = []

function setLocked(value) {
    const next = !!value
    if (next === locked) return
    locked = next
    listeners.forEach((fn) => { try { fn(locked) } catch { /* a listener must not break locking */ } })
}

function isLocked() {
    return locked
}

// Other main-process services (separate messenger windows) hide themselves while the app is locked.
function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn)
}

module.exports = { setLocked, isLocked, onChange }
