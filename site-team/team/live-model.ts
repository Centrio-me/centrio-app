// Shapes of GET /api/org/:orgId/live and the status line (TEAM control, 2026-11-08).
import { LIVE_STR, type LiveLang } from './live-strings'

export interface LiveMessenger { id: string; name: string; paused: boolean; unread: number; waitingMin: number | null; loginState: 'in' | 'out' | null }
export interface LivePerson {
  userId: string
  name: string
  status: 'working' | 'away' | 'offline' | 'off_hours'
  sinceAt: string | null
  frontName: string | null
  unreadTotal: number
  waitingCount: number
  longestWait: { assignmentName: string; minutes: number } | null
  signInProblems: number
  devices: number
  activeMinToday: number
  messengers: LiveMessenger[]
}
export interface LiveData { summary: { onShift: number; waitingNow: number; longestWaitMin: number }; people: LivePerson[]; inHours: boolean }

function clockOf(iso: string | null, lang: LiveLang) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function statusLabel(p: LivePerson, lang: LiveLang) {
  const s = LIVE_STR[lang]
  if (p.status === 'working') return s.statusWorking
  if (p.status === 'away') return s.statusAway(p.sinceAt ? Math.max(1, Math.round((Date.now() - new Date(p.sinceAt).getTime()) / 60000)) : 5)
  if (p.status === 'offline') return s.statusOffline(clockOf(p.sinceAt, lang))
  return s.statusOffHours
}

