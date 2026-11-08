'use client'
// «Отчёты» (TEAM control, 2026-11-08): per employee over 7 or 30 days — time at work, reaction time,
// how many clients waited longer than the alert threshold. GET /api/org/:orgId/reports?days=7|30
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { LIVE_STR, formatHM, type LiveLang } from './live-strings'
import './live-board.css'

type Row = { userId: string; name: string; activeMin: number; avgReactionSec: number | null; overThreshold: number; days: number }

export default function ReportsPanel({ orgId, lang }: { orgId: string; lang: LiveLang }) {
  const s = LIVE_STR[lang]
  const [days, setDays] = useState<7 | 30>(7)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [hasError, setHasError] = useState(false)

  const load = useCallback(async () => {
    setRows(null)
    try {
      const { data } = await api.get(`/api/org/${orgId}/reports`, { params: { days } })
      setRows(data.data.rows)
      setHasError(false)
    } catch {
      setHasError(true)
    }
  }, [orgId, days])

  useEffect(() => { load() }, [load])

  const reaction = (sec: number | null) => (sec === null ? '—' : sec < 60 ? `${sec} ${lang === 'en' ? 's' : 'с'}` : s.min(Math.round(sec / 60)))
  const empty = rows !== null && rows.every(r => r.days === 0)

  return (
    <div className="glass-card" style={{ padding: '18px 22px' }}>
      <div className="rep-head">
        <div className="live-muted">{s.reactionHint}</div>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={days === 7} className={days === 7 ? 'active' : ''} onClick={() => setDays(7)}>{s.days7}</button>
          <button type="button" role="tab" aria-selected={days === 30} className={days === 30 ? 'active' : ''} onClick={() => setDays(30)}>{s.days30}</button>
        </div>
      </div>
      {hasError ? (
        <div className="err">{s.loadFailed}</div>
      ) : rows === null ? (
        <div className="live-muted">{s.loading}</div>
      ) : empty ? (
        <div className="live-muted">{s.noData}</div>
      ) : (
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th>{s.colName}</th>
                <th className="num">{s.colActive}</th>
                <th className="num">{s.colReaction}</th>
                <th className="num">{s.colOver}</th>
                <th className="num">{s.colDays}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.userId}>
                  <td>{r.name}</td>
                  <td className="num">{formatHM(r.activeMin)}</td>
                  <td className="num">{reaction(r.avgReactionSec)}</td>
                  <td className={`num${r.overThreshold > 0 ? ' rep-bad' : ''}`}>{r.overThreshold}</td>
                  <td className="num">{r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
