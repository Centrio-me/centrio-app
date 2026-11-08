'use client'
// «Сейчас» (TEAM control, 2026-11-08): who is at work, where clients wait, and the owner's levers.
// Data: GET /api/org/:orgId/live, kept fresh by the team event stream (presence, commands) with a
// 15-second refresh as the fallback. Only times, counts and statuses — never chat content.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { LIVE_STR, formatHM, type LiveLang } from './live-strings'
import { statusLabel, type LivePerson, type LiveData } from './live-model'
import EmployeePanel from './EmployeePanel'
import './live-board.css'

export function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  )
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.centrio.me'
const REFRESH_MS = 15000

// The team stream over fetch (EventSource cannot send the Authorization header).
function useTeamStream(orgId: string, onEvent: (type: string, data: Record<string, unknown>) => void) {
  const handler = useRef(onEvent)
  handler.current = onEvent
  useEffect(() => {
    const controller = new AbortController()
    let stopped = false
    let attempt = 0
    async function run() {
      while (!stopped) {
        const token = useAuthStore.getState().accessToken
        try {
          const res = await fetch(`${API_URL}/api/org/${orgId}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
          if (!res.ok || !res.body) throw new Error(String(res.status))
          attempt = 0
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let carry = ''
          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break
            const blocks = (carry + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n').split('\n\n')
            carry = blocks.pop() || ''
            for (const block of blocks) {
              let type = ''
              let data = ''
              for (const line of block.split('\n')) {
                if (line.startsWith('event:')) type = line.slice(6).trim()
                else if (line.startsWith('data:')) data += line.slice(5).trim()
              }
              if (!type) continue
              try { handler.current(type, data ? JSON.parse(data) : {}) } catch { handler.current(type, {}) }
            }
          }
        } catch {
          if (stopped) return
        }
        await new Promise(r => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt++)))
      }
    }
    run()
    return () => { stopped = true; controller.abort() }
  }, [orgId])
}

export default function LiveBoard({ orgId, lang, members }: {
  orgId: string
  lang: LiveLang
  members: { userId: string; strictMode?: boolean; role: string }[]
}) {
  const s = LIVE_STR[lang]
  const [data, setData] = useState<LiveData | null>(null)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteState, setNoteState] = useState<'idle' | 'sending' | 'sent' | 'err'>('idle')

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get(`/api/org/${orgId}/live`)
      setData(res.data)
      setError(false)
    } catch {
      setError(true)
    }
  }, [orgId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  useTeamStream(orgId, (type, payload) => {
    if (type === 'presence' && payload.person) {
      const person = payload.person as LivePerson
      setData(d => (d ? { ...d, people: d.people.map(p => (p.userId === person.userId ? person : p)) } : d))
      return
    }
    if (type === 'assignments' || type === 'member' || type === 'command') load()
  })

  const sendNoteAll = async () => {
    if (!noteText.trim()) return
    setNoteState('sending')
    try {
      await api.post(`/api/org/${orgId}/notes`, { text: noteText, toUserId: null })
      setNoteState('sent')
      setNoteText('')
      setTimeout(() => { setNoteOpen(false); setNoteState('idle') }, 1200)
    } catch {
      setNoteState('err')
    }
  }

  if (!data && !error) return <div className="glass-card live-empty">{s.loading}</div>
  if (!data) return <div className="glass-card live-empty">{s.loadFailed}</div>

  const open = data.people.find(p => p.userId === openId) || null
  const strictOf = (userId: string) => members.find(m => m.userId === userId)?.strictMode === true

  return (
    <div className="live">
      <div className="live-top">
        <div className="live-summary" role="list">
          <div className="live-stat" role="listitem"><span className="live-stat-val">{data.summary.onShift}</span><span className="live-stat-lbl">{s.onShift}</span></div>
          <div className={`live-stat${data.summary.waitingNow > 0 ? ' is-warn' : ''}`} role="listitem"><span className="live-stat-val">{data.summary.waitingNow}</span><span className="live-stat-lbl">{s.waitingNow}</span></div>
          <div className={`live-stat${data.summary.longestWaitMin >= 15 ? ' is-bad' : ''}`} role="listitem"><span className="live-stat-val">{data.summary.longestWaitMin ? s.min(data.summary.longestWaitMin) : '—'}</span><span className="live-stat-lbl">{s.longestWait}</span></div>
        </div>
        <div className="live-top-actions">
          <span className="live-pulse" aria-hidden="true" /> <span className="live-muted">{s.updatedLive}</span>
          <button type="button" className="btn-ghost" onClick={() => setNoteOpen(v => !v)}>{s.writeAll}</button>
        </div>
      </div>

      {noteOpen && (
        <div className="glass-card live-note">
          <textarea className="qr-textarea" maxLength={1000} rows={3} value={noteText} placeholder={s.notePlaceholder} onChange={e => setNoteText(e.target.value)} />
          <div className="live-note-actions">
            {noteState === 'sent' && <span className="live-ok">{s.noteSent}</span>}
            {noteState === 'err' && <span className="err">{s.actionFailed}</span>}
            <button type="button" className="btn-ghost" onClick={() => setNoteOpen(false)}>{s.cancel}</button>
            <button type="button" className="btn-primary" disabled={noteState === 'sending' || !noteText.trim()} onClick={sendNoteAll}>{s.noteSend}</button>
          </div>
        </div>
      )}

      {data.people.length === 0 ? (
        <div className="glass-card live-empty">{s.noPeople}</div>
      ) : (
        <div className="glass-card live-list">
          {data.people.map(p => (
            <button type="button" key={p.userId} className={`live-row is-${p.status}${openId === p.userId ? ' is-open' : ''}`} onClick={() => setOpenId(openId === p.userId ? null : p.userId)} aria-expanded={openId === p.userId}>
              <span className="live-dot" aria-hidden="true" />
              <span className="live-name">{p.name}{strictOf(p.userId) && <span className="live-lock" title={s.strict} aria-label={s.strict}><LockIcon /></span>}</span>
              <span className="live-status">{statusLabel(p, lang)}</span>
              <span className="live-front">{p.frontName ? `${s.inFront}: ${p.frontName}` : ''}</span>
              <span className={`live-unread${p.unreadTotal > 0 ? ' has' : ''}`}>{p.unreadTotal}</span>
              <span className={`live-wait${p.longestWait && p.longestWait.minutes >= 15 ? ' is-bad' : ''}`}>{p.longestWait ? s.waits(p.longestWait.assignmentName, p.longestWait.minutes) : ''}</span>
              <span className="live-today">{formatHM(p.activeMinToday)}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <EmployeePanel orgId={orgId} lang={lang} person={open} strict={strictOf(open.userId)} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  )
}
