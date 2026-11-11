// Work hours in the app (3.7.1). Outside them some services go quiet: no pop-ups, no sound (the unread counter still
// counts). Two sources: the team's schedule set by the owner (team messengers of an employee) and the person's own
// schedule with the services they marked as work ones. The rules are in shared/work-hours.js.
const { quietReason, normalizeSchedule, isWithinWorkHours, nextChange } = require('../shared/work-hours')

const TICK_MS = 60 * 1000
const DEFAULT_PERSONAL = Object.freeze({ enabled: false, schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }, workIds: [], personalIds: [] })

function createWorkHours({ state, store }) {
    const readAll = () => store.get('workHours', {}) || {}

    const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [])

    function personal() {
        const raw = readAll().personal || {}
        return {
            enabled: raw.enabled === true,
            schedule: normalizeSchedule(raw.schedule) || { ...DEFAULT_PERSONAL.schedule },
            workIds: ids(raw.workIds),
            // personal services: quiet during work hours (a service is in one list at most, work wins)
            personalIds: ids(raw.personalIds).filter((id) => !ids(raw.workIds).includes(id))
        }
    }

    function team() {
        const raw = readAll().team || {}
        return { schedule: normalizeSchedule(raw.schedule), timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : null }
    }

    function reasonFor(messenger, now = new Date()) {
        return quietReason(messenger, { team: team(), personal: personal(), now })
    }

    const isQuiet = (messenger) => !!reasonFor(messenger)

    function setPersonal(patch) {
        const current = personal()
        const next = { ...current, ...patch }
        next.schedule = normalizeSchedule(next.schedule) || current.schedule
        // a service put in one list leaves the other
        if (patch.workIds) next.personalIds = next.personalIds.filter((id) => !patch.workIds.includes(id))
        if (patch.personalIds) next.workIds = next.workIds.filter((id) => !patch.personalIds.includes(id))
        store.set('workHours', { ...readAll(), personal: next })
        refreshMarks()
        return personal()
    }

    function setTeamSchedule(value) {
        const schedule = normalizeSchedule(value?.schedule)
        store.set('workHours', { ...readAll(), team: { schedule, timeZone: value?.timeZone || null } })
        refreshMarks()
    }

    /** For the status line and the assistant: is the person at work now, and when does that change. */
    function personalStatus(now = new Date()) {
        const p = personal()
        if (!p.enabled) return { enabled: false }
        return { enabled: true, atWork: isWithinWorkHours(p.schedule, now), changesAt: nextChange(p.schedule, now) }
    }

    function teamStatus(now = new Date()) {
        const t = team()
        if (!t.schedule) return { enabled: false }
        return { enabled: true, atWork: isWithinWorkHours(t.schedule, now, t.timeZone), changesAt: nextChange(t.schedule, now, t.timeZone), schedule: t.schedule, timeZone: t.timeZone }
    }

    // A small moon on quiet services in the sidebar, so a missing pop-up is never a mystery.
    function refreshMarks() {
        const now = new Date()
        state.activeMessengers.forEach((m) => {
            const reason = reasonFor(m, now)
            const item = document.getElementById(`sidebar-${m.id}`)
            if (!item) return
            item.classList.toggle('is-off-hours', !!reason)
        })
    }

    setInterval(refreshMarks, TICK_MS)
    setTimeout(refreshMarks, 3000)

    return { isQuiet, reasonFor, personal, team, setPersonal, setTeamSchedule, personalStatus, teamStatus, refreshMarks }
}

module.exports = { createWorkHours, DEFAULT_PERSONAL }
