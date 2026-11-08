'use client'
// Задачи сотрудникам (2026-10-01, TEAM). Owner/admin assign tasks to team
// members here; they show up in the employee's desktop app (Tasks panel →
// "От руководителя") with a red dot and a sound. Backend:
// /api/org/:orgId/tasks (routes/org.js). Text is plain, rendered as React
// text nodes only.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface Task {
  id: string
  assigneeId: string
  assigneeName: string
  createdByName: string
  title: string
  notes: string | null
  priority: 'NORMAL' | 'HIGH'
  status: 'OPEN' | 'DONE'
  dueAt: string | null
  doneAt: string | null
  seenAt: string | null
  createdAt: string
  commentCount?: number
  lastComment?: { authorId: string; authorName: string; body: string; at: string } | null
}

interface TaskComment { id: string; authorId: string; authorName: string; body: string; createdAt: string }

interface MemberRow { userId: string; name: string | null; email: string; role: string }
type Msg = { type: 'ok' | 'err'; text: string } | null

const STR = {
  ru: {
    title: 'Задачи сотрудникам',
    desc: 'Поставьте задачу сотруднику — она появится в его приложении Centrio в разделе «Задачи → От руководителя» с красным кружком и звуком. Сотрудник отмечает выполнение, вы видите статус здесь.',
    assignee: 'Сотрудник',
    taskLabel: 'Задача',
    taskPlaceholder: 'Например, перезвонить клиентам из WhatsApp',
    notesLabel: 'Подробности',
    notesPlaceholder: 'Необязательно',
    dueLabel: 'Срок',
    urgent: 'Срочно',
    assign: 'Поставить задачу',
    assigning: 'Отправляем…',
    allEmployees: 'Все сотрудники',
    open: 'В работе',
    done: 'Выполнено',
    empty: 'Пока нет задач. Поставьте первую сотруднику.',
    noMembers: 'В команде пока нет сотрудников — пригласите их на вкладке «Участники».',
    reopen: 'Вернуть в работу',
    markDone: 'Выполнено',
    remove: 'Удалить',
    confirmRemove: 'Точно удалить?',
    created: 'Задача поставлена',
    removed: 'Задача удалена',
    notSeen: 'не открыта',
    seen: 'увидел(а)',
    due: 'срок',
    loadFailed: 'Не удалось загрузить задачи',
    saveFailed: 'Не удалось выполнить действие',
    fillTitle: 'Введите задачу и выберите сотрудника',
    comment: 'Комментировать',
    comments: (n: number) => `Комментарии (${n})`,
    noComments: 'Комментариев пока нет',
    commentPlaceholder: 'Написать комментарий…',
    send: 'Отправить',
    you: 'Вы',
    lastComment: 'Последний комментарий'
  },
  en: {
    title: 'Tasks for employees',
    desc: 'Assign a task to a teammate — it appears in their Centrio app under Tasks → "From your manager" with a red dot and a sound. They mark it done, and you see the status here.',
    assignee: 'Employee',
    taskLabel: 'Task',
    taskPlaceholder: 'e.g. Call back the clients from WhatsApp',
    notesLabel: 'Details',
    notesPlaceholder: 'Optional',
    dueLabel: 'Due',
    urgent: 'Urgent',
    assign: 'Assign task',
    assigning: 'Sending…',
    allEmployees: 'All employees',
    open: 'Open',
    done: 'Done',
    empty: 'No tasks yet. Assign the first one to a teammate.',
    noMembers: 'No employees in the team yet — invite them on the Members tab.',
    reopen: 'Reopen',
    markDone: 'Mark done',
    remove: 'Delete',
    confirmRemove: 'Delete for sure?',
    created: 'Task assigned',
    removed: 'Task deleted',
    notSeen: 'not opened yet',
    seen: 'seen',
    due: 'due',
    loadFailed: 'Could not load tasks',
    saveFailed: 'Could not complete the action',
    fillTitle: 'Enter a task and choose an employee',
    comment: 'Comment',
    comments: (n: number) => `Comments (${n})`,
    noComments: 'No comments yet',
    commentPlaceholder: 'Write a comment…',
    send: 'Send',
    you: 'You',
    lastComment: 'Last comment'
  }
}

export default function TasksPanel({ orgId, lang, currentUserId }: { orgId: string; lang: 'ru' | 'en'; currentUserId: string | null }) {
  const s = STR[lang]
  const locale = lang === 'en' ? 'en-US' : 'ru-RU'
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [assignee, setAssignee] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [thread, setThread] = useState<TaskComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  const assignable = useMemo(() => members.filter(m => m.userId !== currentUserId), [members, currentUserId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tasksRes, membersRes] = await Promise.all([
        api.get(`/api/org/${orgId}/tasks`),
        api.get(`/api/org/${orgId}/members`)
      ])
      if (tasksRes.data?.success) setTasks(tasksRes.data.data)
      if (membersRes.data?.success) setMembers(membersRes.data.data)
    } catch {
      setMsg({ type: 'err', text: s.loadFailed })
    } finally {
      setLoading(false)
    }
  }, [orgId, s.loadFailed])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!assignee && assignable[0]) setAssignee(assignable[0].userId) }, [assignable, assignee])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !assignee) { setMsg({ type: 'err', text: s.fillTitle }); return }
    setSaving(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/api/org/${orgId}/tasks`, {
        assigneeId: assignee,
        title: title.trim(),
        notes: notes.trim(),
        priority: urgent ? 'HIGH' : 'NORMAL',
        dueAt: due ? new Date(due).toISOString() : null
      })
      if (data?.success) {
        setTasks(prev => [data.data, ...prev])
        setTitle(''); setNotes(''); setDue(''); setUrgent(false)
        setMsg({ type: 'ok', text: s.created })
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.saveFailed })
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (task: Task) => {
    try {
      const { data } = await api.patch(`/api/org/${orgId}/tasks/${task.id}`, { status: task.status === 'DONE' ? 'OPEN' : 'DONE' })
      if (data?.success) setTasks(prev => prev.map(t => t.id === task.id ? data.data : t))
    } catch {
      setMsg({ type: 'err', text: s.saveFailed })
    }
  }

  const loadThread = async (taskId: string) => {
    try {
      const { data } = await api.get(`/api/org/${orgId}/tasks/${taskId}/comments`)
      if (data?.success) setThread(data.data)
    } catch {
      setMsg({ type: 'err', text: s.loadFailed })
    }
  }

  const toggleThread = async (taskId: string) => {
    if (openThread === taskId) { setOpenThread(null); return }
    setOpenThread(taskId)
    setCommentDraft('')
    setThread([])
    await loadThread(taskId)
  }

  const sendComment = async (e: React.FormEvent, task: Task) => {
    e.preventDefault()
    const body = commentDraft.trim()
    if (!body) return
    setSendingComment(true)
    try {
      const { data } = await api.post(`/api/org/${orgId}/tasks/${task.id}/comments`, { body })
      if (data?.success) {
        setThread(prev => [...prev, data.data])
        setCommentDraft('')
        setTasks(prev => prev.map(t => t.id === task.id
          ? { ...t, commentCount: (t.commentCount || 0) + 1, lastComment: { authorId: data.data.authorId, authorName: data.data.authorName, body: data.data.body.slice(0, 160), at: data.data.createdAt } }
          : t))
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.saveFailed })
    } finally {
      setSendingComment(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirmingId !== id) { setConfirmingId(id); return }
    setConfirmingId(null)
    try {
      await api.delete(`/api/org/${orgId}/tasks/${id}`)
      setTasks(prev => prev.filter(t => t.id !== id))
      setMsg({ type: 'ok', text: s.removed })
    } catch {
      setMsg({ type: 'err', text: s.saveFailed })
    }
  }

  const visible = tasks.filter(t => !filter || t.assigneeId === filter)
  const openTasks = visible.filter(t => t.status === 'OPEN')
  const doneTasks = visible.filter(t => t.status === 'DONE')
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const renderTask = (task: Task) => (
    <div key={task.id} className={`qr-item task-item${task.status === 'DONE' ? ' task-done' : ''}`}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="qr-item-title">
          {task.priority === 'HIGH' && <span className="task-urgent">{s.urgent}</span>}
          {task.title}
        </div>
        {task.notes && <div className="qr-item-text">{task.notes}</div>}
        <div className="task-meta">
          <strong>{task.assigneeName}</strong>
          {task.dueAt && <span>{s.due}: {fmt(task.dueAt)}</span>}
          {task.status === 'OPEN' && <span className={task.seenAt ? '' : 'task-unseen'}>{task.seenAt ? s.seen : s.notSeen}</span>}
          {task.status === 'DONE' && task.doneAt && <span>{s.done}: {fmt(task.doneAt)}</span>}
        </div>
        {task.lastComment && openThread !== task.id && (
          <div className="task-lastcomment"><strong>{task.lastComment.authorId === currentUserId ? s.you : task.lastComment.authorName}:</strong> {task.lastComment.body}</div>
        )}
        <button type="button" className="task-comments-btn" aria-expanded={openThread === task.id} onClick={() => toggleThread(task.id)}>
          {task.commentCount ? s.comments(task.commentCount) : s.comment}
        </button>
        {openThread === task.id && (
          <div className="task-thread">
            {thread.length === 0 && <div className="task-thread-empty">{s.noComments}</div>}
            {thread.map(c => (
              <div key={c.id} className={`task-comment${c.authorId === currentUserId ? ' own' : ''}`}>
                <div className="task-comment-head"><strong>{c.authorId === currentUserId ? s.you : c.authorName}</strong><span>{fmt(c.createdAt)}</span></div>
                <div className="task-comment-body">{c.body}</div>
              </div>
            ))}
            <form onSubmit={e => sendComment(e, task)} className="task-comment-form">
              <textarea className="field-input" rows={2} maxLength={1000} value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder={s.commentPlaceholder} />
              <button type="submit" className="btn-primary" disabled={sendingComment || !commentDraft.trim()}>{s.send}</button>
            </form>
          </div>
        )}
      </div>
      <div className="qr-item-actions">
        <button type="button" className="btn-ghost" onClick={() => toggleStatus(task)}>{task.status === 'DONE' ? s.reopen : s.markDone}</button>
        <button type="button" className="btn-danger" onClick={() => handleDelete(task.id)} onBlur={() => setConfirmingId(null)}>
          {confirmingId === task.id ? s.confirmRemove : s.remove}
        </button>
      </div>
    </div>
  )

  return (
    <div className="glass-card" style={{ padding: 26 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.title}</div>
      <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', maxWidth: 640, marginBottom: 18 }}>{s.desc}</p>

      {!loading && assignable.length === 0 ? (
        <div className="qr-empty">{s.noMembers}</div>
      ) : (
        <form className="qr-form" onSubmit={handleCreate}>
          <div className="task-row">
            <div style={{ flex: '0 0 220px' }}>
              <label className="field-label" htmlFor="task-assignee">{s.assignee}</label>
              <select id="task-assignee" className="field-input" value={assignee} onChange={e => setAssignee(e.target.value)}>
                {assignable.map(m => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="field-label" htmlFor="task-title">{s.taskLabel}</label>
              <input id="task-title" className="field-input" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder={s.taskPlaceholder} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="task-notes">{s.notesLabel}</label>
            <textarea id="task-notes" className="field-input qr-textarea" rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={s.notesPlaceholder} />
          </div>
          <div className="task-row" style={{ alignItems: 'flex-end' }}>
            <div>
              <label className="field-label" htmlFor="task-due">{s.dueLabel}</label>
              <input id="task-due" type="datetime-local" className="field-input" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <label className="task-check">
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> {s.urgent}
            </label>
            <button type="submit" className="btn-primary" disabled={saving || !title.trim() || !assignee}>{saving ? s.assigning : s.assign}</button>
          </div>
        </form>
      )}

      {msg && <div className={`form-msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}

      {tasks.length > 0 && (
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          <select className="field-input" style={{ maxWidth: 260 }} value={filter} onChange={e => setFilter(e.target.value)} aria-label={s.assignee}>
            <option value="">{s.allEmployees}</option>
            {members.map(m => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
          </select>
        </div>
      )}

      <div className="qr-list">
        {loading ? null : tasks.length === 0 ? (
          <div className="qr-empty">{s.empty}</div>
        ) : (
          <>
            {openTasks.length > 0 && <div className="task-group">{s.open} · {openTasks.length}</div>}
            {openTasks.map(renderTask)}
            {doneTasks.length > 0 && <div className="task-group">{s.done} · {doneTasks.length}</div>}
            {doneTasks.map(renderTask)}
          </>
        )}
      </div>
    </div>
  )
}
