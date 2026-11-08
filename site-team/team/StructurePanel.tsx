'use client'
// Папки и пространства для сотрудников (2026-10-02, TEAM). The owner/admin
// builds a structure (workspaces -> folders) for one employee and puts the
// employee's assigned messengers into those folders. The employee's desktop
// app shows it as managed, read-only, next to their own folders. Backend:
// /api/org/:orgId/{structure,workspaces,folders,messenger-assignments} (routes/org.js).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface MemberRow { userId: string; name: string | null; email: string; role: string }
interface Workspace { id: string; userId: string; name: string; color: string | null }
interface Folder { id: string; userId: string; workspaceId: string | null; name: string }
interface Assignment { id: string; userId: string; name: string; url: string; folderId?: string | null }
type Msg = { type: 'ok' | 'err'; text: string } | null

const STR = {
  ru: {
    title: 'Папки и пространства для сотрудников',
    desc: 'Создайте для сотрудника пространства и папки и разложите по ним его мессенджеры. В приложении сотрудника они появятся сами, с пометкой «от руководителя»: переименовать или удалить их он не сможет, а свои папки у него останутся.',
    employee: 'Сотрудник',
    noMembers: 'В команде пока нет сотрудников. Пригласите их на вкладке «Участники».',
    workspaces: 'Пространства',
    workspacesHint: 'Пространство объединяет несколько папок. Сотрудник переключается между ними одним кликом.',
    folders: 'Папки',
    messengers: 'Мессенджеры сотрудника',
    noMessengers: 'Мессенджеры сотруднику ещё не назначены. Назначьте их на вкладке «Управление».',
    wsPlaceholder: 'Например, Клиенты',
    folderPlaceholder: 'Например, Амур',
    add: 'Добавить',
    save: 'Сохранить',
    cancel: 'Отмена',
    edit: 'Переименовать',
    remove: 'Удалить',
    confirmRemove: 'Точно удалить?',
    noWorkspace: 'Без пространства',
    noFolder: 'Без папки',
    emptyWs: 'Пространств пока нет',
    emptyFolders: 'Папок пока нет',
    loadFailed: 'Не удалось загрузить данные',
    saveFailed: 'Не удалось сохранить',
    saved: 'Сохранено',
    inFolder: 'Папка'
  },
  en: {
    title: 'Folders and workspaces for employees',
    desc: 'Create workspaces and folders for an employee and sort their messengers into them. They appear in the employee’s app on their own, marked “from your manager”: the employee cannot rename or delete them, and their own folders stay untouched.',
    employee: 'Employee',
    noMembers: 'No employees in the team yet. Invite them on the Members tab.',
    workspaces: 'Workspaces',
    workspacesHint: 'A workspace groups several folders. The employee switches between them in one click.',
    folders: 'Folders',
    messengers: 'Employee’s messengers',
    noMessengers: 'No messengers are assigned to this employee yet. Assign them on the Manage tab.',
    wsPlaceholder: 'e.g. Clients',
    folderPlaceholder: 'e.g. Amur',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Rename',
    remove: 'Delete',
    confirmRemove: 'Delete for sure?',
    noWorkspace: 'No workspace',
    noFolder: 'No folder',
    emptyWs: 'No workspaces yet',
    emptyFolders: 'No folders yet',
    loadFailed: 'Could not load data',
    saveFailed: 'Could not save',
    saved: 'Saved',
    inFolder: 'Folder'
  }
}

export default function StructurePanel({ orgId, lang }: { orgId: string; lang: 'ru' | 'en' }) {
  const s = STR[lang]
  const [members, setMembers] = useState<MemberRow[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [userId, setUserId] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [wsName, setWsName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [folderWs, setFolderWs] = useState('')
  const [editing, setEditing] = useState<{ kind: 'ws' | 'folder'; id: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const employees = useMemo(() => members.filter(m => m.role !== 'OWNER'), [members])
  const mine = useMemo(() => assignments.filter(a => a.userId === userId), [assignments, userId])

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [membersRes, assignRes] = await Promise.all([
        api.get(`/api/org/${orgId}/members`),
        api.get(`/api/org/${orgId}/messenger-assignments`)
      ])
      if (membersRes.data?.success) setMembers(membersRes.data.data)
      if (assignRes.data?.success) setAssignments(assignRes.data.data)
    } catch {
      setMsg({ type: 'err', text: s.loadFailed })
    } finally {
      setLoading(false)
    }
  }, [orgId, s.loadFailed])

  const loadStructure = useCallback(async (id: string) => {
    if (!id) return
    try {
      const { data } = await api.get(`/api/org/${orgId}/structure`, { params: { userId: id } })
      if (data?.success) { setWorkspaces(data.data.workspaces); setFolders(data.data.folders) }
    } catch {
      setMsg({ type: 'err', text: s.loadFailed })
    }
  }, [orgId, s.loadFailed])

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { if (!userId && employees[0]) setUserId(employees[0].userId) }, [employees, userId])
  useEffect(() => { setMsg(null); setEditing(null); setConfirming(null); loadStructure(userId) }, [userId, loadStructure])

  const fail = (err: any) => setMsg({ type: 'err', text: err?.response?.data?.error || s.saveFailed })

  const addWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsName.trim() || !userId) return
    try {
      const { data } = await api.post(`/api/org/${orgId}/workspaces`, { userId, name: wsName.trim() })
      if (data?.success) { setWorkspaces(p => [...p, data.data]); setWsName(''); setMsg(null) }
    } catch (err) { fail(err) }
  }

  const addFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folderName.trim() || !userId) return
    try {
      const { data } = await api.post(`/api/org/${orgId}/folders`, { userId, name: folderName.trim(), workspaceId: folderWs || null })
      if (data?.success) { setFolders(p => [...p, data.data]); setFolderName(''); setMsg(null) }
    } catch (err) { fail(err) }
  }

  const rename = async () => {
    if (!editing || !editName.trim()) return
    try {
      const path = editing.kind === 'ws' ? 'workspaces' : 'folders'
      const { data } = await api.patch(`/api/org/${orgId}/${path}/${editing.id}`, { name: editName.trim() })
      if (data?.success) {
        if (editing.kind === 'ws') setWorkspaces(p => p.map(w => w.id === editing.id ? data.data : w))
        else setFolders(p => p.map(f => f.id === editing.id ? data.data : f))
        setEditing(null)
      }
    } catch (err) { fail(err) }
  }

  const remove = async (kind: 'ws' | 'folder', id: string) => {
    if (confirming !== id) { setConfirming(id); return }
    setConfirming(null)
    try {
      await api.delete(`/api/org/${orgId}/${kind === 'ws' ? 'workspaces' : 'folders'}/${id}`)
      if (kind === 'ws') {
        setWorkspaces(p => p.filter(w => w.id !== id))
        setFolders(p => p.map(f => f.workspaceId === id ? { ...f, workspaceId: null } : f))
      } else {
        setFolders(p => p.filter(f => f.id !== id))
        setAssignments(p => p.map(a => a.folderId === id ? { ...a, folderId: null } : a))
      }
    } catch (err) { fail(err) }
  }

  const moveFolder = async (folder: Folder, workspaceId: string) => {
    try {
      const { data } = await api.patch(`/api/org/${orgId}/folders/${folder.id}`, { workspaceId: workspaceId || null })
      if (data?.success) setFolders(p => p.map(f => f.id === folder.id ? data.data : f))
    } catch (err) { fail(err) }
  }

  const placeMessenger = async (assignment: Assignment, folderId: string) => {
    try {
      const { data } = await api.patch(`/api/org/${orgId}/messenger-assignments/${assignment.id}`, { folderId: folderId || null })
      if (data?.success) setAssignments(p => p.map(a => a.id === assignment.id ? { ...a, folderId: data.data.folderId } : a))
    } catch (err) { fail(err) }
  }

  const nameCell = (kind: 'ws' | 'folder', id: string, name: string) => editing?.kind === kind && editing.id === id ? (
    <form className="st-edit" onSubmit={e => { e.preventDefault(); rename() }}>
      <input className="field-input" value={editName} maxLength={40} autoFocus onChange={e => setEditName(e.target.value)} />
      <button type="submit" className="btn-primary">{s.save}</button>
      <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>{s.cancel}</button>
    </form>
  ) : <span className="st-name">{name}</span>

  const actions = (kind: 'ws' | 'folder', id: string, name: string) => editing?.id === id ? null : (
    <div className="st-actions">
      <button type="button" className="btn-ghost" onClick={() => { setEditing({ kind, id }); setEditName(name); setConfirming(null) }}>{s.edit}</button>
      <button type="button" className="btn-danger" onClick={() => remove(kind, id)} onBlur={() => setConfirming(null)}>{confirming === id ? s.confirmRemove : s.remove}</button>
    </div>
  )

  return (
    <div className="glass-card" style={{ padding: 26 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.title}</div>
      <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', maxWidth: 680, marginBottom: 18 }}>{s.desc}</p>

      {!loading && employees.length === 0 ? <div className="qr-empty">{s.noMembers}</div> : (
        <>
          <div className="field" style={{ maxWidth: 320 }}>
            <label className="field-label" htmlFor="st-employee">{s.employee}</label>
            <select id="st-employee" className="field-input" value={userId} onChange={e => setUserId(e.target.value)}>
              {employees.map(m => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
            </select>
          </div>

          <div className="st-grid">
            <section className="st-block">
              <h4>{s.workspaces}</h4>
              <p className="st-hint">{s.workspacesHint}</p>
              <form className="st-add" onSubmit={addWorkspace}>
                <input className="field-input" value={wsName} maxLength={40} placeholder={s.wsPlaceholder} onChange={e => setWsName(e.target.value)} aria-label={s.workspaces} />
                <button type="submit" className="btn-primary" disabled={!wsName.trim()}>{s.add}</button>
              </form>
              {workspaces.length === 0 ? <div className="st-empty">{s.emptyWs}</div> : workspaces.map(w => (
                <div key={w.id} className="st-row">{nameCell('ws', w.id, w.name)}{actions('ws', w.id, w.name)}</div>
              ))}
            </section>

            <section className="st-block">
              <h4>{s.folders}</h4>
              <form className="st-add" onSubmit={addFolder}>
                <input className="field-input" value={folderName} maxLength={40} placeholder={s.folderPlaceholder} onChange={e => setFolderName(e.target.value)} aria-label={s.folders} />
                {workspaces.length > 0 && (
                  <select className="field-input" value={folderWs} onChange={e => setFolderWs(e.target.value)} aria-label={s.workspaces}>
                    <option value="">{s.noWorkspace}</option>
                    {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <button type="submit" className="btn-primary" disabled={!folderName.trim()}>{s.add}</button>
              </form>
              {folders.length === 0 ? <div className="st-empty">{s.emptyFolders}</div> : folders.map(f => (
                <div key={f.id} className="st-row">
                  {nameCell('folder', f.id, f.name)}
                  {workspaces.length > 0 && editing?.id !== f.id && (
                    <select className="field-input st-small" value={f.workspaceId || ''} onChange={e => moveFolder(f, e.target.value)} aria-label={s.workspaces}>
                      <option value="">{s.noWorkspace}</option>
                      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  )}
                  {actions('folder', f.id, f.name)}
                </div>
              ))}
            </section>
          </div>

          <section className="st-block" style={{ marginTop: 18 }}>
            <h4>{s.messengers}</h4>
            {mine.length === 0 ? <div className="st-empty">{s.noMessengers}</div> : mine.map(a => (
              <div key={a.id} className="st-row">
                <span className="st-name">{a.name}</span>
                <select className="field-input st-small" value={a.folderId || ''} onChange={e => placeMessenger(a, e.target.value)} aria-label={`${s.inFolder}: ${a.name}`}>
                  <option value="">{s.noFolder}</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            ))}
          </section>
        </>
      )}
      {msg && <div className={`form-msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </div>
  )
}
