'use strict'
// Calendar with tasks (3.7.2, owner's request: "задачи и календарь — одно целое, как в Todoist").
// The date in the status bar opens it. Days with tasks carry dots (red: something is overdue), a click on a day shows
// that day's tasks and an input that adds a task to it. Text such as "завтра !1" or "12.11" still wins over the
// picked day (shared/task-parse.js). Tasks themselves live in the task panel (renderer/todos-bind.js): one store.
const { parseQuickTask, isoDate, tasksByDate, dayTasks, overdueTasks } = require('../shared/task-parse')

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 }
const MAX_DOTS = 3

function createTaskCalendar({ getTodosApi, tGet, getLang, invokeIpc, isPro = () => true, requirePro = () => false }) {
    const dateBtn = document.getElementById('statusDate')
    const popup = document.getElementById('calendarPopup')
    if (!dateBtn || !popup) return null

    const $ = (id) => document.getElementById(id)
    const grid = $('calGrid')
    const monthLabel = $('calMonthLabel')
    const dayTitle = $('calDayTitle')
    const daySub = $('calDaySub')
    const dayList = $('calDayList')
    const addForm = $('calAddForm')
    const addInput = $('calAddInput')
    const addHint = $('calAddHint')
    const quickHint = $('calQuickHint')

    let viewYear = new Date().getFullYear()
    let viewMonth = new Date().getMonth()
    let selected = isoDate(new Date())

    const lang = () => getLang() || 'ru'
    const items = () => getTodosApi()?.getItems?.() || []
    const t = (key, fallback = '') => tGet(`v372.cal.${key}`) || fallback
    const dateOf = (iso) => new Date(iso + 'T00:00:00')
    const isOpen = () => popup.style.display !== 'none'

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    function renderMonth() {
        const first = new Date(viewYear, viewMonth, 1)
        // month name on its own ("ноябрь", not "ноября") and the year without "г."
        const month = first.toLocaleDateString(lang(), { month: 'long' })
        monthLabel.textContent = `${month.charAt(0).toUpperCase() + month.slice(1)} ${viewYear}`
        grid.textContent = ''
        const today = isoDate(new Date())
        const marks = isPro() ? tasksByDate(items()) : new Map()
        const startOffset = (first.getDay() + 6) % 7 // Monday first
        const cells = Math.ceil((startOffset + new Date(viewYear, viewMonth + 1, 0).getDate()) / 7) * 7
        for (let i = 0; i < cells; i++) {
            const day = new Date(viewYear, viewMonth, 1 - startOffset + i)
            const iso = isoDate(day)
            const mark = marks.get(iso)
            const cell = el('button', 'cal-day')
            cell.type = 'button'
            cell.dataset.date = iso
            if (day.getMonth() !== viewMonth) cell.classList.add('other-month')
            if ((day.getDay() + 6) % 7 >= 5) cell.classList.add('weekend')
            if (iso === today) cell.classList.add('today')
            if (iso === selected) cell.classList.add('selected')
            cell.appendChild(el('span', 'cal-day-num', String(day.getDate())))
            if (mark) {
                const dots = el('span', 'cal-dots')
                const overdue = mark.open > 0 && iso < today
                const n = Math.min(MAX_DOTS, mark.open || 1)
                for (let k = 0; k < n; k++) dots.appendChild(el('i', mark.open ? (overdue ? 'is-overdue' : '') : 'is-done'))
                cell.appendChild(dots)
                cell.title = t('dayCount', '{open}').replace('{open}', String(mark.open)).replace('{done}', String(mark.done))
            }
            grid.appendChild(cell)
        }
    }

    function sortTasks(list) {
        return [...list].sort((a, b) => (a.done - b.done) || (PRIORITY_ORDER[a.priority || 'none'] - PRIORITY_ORDER[b.priority || 'none']))
    }

    function taskRow(task, { showDate = false } = {}) {
        const row = el('div', `tcal-task${task.done ? ' is-done' : ''}`)
        row.dataset.id = String(task.id)
        const check = el('button', `tcal-check prio-${task.priority || 'none'}`)
        check.type = 'button'
        check.dataset.action = 'toggle'
        check.setAttribute('aria-label', task.done ? t('markOpen', 'Вернуть') : t('markDone', 'Выполнено'))
        check.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        const text = el('button', 'tcal-task-text', task.text)
        text.type = 'button'
        text.dataset.action = 'open'
        row.append(check, text)
        if (showDate && task.dueDate) {
            row.appendChild(el('span', 'tcal-task-date', dateOf(task.dueDate).toLocaleDateString(lang(), { day: 'numeric', month: 'short' })))
        }
        return row
    }

    function renderDay() {
        const date = dateOf(selected)
        const today = isoDate(new Date())
        const long = date.toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long' })
        const relative = selected === today ? t('today', 'Сегодня')
            : selected === isoDate(new Date(Date.now() + 86400000)) ? t('tomorrow', 'Завтра') : ''
        dayTitle.textContent = relative || (long.charAt(0).toUpperCase() + long.slice(1))
        const list = dayTasks(items(), selected)
        const open = list.filter(x => !x.done).length
        daySub.textContent = [relative ? long : '', list.length ? t('openOf', '{open} из {all}').replace('{open}', String(open)).replace('{all}', String(list.length)) : ''].filter(Boolean).join(' · ')

        dayList.textContent = ''
        const overdue = selected === today ? overdueTasks(items(), today) : []
        if (overdue.length) {
            dayList.appendChild(el('div', 'tcal-group is-overdue', `${t('overdue', 'Просрочено')} · ${overdue.length}`))
            sortTasks(overdue).forEach(x => dayList.appendChild(taskRow(x, { showDate: true })))
            if (list.length) dayList.appendChild(el('div', 'tcal-group', t('today', 'Сегодня')))
        }
        if (!list.length && !overdue.length) {
            const empty = el('div', 'tcal-empty')
            empty.appendChild(el('div', 'tcal-empty-title', t('emptyTitle', 'Свободный день')))
            empty.appendChild(el('div', 'tcal-empty-text', t('emptyText', 'Напишите задачу ниже, она появится в этом дне.')))
            dayList.appendChild(empty)
        }
        sortTasks(list).forEach(x => dayList.appendChild(taskRow(x)))
        addInput.placeholder = t('addOn', 'Задача на {date}').replace('{date}', date.toLocaleDateString(lang(), { day: 'numeric', month: 'long' }))
        updateHint()
    }

    // Tasks in the calendar are a PRO feature (owner's decision for 3.7.2): without PRO the month is shown as before,
    // and the day side explains what PRO adds instead of listing tasks.
    function renderLocked() {
        popup.classList.add('is-locked')
        const date = dateOf(selected)
        const long = date.toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long' })
        dayTitle.textContent = long.charAt(0).toUpperCase() + long.slice(1)
        daySub.textContent = ''
        dayList.textContent = ''
        const card = el('div', 'tcal-pro')
        card.appendChild(el('span', 'tcal-pro-badge', tGet('cloud.planPro') || 'PRO'))
        card.appendChild(el('div', 'tcal-pro-title', t('proTitle', 'Задачи в календаре — в ПРО')))
        card.appendChild(el('div', 'tcal-pro-text', t('proText', '')))
        const btn = el('button', 'tcal-pro-btn', t('proBtn', 'Подключить ПРО'))
        btn.type = 'button'
        btn.addEventListener('click', () => { close(); requirePro('calendar') })
        card.appendChild(btn)
        dayList.appendChild(card)
    }

    function render() {
        const pro = isPro()
        popup.classList.toggle('is-locked', !pro)
        renderMonth()
        if (pro) renderDay()
        else renderLocked()
    }

    function select(iso, { focusInput = false } = {}) {
        selected = iso
        const d = dateOf(iso)
        if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
            viewYear = d.getFullYear()
            viewMonth = d.getMonth()
        }
        render()
        if (focusInput) addInput.focus()
    }

    function shiftMonth(delta) {
        const d = new Date(viewYear, viewMonth + delta, 1)
        viewYear = d.getFullYear()
        viewMonth = d.getMonth()
        renderMonth()
    }

    function relativeLabel(iso) {
        const today = new Date()
        if (iso === isoDate(today)) return t('today', 'Сегодня')
        if (iso === isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))) return t('tomorrow', 'Завтра')
        return dateOf(iso).toLocaleDateString(lang(), { weekday: 'short', day: 'numeric', month: 'long' })
    }

    function updateHint() {
        const raw = addInput.value.trim()
        if (!raw) { addHint.textContent = ''; addHint.classList.remove('is-moved'); return }
        const parsed = parseQuickTask(raw)
        const target = parsed.dueDate || selected
        const parts = []
        if (parsed.dueDate && parsed.dueDate !== selected) parts.push(relativeLabel(target))
        if (parsed.priority !== 'none') parts.push(tGet('todos.priority' + parsed.priority[0].toUpperCase() + parsed.priority.slice(1)))
        addHint.textContent = parts.join(' · ')
        addHint.classList.toggle('is-moved', !!parsed.dueDate && parsed.dueDate !== selected)
    }

    async function loadQuickHint() {
        if (!quickHint || typeof invokeIpc !== 'function') return
        try {
            const res = await invokeIpc('shortcuts:list')
            const accel = (res?.items || []).find(x => x.id === 'quickTask')?.accel
            quickHint.textContent = accel ? t('quickHint', '{keys} — задача из любого окна').replace('{keys}', accel) : ''
        } catch { quickHint.textContent = '' }
    }

    function position() {
        const rect = dateBtn.getBoundingClientRect()
        popup.style.bottom = `${window.innerHeight - rect.top + 8}px`
        const width = popup.offsetWidth || 600
        popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
    }

    function open(iso) {
        const target = iso || isoDate(new Date())
        selected = target
        viewYear = dateOf(target).getFullYear()
        viewMonth = dateOf(target).getMonth()
        popup.style.display = 'flex'
        render()
        position()
        loadQuickHint()
        if (isPro()) requestAnimationFrame(() => addInput.focus())
    }

    function close() { popup.style.display = 'none' }

    // ── events ─────────────────────────────────────────────────────
    dateBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (isOpen()) close()
        else open()
    })
    popup.addEventListener('click', (e) => e.stopPropagation())
    document.addEventListener('click', () => { if (isOpen()) close() })
    document.addEventListener('close-all-popups', () => { if (isOpen()) close() })
    document.addEventListener('centrio-tasks-changed', () => { if (isOpen()) render() })

    $('calPrevBtn')?.addEventListener('click', () => shiftMonth(-1))
    $('calNextBtn')?.addEventListener('click', () => shiftMonth(1))
    $('calTodayBtn')?.addEventListener('click', () => select(isoDate(new Date()), { focusInput: true }))
    $('calOpenTasks')?.addEventListener('click', () => {
        close()
        getTodosApi()?.showTab?.(selected === isoDate(new Date()) ? 'today' : 'upcoming')
    })

    grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-day')
        if (cell) select(cell.dataset.date, { focusInput: isPro() })
    })

    dayList.addEventListener('click', (e) => {
        const row = e.target.closest('.tcal-task')
        const action = e.target.closest('[data-action]')?.dataset.action
        if (!row || !action) return
        if (action === 'toggle') getTodosApi()?.toggleTask?.(row.dataset.id)
        if (action === 'open') { close(); getTodosApi()?.openTask?.(row.dataset.id) }
    })

    addInput.addEventListener('input', updateHint)
    addForm.addEventListener('submit', (e) => {
        e.preventDefault()
        if (!isPro()) { requirePro('calendar'); return }
        const raw = addInput.value.trim()
        if (!raw) return
        const parsed = parseQuickTask(raw)
        const api = getTodosApi()
        if (!api?.addTask) return
        api.addTask({ text: parsed.text, dueDate: parsed.dueDate || selected, priority: parsed.priority })
        addInput.value = ''
        // a task written for another day: jump there, so the person sees where it went
        if (parsed.dueDate && parsed.dueDate !== selected) select(parsed.dueDate)
        else render()
        addInput.focus()
    })

    // Arrows move the selected day when the input is empty; Esc closes.
    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(); return }
        if (document.activeElement === addInput && addInput.value) return
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
        if (!step) return
        e.preventDefault()
        const d = dateOf(selected)
        select(isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)))
        addInput.focus()
    })

    window.addEventListener('resize', () => { if (isOpen()) position() })

    return { open, close, render }
}

module.exports = { createTaskCalendar }
