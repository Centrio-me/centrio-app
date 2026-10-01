// FEATURE (2026-10-01, TEAM): "Задачи от руководителя". Owner/admin assigns
// tasks to employees (here or on the website's team console); an employee
// sees them in a "От руководителя" block at the top of the Tasks panel, gets
// a red dot on the Tasks button plus a sound/OS notification for each new
// one. PRO-only users never get any of this: the poll only runs for org
// members and the block stays hidden until the server returns tasks (or the
// user is an owner/admin, who also gets the "assign" form).
//
// Data comes from renderer/org-team.js (setTasks); this module only renders
// and talks to the API through the same authorizedInvoke wrapper.
const ANNOUNCED_KEY = 'centrio-team-tasks-announced'
const MAX_ANNOUNCED = 300
const VISIBLE_DONE = 5

function createTeamTasksUi({ authorizedInvoke, cloudStore, tGet, playSound, notify }) {
    const btn = document.getElementById('todosBtn')
    const panel = document.getElementById('todosPanel')
    const anchor = document.getElementById('todosList')
    if (!btn || !panel || !anchor) return { setTasks() {}, refresh() {} }

    let tasks = []
    let members = []
    let firstLoadDone = false

    const box = document.createElement('div')
    box.id = 'teamTasksBox'
    box.className = 'team-tasks'
    box.style.display = 'none'
    anchor.parentNode.insertBefore(box, anchor)

    const dot = document.createElement('span')
    dot.className = 'team-tasks-dot'
    dot.hidden = true
    btn.appendChild(dot)

    const t = (key, fallback, params) => {
        let text = tGet(`teamTasks.${key}`) || fallback
        for (const [k, v] of Object.entries(params || {})) text = text.replace(`{${k}}`, v)
        return text
    }

    function getOrgContext() {
        const summary = cloudStore.getUser()?.orgSummary
        return { orgId: summary?.orgId || null, role: summary?.orgRole || null, userId: cloudStore.getUser()?.id || null }
    }

    const unwrap = (result) => (result?.success && result.data?.success ? result.data.data : undefined)

    function readAnnounced() {
        try { return new Set(JSON.parse(localStorage.getItem(ANNOUNCED_KEY) || '[]')) } catch { return new Set() }
    }
    function writeAnnounced(set) {
        try { localStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...set].slice(-MAX_ANNOUNCED))) } catch {}
    }

    function isPanelOpen() {
        return panel.classList.contains('active') && panel.offsetParent !== null
    }

    function mine(list) {
        const { userId } = getOrgContext()
        return list.filter((x) => x.assigneeId === userId)
    }

    function unseenMine() {
        return mine(tasks).filter((x) => !x.seenAt && x.status === 'OPEN')
    }

    function updateDot() {
        const n = unseenMine().length
        dot.hidden = n === 0
        dot.textContent = n > 9 ? '9+' : String(n)
    }

    function announceNew() {
        const announced = readAnnounced()
        const fresh = unseenMine().filter((x) => !announced.has(x.id))
        if (fresh.length === 0) return
        fresh.forEach((x) => announced.add(x.id))
        writeAnnounced(announced)
        // First load on a device: tasks already waiting get the dot, but no
        // sound/notification burst for a backlog.
        if (!firstLoadDone) return
        const lines = fresh.slice(0, 3).map((x) => `${x.createdByName}: ${x.title}`)
        if (fresh.length > 3) lines.push(t('notifyMore', 'и ещё {n}', { n: fresh.length - 3 }))
        notify({ title: t('notifyTitle', 'Новая задача'), body: lines.join('\n') })
        playSound()
    }

    async function markSeen() {
        const { orgId } = getOrgContext()
        if (!orgId || unseenMine().length === 0) return
        tasks = tasks.map((x) => (x.assigneeId === getOrgContext().userId && !x.seenAt ? { ...x, seenAt: new Date().toISOString() } : x))
        updateDot()
        try { await authorizedInvoke('api-org-mark-tasks-seen', orgId) } catch {}
    }

    function formatDue(iso) {
        const d = new Date(iso)
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    }

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    function renderTask(task, manager) {
        const row = el('div', `team-task${task.status === 'DONE' ? ' is-done' : ''}${!task.seenAt && task.assigneeId === getOrgContext().userId ? ' is-new' : ''}`)
        const check = el('input', 'team-task-check')
        check.type = 'checkbox'
        check.checked = task.status === 'DONE'
        check.setAttribute('aria-label', t('done', 'Выполнено'))
        check.addEventListener('change', () => toggle(task, check.checked))
        row.appendChild(check)

        const body = el('div', 'team-task-body')
        body.appendChild(el('div', 'team-task-title', task.title))
        if (task.notes) body.appendChild(el('div', 'team-task-notes', task.notes))
        const meta = el('div', 'team-task-meta')
        if (task.priority === 'HIGH') meta.appendChild(el('span', 'team-task-high', t('high', 'Срочно')))
        if (task.dueAt) meta.appendChild(el('span', 'team-task-due', t('due', 'до {date}', { date: formatDue(task.dueAt) })))
        const who = manager && task.assigneeId !== getOrgContext().userId
            ? t('to', 'для {name}', { name: task.assigneeName })
            : t('from', 'от {name}', { name: task.createdByName })
        meta.appendChild(el('span', 'team-task-who', who))
        body.appendChild(meta)
        row.appendChild(body)
        return row
    }

    function renderForm() {
        const form = el('form', 'team-task-form')
        const select = el('select', 'team-task-select')
        select.setAttribute('aria-label', t('assignee', 'Кому'))
        const { userId } = getOrgContext()
        members.filter((m) => m.userId !== userId).forEach((m) => {
            const option = el('option', '', m.name || m.email || '—')
            option.value = m.userId
            select.appendChild(option)
        })
        const input = el('input', 'team-task-input')
        input.type = 'text'
        input.maxLength = 160
        input.placeholder = t('placeholder', 'Что нужно сделать?')
        form.append(select, input)
        form.addEventListener('submit', async (event) => {
            event.preventDefault()
            const title = input.value.trim()
            const { orgId } = getOrgContext()
            if (!title || !select.value || !orgId) return
            input.disabled = true
            try {
                const result = await authorizedInvoke('api-org-create-task', orgId, { assigneeId: select.value, title })
                if (unwrap(result)) { input.value = ''; await refresh() }
            } catch {}
            input.disabled = false
            input.focus()
        })
        return form
    }

    async function toggle(task, done) {
        const { orgId } = getOrgContext()
        if (!orgId) return
        try {
            await authorizedInvoke('api-org-update-task', orgId, task.id, { status: done ? 'DONE' : 'OPEN' })
        } catch {}
        await refresh()
    }

    function render() {
        const { role } = getOrgContext()
        const manager = role === 'OWNER' || role === 'ADMIN'
        const visible = manager ? tasks : mine(tasks)
        box.textContent = ''
        if (!role || (!manager && visible.length === 0)) { box.style.display = 'none'; return }

        box.style.display = ''
        box.appendChild(el('div', 'team-tasks-title', t('title', 'От руководителя')))
        if (manager && members.length > 1) box.appendChild(renderForm())
        const open = visible.filter((x) => x.status === 'OPEN')
        const done = visible.filter((x) => x.status === 'DONE').slice(0, VISIBLE_DONE)
        if (open.length === 0 && done.length === 0) box.appendChild(el('div', 'team-tasks-empty', t('empty', 'Пока нет задач от руководителя')))
        open.forEach((x) => box.appendChild(renderTask(x, manager)))
        if (done.length) {
            box.appendChild(el('div', 'team-tasks-sub', t('doneSection', 'Выполненные')))
            done.forEach((x) => box.appendChild(renderTask(x, manager)))
        }
    }

    async function loadMembers(orgId, role) {
        if (!(role === 'OWNER' || role === 'ADMIN') || members.length) return
        try {
            const list = unwrap(await authorizedInvoke('api-org-get-members', orgId))
            const raw = Array.isArray(list) ? list : list?.members
            if (Array.isArray(raw)) {
                members = raw
                    .filter((m) => m.userId || m.user?.id)
                    .map((m) => ({ userId: m.userId || m.user.id, name: m.user?.name || m.name, email: m.user?.email || m.email }))
            }
        } catch {}
    }

    function setTasks(list) {
        tasks = Array.isArray(list) ? list : []
        announceNew()
        firstLoadDone = true
        updateDot()
        if (isPanelOpen()) markSeen()
        render()
    }

    async function refresh() {
        const { orgId, role } = getOrgContext()
        if (!orgId) { setTasks([]); return }
        try {
            await loadMembers(orgId, role)
            const result = await authorizedInvoke('api-org-get-tasks', orgId)
            const data = unwrap(result)
            if (Array.isArray(data)) setTasks(data)
        } catch {}
    }

    // Opening the Tasks panel acknowledges new tasks (clears the red dot).
    btn.addEventListener('click', () => setTimeout(() => { if (isPanelOpen()) markSeen() }, 80))

    return { setTasks, refresh }
}

module.exports = { createTeamTasksUi }
