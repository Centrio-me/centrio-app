'use strict'
// Assistant tools added in 3.7.1: what was missed (morning summary), tab sleep, work hours, do not disturb, restore points
// and quick replies. Same rules as assistant-tools.js: no message text from inside the messengers, no secrets, nothing
// that cannot be undone (a restore point is only listed or saved here; putting one back stays a click in Settings).
const DND_HOURS = [0, 1, 2, 4, 8]

function bindAssistantTools371({ state, store, invokeIpc, buildSummary }) {
    const hib = () => window.__centrioHibernation
    const wh = () => window.__centrioWorkHours
    const dnd = () => window.__centrioDnd
    const messengerById = (id) => (state.activeMessengers || []).find((m) => String(m.id) === String(id))

    const handlers = {
        get_missed_summary() {
            return typeof buildSummary === 'function' ? buildSummary() : { error: 'unavailable' }
        },

        sleep_unused_tabs() {
            const h = hib()
            if (!h) return { error: 'unavailable' }
            const slept = []
            for (const m of state.activeMessengers || []) {
                if (state.activeTabId === m.id || (state.unreadCounts?.[m.id] || 0) > 0 || m.orgAssigned) continue
                if (typeof window.__centrioSleepTab === 'function' && window.__centrioSleepTab(m.id)) slept.push(m.name)
            }
            return { success: true, slept }
        },

        get_tab_sleep_settings() {
            const h = hib()
            if (!h) return { error: 'unavailable' }
            const s = h.readSettings()
            const keepAwake = Object.entries(s.perTab).filter(([, v]) => v === 'never').map(([id]) => messengerById(id)?.name).filter(Boolean)
            return { afterMinutes: s.afterMin, scope: s.scope, keepAwake, sleepingNow: [...state.sleepingTabs].map((id) => messengerById(id)?.name).filter(Boolean) }
        },

        set_tab_sleep_settings({ afterMinutes, scope } = {}) {
            const h = hib()
            if (!h) return { error: 'unavailable' }
            const patch = {}
            if (afterMinutes !== undefined) patch.afterMin = Number(afterMinutes)
            if (scope !== undefined) patch.scope = scope
            const s = h.setSettings(patch)
            return { success: true, afterMinutes: s.afterMin, scope: s.scope }
        },

        set_tab_keep_awake({ id, keepAwake } = {}) {
            const h = hib()
            const m = messengerById(id)
            if (!h) return { error: 'unavailable' }
            if (!m) return { error: 'messenger_not_found', id }
            h.setTabChoice(m.id, keepAwake === false ? 'auto' : 'never')
            return { success: true, name: m.name, keepAwake: keepAwake !== false }
        },

        get_work_hours() {
            const w = wh()
            if (!w) return { error: 'unavailable' }
            const p = w.personal()
            const team = w.teamStatus()
            return {
                personal: { enabled: p.enabled, days: p.schedule.days, start: p.schedule.start, end: p.schedule.end, workServices: p.workIds.map((id) => messengerById(id)?.name).filter(Boolean), personalServices: p.personalIds.map((id) => messengerById(id)?.name).filter(Boolean) },
                team: team.enabled ? { days: team.schedule.days, start: team.schedule.start, end: team.schedule.end, timeZone: team.timeZone, atWorkNow: team.atWork } : null
            }
        },

        set_work_hours({ enabled, days, start, end, workServiceIds } = {}) {
            const w = wh()
            if (!w) return { error: 'unavailable' }
            const current = w.personal()
            const patch = {}
            if (typeof enabled === 'boolean') patch.enabled = enabled
            if (days || start || end) patch.schedule = { days: Array.isArray(days) ? days : current.schedule.days, start: start || current.schedule.start, end: end || current.schedule.end }
            if (Array.isArray(workServiceIds)) patch.workIds = workServiceIds.map(String).filter((id) => messengerById(id) && !messengerById(id).orgAssigned)
            const next = w.setPersonal(patch)
            return { success: true, enabled: next.enabled, days: next.schedule.days, start: next.schedule.start, end: next.schedule.end, workServices: next.workIds.map((id) => messengerById(id)?.name).filter(Boolean) }
        },

        set_do_not_disturb({ on, hours } = {}) {
            const d = dnd()
            if (!d) return { error: 'unavailable' }
            if (on === false) { d.stop(); return { success: true, on: false } }
            const h = DND_HOURS.includes(Number(hours)) ? Number(hours) : 1
            d.start(h)
            return { success: true, on: true, hours: h || 'until_turned_off' }
        },

        async list_restore_points() {
            const res = await invokeIpc('restore-points:list').catch(() => null)
            if (!res?.success) return { error: 'unavailable' }
            return { points: res.data.map((p) => ({ at: new Date(p.at).toISOString(), reason: p.reason, ...p.summary })), howToRestore: 'Настройки → Система → Точки восстановления' }
        },

        async create_restore_point() {
            const res = await invokeIpc('restore-points:create').catch(() => null)
            return res?.success ? { success: true, at: new Date(res.data.at).toISOString(), ...res.data.summary } : { error: 'save_failed' }
        },

        list_quick_replies() {
            const own = (store.get('quickReplies', []) || []).map((r) => ({ title: r.title, text: r.text, source: 'own' }))
            const team = (window.__centrioTeamQuickReplies || []).map((r) => ({ title: r.title, text: r.text, source: 'team' }))
            return { replies: [...team, ...own] }
        }
    }

    const schemas = [
        {
            name: 'get_missed_summary',
            description: 'Сводка «что я пропустил»: по каждому сервису число непрочитанных и кто писал с прошлого раза (только имена и сколько раз, без текста), плюс число открытых задач. Используй, когда спрашивают «что нового», «что я пропустил», «кому ответить».',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'sleep_unused_tabs',
            description: 'Усыпить сейчас все неиспользуемые вкладки (освободить память). Открытая вкладка, вкладки с непрочитанными и мессенджеры команды не трогаются.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'get_tab_sleep_settings',
            description: 'Настройки автоматического сна вкладок: через сколько минут, какие вкладки, какие никогда не засыпают, какие спят сейчас.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'set_tab_sleep_settings',
            description: 'Изменить автоматический сон вкладок. afterMinutes: 0 (выключить), 15, 30, 60 или 120. scope: quiet (только сервисы без новых сообщений и мессенджеры с выключенными уведомлениями) или all (все вкладки, тогда спящие мессенджеры не присылают уведомлений).',
            parameters: {
                type: 'object',
                properties: {
                    afterMinutes: { type: 'number', enum: [0, 15, 30, 60, 120] },
                    scope: { type: 'string', enum: ['quiet', 'all'] }
                },
                required: []
            }
        },
        {
            name: 'set_tab_keep_awake',
            description: 'Запретить (keepAwake=true) или снова разрешить (keepAwake=false) автоматический сон конкретной вкладки по id из list_messengers.',
            parameters: { type: 'object', properties: { id: { type: 'string' }, keepAwake: { type: 'boolean' } }, required: ['id'] }
        },
        {
            name: 'get_work_hours',
            description: 'Рабочее время: личный график пользователя (дни 1=Пн..7=Вс, часы, рабочие сервисы, которые затихают вне графика) и график команды, если его задал руководитель.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'set_work_hours',
            description: 'Изменить личный график. Вне рабочего времени выбранные сервисы не присылают всплывающих уведомлений и не звучат. days — номера дней 1=Пн..7=Вс, start/end — "HH:MM", workServiceIds — id из list_messengers. График команды меняет только руководитель на centrio.me/team.',
            parameters: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    days: { type: 'array', items: { type: 'number' } },
                    start: { type: 'string', description: 'HH:MM' },
                    end: { type: 'string', description: 'HH:MM' },
                    workServiceIds: { type: 'array', items: { type: 'string' } }
                },
                required: []
            }
        },
        {
            name: 'set_do_not_disturb',
            description: 'Включить «Не беспокоить» на 1, 2, 4 или 8 часов (hours=0 — пока не выключат) или выключить (on=false).',
            parameters: { type: 'object', properties: { on: { type: 'boolean' }, hours: { type: 'number', enum: DND_HOURS } }, required: [] }
        },
        {
            name: 'list_restore_points',
            description: 'Список точек восстановления настроек (когда сделана, сколько сервисов, папок, сплитов). Восстановить пользователь может сам в Настройки → Система.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'create_restore_point',
            description: 'Сохранить точку восстановления прямо сейчас (копия сервисов, папок, сплитов и настроек).',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'list_quick_replies',
            description: 'Быстрые ответы пользователя: свои и общие от руководителя команды (source=team).',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    ]

    return { handlers, schemas }
}

module.exports = { bindAssistantTools371 }
