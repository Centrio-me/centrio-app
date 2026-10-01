// FEATURE (2026-10-01, TEAM): "Задачи от руководителя". Owner/admin assigns
// tasks to employees (here or on the website's team console); an employee
// sees them in a "От руководителя" block at the top of the Tasks panel, gets
// a red dot on the Tasks button plus a sound/OS notification for each new
// one. PRO-only users never get any of this: the poll only runs for org
// members and the block stays hidden until the server returns tasks (or the
// user is an owner/admin, who also gets the "assign" form).
//
// 2026-10-02: every task has a comment thread (both sides can write) and an
// employee can finish a task with a short result note. A new comment from
// someone else raises the red dot and plays the sound, like a new task.
//
// Data comes from renderer/org-team.js (setTasks); this module only renders
// and talks to the API through the same authorizedInvoke wrapper.
const ANNOUNCED_KEY = 'centrio-team-tasks-announced'
const COMMENTS_SEEN_KEY = 'centrio-team-task-comments-seen'
const COMMENTS_ANNOUNCED_KEY = 'centrio-team-task-comments-announced'
const MAX_ANNOUNCED = 300
const VISIBLE_DONE = 5
const COMMENT_MAX = 1000

function createTeamTasksUi({ authorizedInvoke, cloudStore, tGet, playSound, notify }) {
    const btn = document.getElementById('todosBtn')
    const panel = document.getElementById('todosPanel')
    const anchor = document.getElementById('todosList')
    if (!btn || !panel || !anchor) return { setTasks() {}, refresh() {} }

    let tasks = []
    let members = []
    let firstLoadDone = false
    const expanded = new Set()
    const threads = new Map()

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

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback } catch { return fallback }
    }
    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    }
    const readAnnounced = () => new Set(readJson(ANNOUNCED_KEY, []))
    const writeAnnounced = (set) => writeJson(ANNOUNCED_KEY, [...set].slice(-MAX_ANNOUNCED))

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

    // A task has an unread comment when the newest one is from someone else and
    // is newer than what this device has already shown.
    function hasUnreadComment(task) {
        const last = task.lastComment
        if (!last || last.authorId === getOrgContext().userId) return false
        const seen = readJson(COMMENTS_SEEN_KEY, {})[task.id]
        return !seen || new Date(last.at) > new Date(seen)
    }

    function relevantTasks() {
        const { role } = getOrgContext()
        return role === 'OWNER' || role === 'ADMIN' ? tasks : mine(tasks)
    }

    function unreadCommentTasks() {
        return relevantTasks().filter(hasUnreadComment)
    }

    function updateDot() {
        const ids = new Set([...unseenMine(), ...unreadCommentTasks()].map((x) => x.id))
        dot.hidden = ids.size === 0
        dot.textContent = ids.size > 9 ? '9+' : String(ids.size)
    }

    function announceNew() {
        const announced = readAnnounced()
        const fresh = unseenMine().filter((x) => !announced.has(x.id))
        const announcedComments = readJson(COMMENTS_ANNOUNCED_KEY, {})
        const freshComments = unreadCommentTasks().filter((x) => announcedComments[x.id] !== x.lastComment.at)
        freshComments.forEach((x) => { announcedComments[x.id] = x.lastComment.at })
        fresh.forEach((x) => announced.add(x.id))
        if (fresh.length) writeAnnounced(announced)
        if (freshComments.length) writeJson(COMMENTS_ANNOUNCED_KEY, announcedComments)
        // First load on a device: waiting items get the dot, but no
        // sound/notification burst for a backlog.
        if (!firstLoadDone) return
        if (fresh.length) {
            const lines = fresh.slice(0, 3).map((x) => `${x.createdByName}: ${x.title}`)
            if (fresh.length > 3) lines.push(t('notifyMore', 'и ещё {n}', { n: fresh.length - 3 }))
            notify({ title: t('notifyTitle', 'Новая задача'), body: lines.join('\n') })
        }
        if (freshComments.length) {
            const lines = freshComments.slice(0, 3).map((x) => `${x.lastComment.authorName}: ${x.lastComment.body}`)
            if (freshComments.length > 3) lines.push(t('notifyMore', 'и ещё {n}', { n: freshComments.length - 3 }))
            notify({ title: t('commentNotifyTitle', 'Комментарий к задаче'), body: lines.join('\n') })
        }
        if (fresh.length || freshComments.length) playSound()
    }

    function markCommentsSeen(list) {
        const seen = readJson(COMMENTS_SEEN_KEY, {})
        let changed = false
        list.forEach((x) => {
            if (x.lastComment && seen[x.id] !== x.lastComment.at) { seen[x.id] = x.lastComment.at; changed = true }
        })
        if (changed) writeJson(COMMENTS_SEEN_KEY, seen)
    }

    async function markSeen() {
        const { orgId } = getOrgContext()
        if (!orgId) return
        const hadTasks = unseenMine().length > 0
        markCommentsSeen(relevantTasks())
        if (hadTasks) {
            tasks = tasks.map((x) => (x.assigneeId === getOrgContext().userId && !x.seenAt ? { ...x, seenAt: new Date().toISOString() } : x))
        }
        updateDot()
        if (hadTasks) {
            try { await authorizedInvoke('api-org-mark-tasks-seen', orgId) } catch {}
        }
    }

    function formatDue(iso) {
        const d = new Date(iso)
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    }

    function formatWhen(iso) {
        const d = new Date(iso)
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    }

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    async function loadThread(taskId) {
        const { orgId } = getOrgContext()
        if (!orgId) return
        try {
            const list = unwrap(await authorizedInvoke('api-org-get-task-comments', orgId, taskId))
            if (Array.isArray(list)) threads.set(taskId, list)
        } catch {}
    }

    async function toggleThread(task) {
        if (expanded.has(task.id)) expanded.delete(task.id)
        else {
            expanded.add(task.id)
            await loadThread(task.id)
            markCommentsSeen([task])
            updateDot()
        }
        render()
    }

    async function sendComment(task, text, { complete = false } = {}) {
        const { orgId } = getOrgContext()
        const body = String(text || '').trim()
        if (!orgId || (!body && !complete)) return false
        try {
            const result = complete
                ? await authorizedInvoke('api-org-update-task', orgId, task.id, { status: 'DONE', comment: body })
                : await authorizedInvoke('api-org-add-task-comment', orgId, task.id, body)
            if (!unwrap(result)) return false
        } catch { return false }
        await refresh()
        return true
    }

    function renderThread(task) {
        const wrap = el('div', 'team-task-thread')
        const list = threads.get(task.id) || []
        const { userId } = getOrgContext()
        if (list.length === 0) wrap.appendChild(el('div', 'team-task-thread-empty', t('noComments', 'Комментариев пока нет')))
        list.forEach((c) => {
            const item = el('div', `team-comment${c.authorId === userId ? ' is-own' : ''}`)
            const head = el('div', 'team-comment-head')
            head.appendChild(el('strong', '', c.authorId === userId ? t('you', 'Вы') : c.authorName))
            head.appendChild(el('span', '', formatWhen(c.createdAt)))
            item.appendChild(head)
            item.appendChild(el('div', 'team-comment-body', c.body))
            wrap.appendChild(item)
        })

        const form = el('form', 'team-comment-form')
        const input = el('textarea', 'team-comment-input')
        input.rows = 2
        input.maxLength = COMMENT_MAX
        input.placeholder = t('commentPlaceholder', 'Написать комментарий…')
        const actions = el('div', 'team-comment-actions')
        const send = el('button', 'team-comment-send', t('send', 'Отправить'))
        send.type = 'submit'
        actions.appendChild(send)
        if (task.status === 'OPEN') {
            const done = el('button', 'team-comment-done', t('markDone', 'Выполнено'))
            done.type = 'button'
            done.title = t('markDoneHint', 'Отметить выполненной и приложить комментарий')
            done.addEventListener('click', async () => {
                done.disabled = true
                await sendComment(task, input.value, { complete: true })
            })
            actions.appendChild(done)
        }
        form.append(input, actions)
        form.addEventListener('submit', async (event) => {
            event.preventDefault()
            if (!input.value.trim()) return
            send.disabled = true
            const sent = await sendComment(task, input.value)
            if (!sent) send.disabled = false
        })
        wrap.appendChild(form)
        return wrap
    }

    function renderTask(task, manager) {
        const isNew = !task.seenAt && task.assigneeId === getOrgContext().userId
        const row = el('div', `team-task${task.status === 'DONE' ? ' is-done' : ''}${isNew ? ' is-new' : ''}`)
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

        const toggleBtn = el('button', `team-task-comments-btn${hasUnreadComment(task) ? ' has-new' : ''}`)
        toggleBtn.type = 'button'
        toggleBtn.setAttribute('aria-expanded', expanded.has(task.id) ? 'true' : 'false')
        const count = task.commentCount || 0
        toggleBtn.textContent = count > 0
            ? t('commentsCount', 'Комментарии ({n})', { n: count })
            : t('comment', 'Комментировать')
        toggleBtn.addEventListener('click', () => toggleThread(task))
        body.appendChild(toggleBtn)
        if (expanded.has(task.id)) body.appendChild(renderThread(task))

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
        // Keep a half-typed comment/task when a background refresh re-renders.
        const drafts = [...box.querySelectorAll('textarea.team-comment-input')].map((node) => node.value)
        const focusedThread = document.activeElement?.classList?.contains('team-comment-input')
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
        const inputs = box.querySelectorAll('textarea.team-comment-input')
        drafts.forEach((value, index) => { if (inputs[index] && value) inputs[index].value = value })
        if (focusedThread && inputs[0]) inputs[0].focus()
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
        // A thread the user is reading counts as seen right away.
        markCommentsSeen(tasks.filter((x) => expanded.has(x.id) && isPanelOpen()))
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
            if (Array.isArray(data)) {
                await Promise.all([...expanded].map((id) => loadThread(id)))
                setTasks(data)
            }
        } catch {}
    }

    // Opening the Tasks panel acknowledges new tasks (clears the red dot).
    btn.addEventListener('click', () => setTimeout(() => { if (isPanelOpen()) markSeen() }, 80))

    return { setTasks, refresh }
}

module.exports = { createTeamTasksUi }
