'use client'
// One employee on the «Сейчас» tab (TEAM control, 2026-11-08): his messengers and the owner's levers.
// Every action goes to POST /api/org/:orgId/members/:userId/commands and is written to the audit log.
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { LIVE_STR, formatHM, type LiveLang } from './live-strings'
import { statusLabel, type LivePerson } from './live-model'

type Delivery = Record<'reload' | 'relogin' | 'wipe', { done: number; total: number }>
type Props = {
  orgId: string
  lang: LiveLang
  person: LivePerson
  strict: boolean
  onClose: () => void
  onChanged: () => void
}

export default function EmployeePanel({ orgId, lang, person, strict, onClose, onChanged }: Props) {
  const s = LIVE_STR[lang]
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [noteText, setNoteText] = useState('')

  const loadDelivery = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/org/${orgId}/members/${person.userId}/commands`)
      setDelivery(data.data.delivery)
    } catch { /* the panel works without it */ }
  }, [orgId, person.userId])

  useEffect(() => { loadDelivery() }, [loadDelivery])

  const send = async (key: string, body: { kind: string; assignmentId?: string }) => {
    setBusy(key)
    setMessage(null)
    try {
      const { data } = await api.post(`/api/org/${orgId}/members/${person.userId}/commands`, body)
      setMessage({ ok: true, text: s.sentToDevices(data.data.devices) })
      onChanged()
      loadDelivery()
    } catch {
      setMessage({ ok: false, text: s.actionFailed })
    } finally {
      setBusy(null)
    }
  }

  const sendNote = async () => {
    if (!noteText.trim()) return
    setBusy('note')
    try {
      await api.post(`/api/org/${orgId}/notes`, { text: noteText, toUserId: person.userId })
      setNoteText('')
      setMessage({ ok: true, text: s.noteSent })
    } catch {
      setMessage({ ok: false, text: s.actionFailed })
    } finally {
      setBusy(null)
    }
  }

  const loginLabel = (state: 'in' | 'out' | null) => (state === 'in' ? s.signedIn : state === 'out' ? s.signInNeeded : s.notOpened)
  const wipeDelivery = delivery && delivery.wipe.total > 0 ? s.delivered(delivery.wipe.done, delivery.wipe.total) : null

  return (
    <section className="glass-card live-panel" aria-label={person.name}>
      <header className="live-panel-head">
        <div>
          <div className="live-panel-name">{person.name}</div>
          <div className="live-muted">
            {statusLabel(person, lang)} · {s.todayActive(formatHM(person.activeMinToday))} · {s.devices(person.devices)}
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose}>{s.close}</button>
      </header>

      <div className="live-panel-title">{s.messengers}</div>
      <ul className="live-msgs">
        {person.messengers.map(m => (
          <li key={m.id} className={`live-msg${m.paused ? ' is-paused' : ''}`}>
            <span className="live-msg-name">{m.name}</span>
            <span className="live-muted">
              {m.paused ? s.paused : `${loginLabel(m.loginState)} · ${s.unread}: ${m.unread}${m.waitingMin !== null ? ` · ${s.min(m.waitingMin)}` : ''}`}
            </span>
            <span className="live-msg-actions">
              {m.paused ? (
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => send(`resume:${m.id}`, { kind: 'resume', assignmentId: m.id })}>{s.turnOn}</button>
              ) : (
                <>
                  <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => send(`reload:${m.id}`, { kind: 'reload', assignmentId: m.id })}>{s.reload}</button>
                  <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => send(`relogin:${m.id}`, { kind: 'relogin', assignmentId: m.id })}>{s.relogin}</button>
                  <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => send(`pause:${m.id}`, { kind: 'pause', assignmentId: m.id })}>{s.turnOff}</button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="live-panel-title">{s.write}</div>
      <textarea className="qr-textarea" rows={2} maxLength={1000} value={noteText} placeholder={s.notePlaceholder} onChange={e => setNoteText(e.target.value)} />
      <div className="live-note-actions">
        <button type="button" className="btn-primary" disabled={busy === 'note' || !noteText.trim()} onClick={sendNote}>{s.noteSend}</button>
      </div>

      <div className="live-danger">
        {!confirmWipe ? (
          <button type="button" className="btn-ghost live-danger-btn" disabled={!!busy} onClick={() => setConfirmWipe(true)}>{s.endSessions}</button>
        ) : (
          <div className="live-confirm" role="alert">
            <p>{s.endSessionsConfirm}</p>
            <div className="live-note-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirmWipe(false)}>{s.cancel}</button>
              <button type="button" className="btn-primary live-danger-yes" disabled={!!busy} onClick={() => { setConfirmWipe(false); send('wipe', { kind: 'wipe' }) }}>{s.endSessionsYes}</button>
            </div>
          </div>
        )}
        {wipeDelivery && <div className="live-muted">{wipeDelivery}</div>}
      </div>

      {message && <div className={message.ok ? 'live-ok' : 'err'} role="status">{message.text}</div>}
      <p className="live-muted live-panel-foot">{strict ? `${s.strict}. ` : ''}{s.whatEmployeeSees}</p>
    </section>
  )
}
