// Settings for the 3.7.1 features: work hours (Notifications), tab sleep and restore points (System).
// Drawn from code into the empty groups of index.html, redrawn when the section is opened.
const { AFTER_MIN_CHOICES } = require('./hibernation-logic')

const DAY_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']

function bindSettings371({ state, store, tGet, invokeIpc, getMorningSummary }) {
    const t = (key, params) => tGet(`v371.${key}`, params)
    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }
    const title = (text) => el('div', 'settings-group-title', text)
    function row(label, hint, control) {
        const r = el('div', 'settings-row')
        const l = el('div', 'settings-label')
        l.appendChild(el('span', '', label))
        if (hint) l.appendChild(el('span', 'settings-hint', hint))
        r.appendChild(l)
        if (control) r.appendChild(control)
        return r
    }
    function select(options, value, onChange) {
        const s = el('select', 'vsc-select')
        options.forEach(([v, label]) => {
            const o = el('option', '', label)
            o.value = String(v)
            if (String(v) === String(value)) o.selected = true
            s.appendChild(o)
        })
        s.addEventListener('change', () => onChange(s.value))
        return s
    }
    function toggle(checked, onChange) {
        const label = el('label', 'toggle')
        const input = el('input')
        input.type = 'checkbox'
        input.checked = checked
        input.addEventListener('change', () => onChange(input.checked))
        label.appendChild(input)
        label.appendChild(el('span', 'toggle-slider'))
        return label
    }
    const button = (text, className, onClick) => {
        const b = el('button', className, text)
        b.type = 'button'
        b.addEventListener('click', onClick)
        return b
    }

    // ── Tab sleep ─────────────────────────────────────────────────────────────
    function renderHibernate() {
        const group = document.getElementById('hibernateGroup')
        const hib = window.__centrioHibernation
        if (!group || !hib) return
        const settings = hib.readSettings()
        group.textContent = ''
        group.appendChild(title(t('hib.title')))
        const afterOptions = AFTER_MIN_CHOICES.map((m) => [m, m === 0 ? t('hib.off') : (m < 60 ? t('hib.minutes', { n: m }) : t('hib.hours', { n: m / 60 }))])
        group.appendChild(row(t('hib.after'), t('hib.afterHint'), select(afterOptions, settings.afterMin, (v) => { hib.setSettings({ afterMin: Number(v) }); renderHibernate() })))
        if (settings.afterMin > 0) {
            group.appendChild(row(t('hib.scope'), settings.scope === 'all' ? t('hib.scopeAllHint') : t('hib.scopeQuietHint'),
                select([['quiet', t('hib.scopeQuiet')], ['all', t('hib.scopeAll')]], settings.scope, (v) => { hib.setSettings({ scope: v }); renderHibernate() })))
        }
        group.appendChild(el('div', 'v371-note', t('hib.never')))
    }

    // ── Restore points ─────────────────────────────────────────────────────────
    const formatAt = (at) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    const summaryText = (s) => [
        t('rp.services', { n: s?.messengers || 0 }),
        s?.folders ? t('rp.folders', { n: s.folders }) : '',
        s?.presets ? t('rp.presets', { n: s.presets }) : '',
        s?.quickReplies ? t('rp.replies', { n: s.quickReplies }) : ''
    ].filter(Boolean).join(' · ')

    async function renderRestorePoints(message) {
        const group = document.getElementById('restorePointsGroup')
        if (!group) return
        const res = await invokeIpc('restore-points:list').catch(() => null)
        const points = res && res.success ? res.data : []
        group.textContent = ''
        group.appendChild(title(t('rp.title')))
        group.appendChild(row(t('rp.lead'), t('rp.leadHint'), button(t('rp.saveNow'), 'vsc-btn-secondary', async () => {
            const made = await invokeIpc('restore-points:create').catch(() => null)
            renderRestorePoints(made && made.success ? t('rp.saved') : t('rp.saveFailed'))
        })))
        if (message) group.appendChild(el('div', 'v371-note v371-note-ok', message))
        const list = el('div', 'v371-rp-list')
        if (!points.length) list.appendChild(el('div', 'v371-note', t('rp.empty')))
        points.forEach((p) => {
            const item = el('div', 'v371-rp-item')
            const info = el('div', 'v371-rp-info')
            info.appendChild(el('div', 'v371-rp-when', `${formatAt(p.at)} · ${t(`rp.reason_${p.reason}`)}`))
            info.appendChild(el('div', 'v371-rp-what', summaryText(p.summary)))
            item.appendChild(info)
            const actions = el('div', 'v371-rp-actions')
            actions.appendChild(button(t('rp.restore'), 'vsc-btn-secondary', async () => {
                const ok = await window.showConfirmModal?.({
                    title: t('rp.confirmTitle'),
                    message: t('rp.confirmText', { when: formatAt(p.at) }),
                    confirmText: t('rp.restore'),
                    cancelText: t('cancel')
                })
                if (!ok) return
                const done = await invokeIpc('restore-points:restore', p.id).catch(() => null)
                if (!done || !done.success) renderRestorePoints(t('rp.restoreFailed'))
            }))
            actions.appendChild(button('✕', 'v371-rp-del', async () => {
                await invokeIpc('restore-points:remove', p.id).catch(() => null)
                renderRestorePoints()
            })).title = t('rp.delete')
            item.appendChild(actions)
            list.appendChild(item)
        })
        group.appendChild(list)
    }

    // ── Work hours ─────────────────────────────────────────────────────────────
    const dayNames = () => DAY_KEYS.map((k) => t(`wh.${k}`))
    function scheduleText(schedule) {
        if (!schedule) return ''
        const names = dayNames()
        const days = schedule.days.map((d) => names[d - 1]).join(', ')
        return `${days}, ${schedule.start}–${schedule.end}`
    }

    function timeInput(value, onChange) {
        const input = el('input', 'vsc-input v371-time')
        input.type = 'time'
        input.value = value
        input.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(input.value)) onChange(input.value) })
        return input
    }

    function renderWorkHours() {
        const group = document.getElementById('workHoursGroup')
        const wh = window.__centrioWorkHours
        if (!group || !wh) return
        group.textContent = ''
        group.appendChild(title(t('wh.title')))

        const team = wh.team()
        if (team.schedule) {
            const box = el('div', 'v371-team-hours')
            box.appendChild(el('b', '', t('wh.teamLine', { hours: scheduleText(team.schedule) })))
            box.appendChild(el('span', '', t('wh.teamHint')))
            group.appendChild(box)
        }

        const p = wh.personal()
        group.appendChild(row(t('wh.enable'), t('wh.enableHint'), toggle(p.enabled, (on) => { wh.setPersonal({ enabled: on }); renderWorkHours() })))
        if (!p.enabled) return

        const days = el('div', 'v371-days')
        dayNames().forEach((name, i) => {
            const d = i + 1
            const chip = button(name, `v371-day${p.schedule.days.includes(d) ? ' on' : ''}`, () => {
                const set = new Set(p.schedule.days)
                if (set.has(d)) set.delete(d); else set.add(d)
                if (!set.size) return
                wh.setPersonal({ schedule: { ...p.schedule, days: [...set] } })
                renderWorkHours()
            })
            days.appendChild(chip)
        })
        group.appendChild(row(t('wh.days'), '', days))

        const times = el('div', 'v371-times')
        times.appendChild(timeInput(p.schedule.start, (v) => { wh.setPersonal({ schedule: { ...p.schedule, start: v } }); renderWorkHours() }))
        times.appendChild(el('span', 'v371-dash', '—'))
        times.appendChild(timeInput(p.schedule.end, (v) => { wh.setPersonal({ schedule: { ...p.schedule, end: v } }); renderWorkHours() }))
        group.appendChild(row(t('wh.hours'), t('wh.hoursHint'), times))

        const services = state.activeMessengers.filter((m) => !m.orgAssigned)
        const list = el('div', 'v371-svc-list')
        services.forEach((m) => {
            const item = el('label', 'v371-svc')
            const box = el('input')
            box.type = 'checkbox'
            box.checked = p.workIds.includes(m.id)
            box.addEventListener('change', () => {
                const ids = new Set(wh.personal().workIds)
                if (box.checked) ids.add(m.id); else ids.delete(m.id)
                wh.setPersonal({ workIds: [...ids] })
            })
            const icon = el('img', 'v371-svc-icon')
            icon.src = m.icon || 'assets/logo.png'
            icon.alt = ''
            item.appendChild(box)
            item.appendChild(icon)
            item.appendChild(el('span', '', m.name))
            list.appendChild(item)
        })
        group.appendChild(el('div', 'v371-sub', t('wh.servicesTitle')))
        group.appendChild(el('div', 'v371-note', t('wh.servicesHint')))
        group.appendChild(list)
    }

    // ── Morning summary (Settings → AI assistant) ─────────────────────────────
    function renderMorningSummary(message) {
        const group = document.getElementById('morningSummaryGroup')
        const ms = getMorningSummary?.()
        if (!group || !ms) return
        group.textContent = ''
        group.appendChild(title(tGet('v371.ms.settingsTitle')))
        group.appendChild(row(tGet('v371.ms.settingsTitle'), tGet('v371.ms.settingsHint'), toggle(ms.isEnabled(), (on) => { ms.setEnabled(on); renderMorningSummary() })))
        group.appendChild(row('', '', button(tGet('v371.ms.showNow'), 'vsc-btn-secondary', () => {
            const shown = ms.showNow()
            if (!shown) renderMorningSummary(tGet('v371.ms.nothing'))
        })))
        if (message) group.appendChild(el('div', 'v371-note', message))
    }

    function renderAll() {
        renderHibernate()
        renderRestorePoints()
        renderWorkHours()
        renderMorningSummary()
    }

    document.querySelectorAll('.settings-nav-item[data-section]').forEach((nav) => {
        nav.addEventListener('click', () => {
            const section = nav.dataset.section
            if (section === 'system') { renderHibernate(); renderRestorePoints() }
            if (section === 'notifications') renderWorkHours()
            if (section === 'assistant') renderMorningSummary()
        })
    })
    const modal = document.getElementById('settingsModal')
    if (modal) {
        new MutationObserver(() => { if (modal.classList.contains('show')) renderAll() })
            .observe(modal, { attributes: true, attributeFilter: ['class'] })
    }
    renderAll()

    return { renderAll, scheduleText }
}

module.exports = { bindSettings371 }
