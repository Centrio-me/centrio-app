'use client'
// Быстрые ответы команды (2026-09-30). Owner/admin manage reply templates
// here; every member sees them read-only in the desktop app's right-side
// "Быстрые ответы" panel, where a click copies the text. Backend:
// /api/org/:orgId/quick-replies (routes/org.js). Text is plain — rendered
// with React text nodes only, never as HTML.
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

const TITLE_MAX = 80
const TEXT_MAX = 2000

interface QuickReply {
  id: string
  title: string
  text: string
}

type Msg = { type: 'ok' | 'err'; text: string } | null

const STR = {
  ru: {
    title: 'Быстрые ответы для команды',
    desc: 'Готовые тексты — адрес, часы работы, цены, подготовка к приёму. Сотрудники видят их в приложении Centrio: правая панель → «Быстрые ответы». Нажатие копирует текст, остаётся вставить его в чат или письмо.',
    empty: 'Пока нет ни одного ответа. Добавьте первый — например, адрес и часы работы.',
    add: 'Добавить ответ',
    nameLabel: 'Название',
    namePlaceholder: 'Например, Адрес и часы работы',
    textLabel: 'Текст',
    textPlaceholder: 'Текст, который сотрудник вставит в чат…',
    save: 'Сохранить',
    saving: 'Сохраняем…',
    cancel: 'Отмена',
    edit: 'Изменить',
    remove: 'Удалить',
    confirmRemove: 'Точно удалить?',
    saved: 'Ответ сохранён',
    removed: 'Ответ удалён',
    loadFailed: 'Не удалось загрузить быстрые ответы',
    saveFailed: 'Не удалось сохранить ответ',
    removeFailed: 'Не удалось удалить ответ',
    fillBoth: 'Заполните название и текст',
    readOnly: 'Изменять быстрые ответы может владелец или администратор команды.',
    count: (n: number) => `${n} из 100`
  },
  en: {
    title: 'Team quick replies',
    desc: 'Ready-made texts — address, opening hours, prices, visit prep. Employees see them in the Centrio app: right panel → "Quick replies". A click copies the text, ready to paste into a chat or email.',
    empty: 'No replies yet. Add the first one — for example, your address and opening hours.',
    add: 'Add reply',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Address and opening hours',
    textLabel: 'Text',
    textPlaceholder: 'Text the employee will paste into a chat…',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    edit: 'Edit',
    remove: 'Delete',
    confirmRemove: 'Delete for sure?',
    saved: 'Reply saved',
    removed: 'Reply deleted',
    loadFailed: 'Could not load quick replies',
    saveFailed: 'Could not save the reply',
    removeFailed: 'Could not delete the reply',
    fillBoth: 'Fill in the name and the text',
    readOnly: 'Only the team owner or an admin can change quick replies.',
    count: (n: number) => `${n} of 100`
  }
}

export default function QuickRepliesPanel({ orgId, lang, canEdit }: { orgId: string; lang: 'ru' | 'en'; canEdit: boolean }) {
  const s = STR[lang]
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/org/${orgId}/quick-replies`)
      if (data?.success) setReplies(data.data)
    } catch {
      setMsg({ type: 'err', text: s.loadFailed })
    } finally {
      setLoading(false)
    }
  }, [orgId, s.loadFailed])

  useEffect(() => { load() }, [load])

  const startEdit = (reply: QuickReply | null) => {
    setMsg(null)
    setConfirmingId(null)
    setEditingId(reply ? reply.id : 'new')
    setDraftTitle(reply?.title || '')
    setDraftText(reply?.text || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftTitle('')
    setDraftText('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = draftTitle.trim()
    const text = draftText.trim()
    if (!title || !text) { setMsg({ type: 'err', text: s.fillBoth }); return }
    setSaving(true)
    setMsg(null)
    try {
      const { data } = editingId === 'new'
        ? await api.post(`/api/org/${orgId}/quick-replies`, { title, text })
        : await api.patch(`/api/org/${orgId}/quick-replies/${editingId}`, { title, text })
      if (data?.success) {
        setReplies(prev => editingId === 'new'
          ? [...prev, data.data]
          : prev.map(r => r.id === data.data.id ? data.data : r))
        cancelEdit()
        setMsg({ type: 'ok', text: s.saved })
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.saveFailed })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirmingId !== id) { setConfirmingId(id); return }
    setConfirmingId(null)
    try {
      await api.delete(`/api/org/${orgId}/quick-replies/${id}`)
      setReplies(prev => prev.filter(r => r.id !== id))
      if (editingId === id) cancelEdit()
      setMsg({ type: 'ok', text: s.removed })
    } catch {
      setMsg({ type: 'err', text: s.removeFailed })
    }
  }

  const form = (
    <form className="qr-form" onSubmit={handleSave}>
      <div>
        <label className="field-label" htmlFor="qr-title">{s.nameLabel}</label>
        <input
          id="qr-title"
          className="field-input"
          value={draftTitle}
          maxLength={TITLE_MAX}
          onChange={e => setDraftTitle(e.target.value)}
          placeholder={s.namePlaceholder}
          autoFocus
        />
      </div>
      <div>
        <div className="qr-label-row">
          <label className="field-label" htmlFor="qr-text">{s.textLabel}</label>
          <span className={`qr-counter${draftText.length >= TEXT_MAX ? ' at-limit' : ''}`}>{draftText.length} / {TEXT_MAX}</span>
        </div>
        <textarea
          id="qr-text"
          className="field-input qr-textarea"
          value={draftText}
          maxLength={TEXT_MAX}
          onChange={e => setDraftText(e.target.value)}
          placeholder={s.textPlaceholder}
          rows={5}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" className="btn-primary" disabled={saving || !draftTitle.trim() || !draftText.trim()}>{saving ? s.saving : s.save}</button>
        <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={saving}>{s.cancel}</button>
      </div>
    </form>
  )

  return (
    <div className="glass-card" style={{ padding: 26 }}>
      <div className="qr-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.title}</div>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', maxWidth: 620 }}>{s.desc}</p>
        </div>
        {canEdit && editingId === null && (
          <button type="button" className="btn-primary" style={{ flexShrink: 0 }} onClick={() => startEdit(null)} disabled={replies.length >= 100}>
            + {s.add}
          </button>
        )}
      </div>

      {!canEdit && <p className="form-msg" style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>{s.readOnly}</p>}

      {editingId === 'new' && form}

      <div className="qr-list">
        {loading ? null : replies.length === 0 && editingId !== 'new' ? (
          <div className="qr-empty">{s.empty}</div>
        ) : (
          replies.map(reply => editingId === reply.id ? (
            <div key={reply.id}>{form}</div>
          ) : (
            <div key={reply.id} className="qr-item">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="qr-item-title">{reply.title}</div>
                <div className="qr-item-text">{reply.text}</div>
              </div>
              {canEdit && (
                <div className="qr-item-actions">
                  <button type="button" className="btn-ghost" onClick={() => startEdit(reply)}>{s.edit}</button>
                  <button type="button" className="btn-danger" onClick={() => handleDelete(reply.id)} onBlur={() => setConfirmingId(null)}>
                    {confirmingId === reply.id ? s.confirmRemove : s.remove}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {replies.length > 0 && <div className="qr-footer">{s.count(replies.length)}</div>}
      {msg && <div className={`form-msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </div>
  )
}
