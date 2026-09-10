// ── PRO entitlement — единственный источник правды ──────────────────────────
// Раньше `cloud.user` (в т.ч. поле `plan`) и `localProTrialExpiresAt`
// сохранялись в electron-store через тот же общий IPC-канал `store:set`,
// который renderer вызывает для любых обычных настроек. Это давало любому
// JS в renderer-контексте (DevTools Console, F12 доступен по умолчанию —
// см. main.js) возможность самому объявить себя Pro без единого сетевого
// запроса: `window.electronAPI.storeSet('cloud.user', {plan:'PRO', ...})`.
// Тот же результат достигался прямой правкой файла electron-store на диске.
//
// Исправление: main.js блокирует запись этих двух ключей через общий
// store:set/secure-set (см. PROTECTED_STORE_KEYS в main.js). Их запись
// теперь возможна ТОЛЬКО отсюда — и вызывается только из мест, где main
// сам получил ответ от боевого API по TLS (main/ipc/api.js, main/ipc/oauth.js),
// а не из данных, присланных рендерером.
const store = require('./store')

const FREE_MESSENGER_LIMIT = 3

function persistCloudUser(user) {
    if (!user || typeof user !== 'object') return
    store.set('cloud.user', user)
}

function persistTrialExpiry(iso) {
    if (typeof iso !== 'string' || !iso) return
    // Basic sanity check — must parse to a real date, otherwise ignore.
    if (Number.isNaN(new Date(iso).getTime())) return
    store.set('localProTrialExpiresAt', iso)
}

// Совпадает по логике с hasEffectivePro() в renderer.js — план аккаунта ИЛИ
// ещё не истёкший локальный 14-дневный триал. Эта копия — единственная,
// которой можно доверять для проверок в main-процессе (main/ipc/extensions.js,
// main.js's store:set гейт лимита мессенджеров), т.к. renderer больше не
// может исказить ни одно из двух значений, от которых она зависит.
//
// FEATURE (2026-09-10, "свяжи Pro-доступ с оплаченным местом в команде. И
// бесплатно никому не даём" — live product decision): added a third OR
// branch — orgSummary.orgProSeat, computed server-side (getProSeatHolderIds
// in landing/lib/org.js) and delivered read-only inside cloud.user, same
// trust posture as `plan` itself (never client-writable, see the file-level
// comment above). A team member gets Pro purely by occupying one of the
// org's actually-PAID seats — the free base seats intentionally grant
// nothing, matching the "никому бесплатно" instruction exactly.
function isEffectivePro() {
    try {
        const cloudUser = store.get('cloud.user', null)
        const plan = String(cloudUser?.plan || 'FREE').toUpperCase()
        if (plan !== 'FREE') return true

        const trialExpiresAt = store.get('localProTrialExpiresAt', null)
        if (trialExpiresAt && new Date(trialExpiresAt) > new Date()) return true

        if (cloudUser?.orgSummary?.orgProSeat === true) return true

        return false
    } catch {
        return false
    }
}

// Корпоративная версия (TEAM) — Phase 1 (см. Obsidian → Centrio →
// Корпоративная версия). persistCloudUser() above already stores the ENTIRE
// server-supplied `user` object generically, so the server adding an
// `orgSummary` field to /login and /me (see landing/lib/org.js,
// getOrgSummaryForUser) needed zero changes here or in main.js's store
// backstop — this is just a typed reader for that data, mirroring
// isEffectivePro()'s read-only access pattern. Returns null when the user
// isn't in an organization, same as the server-side shape.
function getOrgInfo() {
    try {
        const orgSummary = store.get('cloud.user', null)?.orgSummary
        if (!orgSummary || typeof orgSummary !== 'object') return null
        return orgSummary
    } catch {
        return null
    }
}

module.exports = {
    persistCloudUser,
    persistTrialExpiry,
    isEffectivePro,
    getOrgInfo,
    FREE_MESSENGER_LIMIT
}
