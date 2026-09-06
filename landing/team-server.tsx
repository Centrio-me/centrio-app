'use client'

// Корпоративная версия (TEAM) — Phase 1 self-service console.
// См. Obsidian → Centrio → Корпоративная версия (план + журнал реализации).
// Scope reminder: organizations, seats, membership, invites, self-service
// seat billing, audit log. Org policy (whitelist/forced settings), SSO,
// silent-deploy are Phase 2+ — NOT here.
//
// NOTE on deploy path: flat local checkout, deployed to
// /var/www/centrio-web/src/app/team/page.tsx (same "-server.tsx" naming
// convention as dashboard-server.tsx/admin-server.tsx — see deploy-frontend.js).
//
// Phase 1 MVP simplification: a user belongs to at most one org (enforced in
// org-routes.js, not at the schema level), so this is a single flat page —
// no /team/[slug] dynamic route.

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Montserrat } from 'next/font/google'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'

// Same display family as dashboard-server.tsx — one consistent "premium SaaS
// cabinet" identity across the personal and org consoles.
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

// ── Types ─────────────────────────────────────────────────────────────────
interface OrgSummary {
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER'
  orgTier: 'START' | 'BUSINESS'
  orgSeatLimit: number
  orgSeatsUsed: number
  orgSeatsExpiresAt?: string | null
  orgAutoRenewSeats?: boolean
  orgIsOwner?: boolean
}

interface Member {
  userId: string
  email: string
  name?: string | null
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  joinedAt: string
}

interface AuditLog {
  id: string
  actorUserId: string
  action: string
  metaJson: any
  createdAt: string
}

type Msg = { type: 'ok' | 'err'; text: string } | null

// ── Constants ────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = { OWNER: 'Владелец', ADMIN: 'Администратор', MEMBER: 'Участник' }
const TIER_LABELS: Record<string, string> = { START: 'TEAM Старт', BUSINESS: 'TEAM Бизнес' }
const TIER_COLOR = '#06b6d4'

// Mirrors SEAT_PLANS in landing/org-routes.js — keep the numbers in sync by
// hand (no shared module between the Express API and this Next.js app in
// this repo layout; see the identical sync-by-comment convention already
// used between org-routes.js and auto-renew-cron.js).
const SEAT_PLANS = {
  month: { pricePerSeat: 179, months: 1, label: '1 месяц' },
  year: { pricePerSeat: 149, months: 12, label: '1 год' }, // billed as 1788₽/место (149×12)
} as const
const MIN_SEATS = 5
const MAX_SEATS_SELF_SERVICE = 49

// ── Icons ────────────────────────────────────────────────────────────────
const IcoTeamBig = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M16 5.2c1.5.3 2.6 1.6 2.6 3.1 0 1.5-1.1 2.8-2.6 3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M17.5 14.3c2.1.6 3.5 2.4 3.5 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
)
const IcoOverview = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="8.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M15 5.4c1.4.3 2.4 1.5 2.4 2.9s-1 2.6-2.4 2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16.5 14.3c2 .5 3.5 2.2 3.5 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoCard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoCrown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M3 8.5l4.5 3L12 4l4.5 7.5 4.5-3-2 10.5H5L3 8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
)
const IcoCheck = ({ color = '#22c55e' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7h12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}
function shortId(id: string) { return id ? `${id.slice(0, 8)}…` : '—' }

function describeAudit(log: AuditLog, byUser: Record<string, Member>) {
  const meta = log.metaJson || {}
  switch (log.action) {
    case 'org.create': return `Организация создана («${meta.name || ''}»)`
    case 'member.invite': return `Приглашение отправлено: ${meta.email} (${ROLE_LABELS[meta.role] || meta.role})`
    case 'member.accept': return `${meta.email} присоединился к организации (${ROLE_LABELS[meta.role] || meta.role})`
    case 'member.remove': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return `Участник удалён: ${who}`
    }
    case 'member.role': {
      const who = byUser[meta.userId]?.email || shortId(meta.userId)
      return `Роль изменена: ${who} → ${ROLE_LABELS[meta.role] || meta.role}`
    }
    case 'seats.purchase': return `Куплено мест: ${meta.seats} (оплата за ${meta.months} мес.)`
    default: return log.action
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
// useSearchParams() (?payment=success after a YooKassa redirect) requires a
// Suspense boundary at build time, same reasoning as dashboard-server.tsx.
export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageInner />
    </Suspense>
  )
}

function TeamPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentStatus = searchParams.get('payment')
  const { user, _hasHydrated, setUser } = useAuthStore()

  const [tab, setTab] = useState<'overview' | 'members' | 'billing' | 'audit'>('overview')
  const [org, setOrg] = useState<OrgSummary | null>((user?.orgSummary as OrgSummary) ?? null)

  // Create-org (no-org state)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [createOrgMsg, setCreateOrgMsg] = useState<Msg>(null)

  // Members
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Invite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<Msg>(null)

  // Member row actions
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null)
  const [memberActionMsg, setMemberActionMsg] = useState<Msg>(null)

  // Billing / seats
  const [seatsPeriod, setSeatsPeriod] = useState<'month' | 'year'>('month')
  const [seatsCount, setSeatsCount] = useState(MIN_SEATS)
  const [buyingSeats, setBuyingSeats] = useState(false)
  const [buyMsg, setBuyMsg] = useState<Msg>(null)
  const [paymentBanner, setPaymentBanner] = useState<'checking' | 'ok' | null>(paymentStatus === 'success' ? 'checking' : null)

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  useEffect(() => {
    if (_hasHydrated && !user) router.push('/auth/login')
  }, [user, _hasHydrated, router])

  // Keep local org state in sync if the store's copy changes elsewhere
  // (e.g. a fresh /api/auth/me on another tab writes a newer orgSummary).
  useEffect(() => {
    setOrg((user?.orgSummary as OrgSummary) ?? null)
  }, [user?.orgSummary])

  const refreshOrg = useCallback(async () => {
    if (!org?.orgId || !user) return
    try {
      const { data } = await api.get(`/api/org/${org.orgId}`)
      if (data?.success) {
        setOrg(data.data)
        setUser({ ...user, orgSummary: data.data })
      }
    } catch {
      // best-effort — keep showing the last known org state
    }
  }, [org?.orgId, user, setUser])

  useEffect(() => {
    if (org?.orgId) refreshOrg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.orgId])

  const loadMembers = useCallback(async () => {
    if (!org?.orgId) return
    setLoadingMembers(true)
    try {
      const { data } = await api.get(`/api/org/${org.orgId}/members`)
      if (data?.success) setMembers(data.data)
    } catch {} finally { setLoadingMembers(false) }
  }, [org?.orgId])

  useEffect(() => { loadMembers() }, [loadMembers])

  useEffect(() => {
    if (tab !== 'audit' || !org?.orgId) return
    setLoadingAudit(true)
    api.get(`/api/org/${org.orgId}/audit`)
      .then(({ data }) => { if (data?.success) setAuditLogs(data.data) })
      .catch(() => {})
      .finally(() => setLoadingAudit(false))
  }, [tab, org?.orgId])

  // Best-effort confirmation after the YooKassa redirect. There's no
  // paymentId in the return_url (YooKassa doesn't reliably append one — see
  // the identical situation in payment-success.tsx), so this just polls the
  // org summary a few times to pick up the webhook's (or, if that's not
  // wired up yet — see org-routes.js's operational-blocker comment — a
  // manual GET /api/org/:orgId's own recompute) eventual result.
  useEffect(() => {
    if (paymentStatus !== 'success' || !org?.orgId) return
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < 5 && !cancelled; i++) {
        await refreshOrg()
        await new Promise(r => setTimeout(r, 2500))
      }
      if (!cancelled) setPaymentBanner('ok')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, org?.orgId])

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateOrgMsg(null)
    const name = orgNameDraft.trim()
    if (!name) { setCreateOrgMsg({ type: 'err', text: 'Введите название организации' }); return }
    setCreatingOrg(true)
    try {
      const { data } = await api.post('/api/org', { name })
      if (data?.success && user) {
        const created: OrgSummary = {
          orgId: data.data.id,
          orgName: data.data.name,
          orgSlug: data.data.slug,
          orgRole: 'OWNER',
          orgTier: data.data.tier,
          orgSeatLimit: data.data.seatLimit,
          orgSeatsUsed: 1,
          orgIsOwner: true,
        }
        setOrg(created)
        setUser({ ...user, orgSummary: created })
        setTab('members')
      }
    } catch (err: any) {
      setCreateOrgMsg({ type: 'err', text: err.response?.data?.error || 'Не удалось создать организацию' })
    } finally {
      setCreatingOrg(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteMsg(null)
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInviteMsg({ type: 'err', text: 'Введите корректный email' }); return }
    if (!org) return
    setInviting(true)
    try {
      const { data } = await api.post(`/api/org/${org.orgId}/invites`, { email, role: inviteRole })
      if (data?.success) {
        setInviteMsg({ type: 'ok', text: `Приглашение отправлено на ${email}` })
        setInviteEmail('')
        setInviteRole('MEMBER')
        refreshOrg()
      }
    } catch (err: any) {
      setInviteMsg({ type: 'err', text: err.response?.data?.error || 'Не удалось отправить приглашение' })
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!org) return
    if (!window.confirm('Удалить участника из организации?')) return
    setRemovingUserId(userId)
    setMemberActionMsg(null)
    try {
      await api.delete(`/api/org/${org.orgId}/members/${userId}`)
      setMembers(prev => prev.filter(m => m.userId !== userId))
      refreshOrg()
    } catch (err: any) {
      setMemberActionMsg({ type: 'err', text: err.response?.data?.error || 'Не удалось удалить участника' })
    } finally {
      setRemovingUserId(null)
    }
  }

  const handleChangeRole = async (userId: string, role: 'ADMIN' | 'MEMBER') => {
    if (!org) return
    setRoleUpdatingUserId(userId)
    setMemberActionMsg(null)
    try {
      await api.patch(`/api/org/${org.orgId}/members/${userId}`, { role })
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m))
    } catch (err: any) {
      setMemberActionMsg({ type: 'err', text: err.response?.data?.error || 'Не удалось изменить роль' })
    } finally {
      setRoleUpdatingUserId(null)
    }
  }

  const handleBuySeats = async () => {
    if (!org) return
    setBuyMsg(null)
    setBuyingSeats(true)
    try {
      const { data } = await api.post(`/api/org/${org.orgId}/seats/create-payment`, { seats: seatsCount, period: seatsPeriod })
      if (data?.success && data.data.confirmationUrl) {
        window.location.href = data.data.confirmationUrl
      }
    } catch (err: any) {
      setBuyMsg({ type: 'err', text: err.response?.data?.error || 'Не удалось создать платёж' })
      setBuyingSeats(false)
    }
  }

  if (!_hasHydrated || (_hasHydrated && !user)) {
    return (
      <div style={{ minHeight: '100vh', background: '#060a14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 38, height: 38, border: '3px solid rgba(6,182,212,0.25)', borderTopColor: TIER_COLOR, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const byUser = Object.fromEntries(members.map(m => [m.userId, m]))
  const totalPrice = SEAT_PLANS[seatsPeriod].pricePerSeat * seatsCount * (seatsPeriod === 'year' ? 12 : 1)
  const canManage = org?.orgRole === 'OWNER' || org?.orgRole === 'ADMIN'
  const isOwner = org?.orgRole === 'OWNER'
  const freeSeats = org ? Math.max(0, org.orgSeatLimit - org.orgSeatsUsed) : 0

  const NAV = [
    { key: 'overview', label: 'Обзор', Icon: IcoOverview },
    { key: 'members', label: 'Участники', Icon: IcoUsers },
    { key: 'billing', label: 'Места и оплата', Icon: IcoCard },
    ...(canManage ? [{ key: 'audit', label: 'Журнал действий', Icon: IcoShield }] : []),
  ] as const

  return (
    <div className={`team-shell ${montserrat.className}`} style={{ minHeight: '100vh', background: '#060a14', color: '#fff' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#060a14}

        .glass-card{
          background:rgba(255,255,255,0.04);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.08);border-radius:20px;animation:fadeIn .4s ease both;
        }
        .btn-primary{
          background:linear-gradient(135deg,#0891b2,#06b6d4);border:none;color:#04161a;border-radius:12px;
          padding:11px 22px;font-size:13.5px;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit;
          box-shadow:0 4px 20px rgba(6,182,212,0.3);display:flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;
        }
        .btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(6,182,212,0.42)}
        .btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .btn-danger{
          background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:10px;
          padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s;
          display:flex;align-items:center;gap:6px;white-space:nowrap;
        }
        .btn-danger:hover{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.4)}
        .btn-danger:disabled{opacity:.5;cursor:not-allowed}
        .btn-ghost{
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);
          border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
          transition:all .18s;display:flex;align-items:center;gap:7px;
        }
        .btn-ghost:hover{background:rgba(255,255,255,0.09);color:rgba(255,255,255,0.85)}

        .nav-item{
          position:relative;display:flex;align-items:center;gap:11px;padding:11px 14px;border-radius:13px;
          font-size:13.5px;font-weight:600;color:rgba(255,255,255,0.45);cursor:pointer;border:none;background:none;
          width:100%;text-align:left;font-family:inherit;transition:all .2s cubic-bezier(.4,0,.2,1);
        }
        .nav-item:hover{color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06)}
        .nav-item.active{
          color:#fff;background:linear-gradient(135deg,rgba(6,182,212,0.24),rgba(8,145,178,0.14));
          border:1px solid rgba(34,211,238,0.35);box-shadow:0 4px 18px rgba(6,182,212,0.18);
        }
        .nav-item.active svg{color:#22d3ee}

        .field-label{font-size:11.5px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;display:block}
        .field-input{
          width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:11px;
          padding:12px 14px;color:#fff;font-size:14px;font-family:inherit;outline:none;transition:border-color .18s,background .18s,box-shadow .18s;
        }
        .field-input:focus{border-color:rgba(34,211,238,0.55);background:rgba(6,182,212,0.07);box-shadow:0 0 0 3px rgba(6,182,212,0.14)}
        .field-select{
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:11px;
          padding:12px 14px;color:#fff;font-size:14px;font-family:inherit;outline:none;cursor:pointer;
        }
        .section-title{font-size:15px;font-weight:800;letter-spacing:-.01em;margin-bottom:18px;display:flex;align-items:center;gap:9px}
        .section-title svg{color:#22d3ee}

        .badge{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em}
        .form-msg{font-size:12.5px;font-weight:600}
        .form-msg.ok{color:#22c55e}
        .form-msg.err{color:#f87171}

        .member-row{
          display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:14px;
          background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          animation:fadeIn .35s ease both;
        }
        .member-avatar{
          width:38px;height:38px;border-radius:11px;background:rgba(6,182,212,0.14);border:1px solid rgba(6,182,212,0.3);
          display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#22d3ee;flex-shrink:0;
        }
        .stepper{display:flex;align-items:center;gap:10px}
        .stepper button{
          width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
          color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:background .15s;
        }
        .stepper button:hover{background:rgba(255,255,255,0.12)}
        .stepper button:disabled{opacity:.4;cursor:not-allowed}
        .period-toggle{display:flex;gap:8px}
        .period-toggle button{
          flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
          color:rgba(255,255,255,0.6);font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;transition:all .18s;
        }
        .period-toggle button.active{border-color:rgba(34,211,238,0.5);background:rgba(6,182,212,0.12);color:#fff}

        .mini-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:13px;padding:14px 16px;text-align:center}
        .mini-stat-value{font-size:20px;font-weight:900;letter-spacing:-.02em}
        .mini-stat-label{font-size:10.5px;color:rgba(255,255,255,0.35);margin-top:2px;font-weight:600}

        .audit-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px}
        .audit-row:last-child{border-bottom:none}

        @media (max-width:900px){
          .team-shell-inner{flex-direction:column !important}
          .team-sidebar{width:100% !important;height:auto !important;position:relative !important;flex-direction:row !important;flex-wrap:wrap !important;border-right:none !important;border-bottom:1px solid rgba(255,255,255,0.07) !important;padding:14px 16px !important}
          .team-nav{flex-direction:row !important;overflow-x:auto !important}
          .team-main{padding:20px 16px !important}
        }
      `}</style>

      {/* Ambient glow — cyan, distinct from the blue personal dashboard */}
      <div style={{ position: 'fixed', top: -200, left: '25%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {!org ? (
        // ════════════════ NO-ORG STATE: create org ════════════════
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
          <div className="glass-card" style={{ maxWidth: 520, width: '100%', padding: 40 }}>
            <a href="/dashboard" className="btn-ghost" style={{ display: 'inline-flex', marginBottom: 24, padding: '7px 12px', fontSize: 12.5 }}>
              <IcoBack /> В личный кабинет
            </a>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee', marginBottom: 20 }}>
              <IcoTeamBig />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 10 }}>Centrio TEAM Старт</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 24 }}>
              Организация — это общий биллинг мест для команды: пригласите коллег по email,
              управляйте ролями и оплачивайте места самостоятельно, без договора и менеджера.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
              <div className="mini-stat">
                <div className="mini-stat-value" style={{ color: '#22d3ee' }}>179 ₽</div>
                <div className="mini-stat-label">место / мес</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-value" style={{ color: '#22d3ee' }}>149 ₽</div>
                <div className="mini-stat-label">место / мес при годовой оплате</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
              От {MIN_SEATS} мест. Для 50+ мест — напишите на sales@centrio.me.
            </p>
            <form onSubmit={handleCreateOrg}>
              <label className="field-label">Название организации</label>
              <input
                className="field-input"
                value={orgNameDraft}
                onChange={e => setOrgNameDraft(e.target.value)}
                placeholder="Например, ООО «Ромашка»"
                maxLength={80}
                style={{ marginBottom: 14 }}
              />
              {createOrgMsg && <div className={`form-msg ${createOrgMsg.type}`} style={{ marginBottom: 14 }}>{createOrgMsg.text}</div>}
              <button type="submit" className="btn-primary" disabled={creatingOrg} style={{ width: '100%' }}>
                {creatingOrg ? 'Создаём…' : 'Создать организацию'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        // ════════════════ HAS-ORG STATE ════════════════
        <div className="team-shell-inner" style={{ display: 'flex', position: 'relative', zIndex: 1 }}>
          <aside className="team-sidebar" style={{
            width: 252, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
            background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', padding: '24px 16px', gap: 20,
          }}>
            <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', padding: '0 8px' }}>
              <img src="/logo.png" alt="Centrio" width={28} height={28} style={{ borderRadius: 8, objectFit: 'contain' }} />
              <span style={{ fontWeight: 900, fontSize: 16, color: '#fff', letterSpacing: '-.03em' }}>Centrio</span>
            </a>

            <div style={{ padding: '0 8px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.25)', letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 8 }}>Организация</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>{org.orgName}</div>
              <span className="badge" style={{ background: `${TIER_COLOR}22`, color: TIER_COLOR, border: `1px solid ${TIER_COLOR}44` }}>{TIER_LABELS[org.orgTier]}</span>
            </div>

            <nav className="team-nav" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              {NAV.map(({ key, label, Icon }) => (
                <button key={key} className={`nav-item${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                  <Icon />{label}
                </button>
              ))}
            </nav>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
                Ваша роль: <strong style={{ color: '#fff' }}>{ROLE_LABELS[org.orgRole]}</strong>
              </div>
              <a href="/dashboard" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}>
                <IcoBack /> Личный кабинет
              </a>
            </div>
          </aside>

          <main className="team-main" style={{ flex: 1, minHeight: '100vh', padding: '36px 32px', maxWidth: 980 }}>
            {paymentBanner && (
              <div className="glass-card" style={{
                padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
                borderColor: paymentBanner === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(6,182,212,0.3)',
              }}>
                {paymentBanner === 'checking'
                  ? <div style={{ width: 16, height: 16, border: '2px solid rgba(6,182,212,0.3)', borderTopColor: '#22d3ee', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                  : <IcoCheck />}
                <span style={{ fontSize: 13.5 }}>
                  {paymentBanner === 'checking' ? 'Подтверждаем оплату мест…' : 'Оплата подтверждена — места добавлены в организацию.'}
                </span>
              </div>
            )}

            {tab === 'overview' && (
              <>
                <div className="section-title"><IcoOverview /> Обзор</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatsUsed}/{org.orgSeatLimit}</div><div className="mini-stat-label">мест занято</div></div>
                  <div className="mini-stat"><div className="mini-stat-value">{freeSeats}</div><div className="mini-stat-label">свободно</div></div>
                  <div className="mini-stat"><div className="mini-stat-value" style={{ fontSize: 15 }}>{fmtDate(org.orgSeatsExpiresAt)}</div><div className="mini-stat-label">оплачено до</div></div>
                </div>
                <div className="glass-card" style={{ padding: 26 }}>
                  <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                    Организация «{org.orgName}» на тарифе {TIER_LABELS[org.orgTier]}.
                    {org.orgAutoRenewSeats ? ' Автопродление мест включено.' : ' Автопродление мест выключено.'}
                    {' '}Перейдите во вкладку «Участники», чтобы пригласить коллег, или «Места и оплата», чтобы докупить места.
                  </p>
                </div>
              </>
            )}

            {tab === 'members' && (
              <>
                <div className="section-title"><IcoUsers /> Участники ({members.length})</div>

                {canManage && (
                  <div className="glass-card" style={{ padding: 22, marginBottom: 20 }}>
                    <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <label className="field-label">Email коллеги</label>
                        <input className="field-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="coworker@company.com" />
                      </div>
                      {isOwner && (
                        <div>
                          <label className="field-label">Роль</label>
                          <select className="field-select" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}>
                            <option value="MEMBER">Участник</option>
                            <option value="ADMIN">Администратор</option>
                          </select>
                        </div>
                      )}
                      <button type="submit" className="btn-primary" disabled={inviting || freeSeats <= 0}>
                        <IcoSend /> {inviting ? 'Отправляем…' : 'Пригласить'}
                      </button>
                    </form>
                    {freeSeats <= 0 && <div className="form-msg err" style={{ marginTop: 10 }}>Нет свободных мест — купите ещё во вкладке «Места и оплата».</div>}
                    {inviteMsg && <div className={`form-msg ${inviteMsg.type}`} style={{ marginTop: 10 }}>{inviteMsg.text}</div>}
                  </div>
                )}

                {memberActionMsg && <div className={`form-msg ${memberActionMsg.type}`} style={{ marginBottom: 12 }}>{memberActionMsg.text}</div>}

                {loadingMembers ? (
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>Загрузка…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {members.map(m => {
                      const canRemove = canManage && m.role !== 'OWNER' && !(m.role === 'ADMIN' && !isOwner)
                      return (
                        <div key={m.userId} className="member-row">
                          <div className="member-avatar">{(m.name || m.email).charAt(0).toUpperCase()}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{m.email}</div>
                          </div>
                          {isOwner && m.role !== 'OWNER' ? (
                            <select
                              className="field-select"
                              value={m.role}
                              disabled={roleUpdatingUserId === m.userId}
                              onChange={e => handleChangeRole(m.userId, e.target.value as 'ADMIN' | 'MEMBER')}
                              style={{ padding: '7px 10px', fontSize: 12.5 }}
                            >
                              <option value="MEMBER">Участник</option>
                              <option value="ADMIN">Администратор</option>
                            </select>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                              {m.role === 'OWNER' && <IcoCrown />} {ROLE_LABELS[m.role]}
                            </span>
                          )}
                          {canRemove && (
                            <button className="btn-danger" disabled={removingUserId === m.userId} onClick={() => handleRemoveMember(m.userId)}>
                              <IcoTrash /> {removingUserId === m.userId ? '…' : 'Удалить'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {tab === 'billing' && (
              <>
                <div className="section-title"><IcoCard /> Места и оплата</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatLimit}</div><div className="mini-stat-label">всего мест</div></div>
                  <div className="mini-stat"><div className="mini-stat-value">{org.orgSeatsUsed}</div><div className="mini-stat-label">занято</div></div>
                  <div className="mini-stat"><div className="mini-stat-value" style={{ fontSize: 15 }}>{fmtDate(org.orgSeatsExpiresAt)}</div><div className="mini-stat-label">оплачено до</div></div>
                </div>

                {isOwner ? (
                  <div className="glass-card" style={{ padding: 26 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Купить дополнительные места</div>
                    <div className="period-toggle" style={{ marginBottom: 16 }}>
                      <button className={seatsPeriod === 'month' ? 'active' : ''} onClick={() => setSeatsPeriod('month')}>1 месяц · 179 ₽/место</button>
                      <button className={seatsPeriod === 'year' ? 'active' : ''} onClick={() => setSeatsPeriod('year')}>1 год · 149 ₽/место в мес.</button>
                    </div>
                    <label className="field-label">Количество мест</label>
                    <div className="stepper" style={{ marginBottom: 18 }}>
                      <button type="button" disabled={seatsCount <= MIN_SEATS} onClick={() => setSeatsCount(c => Math.max(MIN_SEATS, c - 1))}>−</button>
                      <div style={{ fontSize: 18, fontWeight: 800, minWidth: 32, textAlign: 'center' }}>{seatsCount}</div>
                      <button type="button" disabled={seatsCount >= MAX_SEATS_SELF_SERVICE} onClick={() => setSeatsCount(c => Math.min(MAX_SEATS_SELF_SERVICE, c + 1))}>+</button>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>от {MIN_SEATS} до {MAX_SEATS_SELF_SERVICE}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Итого к оплате</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee' }}>{totalPrice.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    {buyMsg && <div className={`form-msg ${buyMsg.type}`} style={{ marginBottom: 14 }}>{buyMsg.text}</div>}
                    <button className="btn-primary" style={{ width: '100%' }} disabled={buyingSeats} onClick={handleBuySeats}>
                      {buyingSeats ? 'Переходим к оплате…' : 'Оплатить'}
                    </button>
                    <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>
                      Больше 50 мест? Напишите на sales@centrio.me для индивидуальных условий.
                    </p>
                  </div>
                ) : (
                  <div className="glass-card" style={{ padding: 26 }}>
                    <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.5)' }}>Покупка мест доступна только владельцу организации.</p>
                  </div>
                )}
              </>
            )}

            {tab === 'audit' && canManage && (
              <>
                <div className="section-title"><IcoShield /> Журнал действий</div>
                <div className="glass-card" style={{ padding: '10px 26px' }}>
                  {loadingAudit ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, padding: '16px 0' }}>Загрузка…</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, padding: '16px 0' }}>Пока нет записей.</div>
                  ) : (
                    auditLogs.map(log => (
                      <div key={log.id} className="audit-row">
                        <span>{describeAudit(log, byUser)}</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{new Date(log.createdAt).toLocaleString('ru-RU')}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
