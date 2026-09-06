'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Montserrat } from 'next/font/google'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'

// Self-hosted via next/font (no extra network request, font-display:swap by
// default, only the weights actually used are downloaded) — one deliberate
// display family for the whole personal cabinet instead of the site-wide
// Inter, per the "premium SaaS cabinet" redesign request.
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

// ── Types ─────────────────────────────────────────────────────────
interface StatsData {
  today:    { appTime: number; notifCount: number; msgSent: number; msgReceived: number }
  week:     { appTime: number; notifCount: number; msgSent: number; msgReceived: number }
  total:    { appTime: number; notifCount: number; msgSent: number; msgReceived: number }
  streak:   number
  services: { name: string; minutes: number; notifCount: number }[]
  chart:    { date: string; label: string; minutes: number }[]
}

interface Device {
  id: string; os: string; browser: string; icon: string
  ipAddress: string; createdAt: string; label: string
}

interface LoginEvent {
  id: string; provider: string; providerLabel: string; os: string; icon: string
  ipAddress: string; createdAt: string
}

interface ProfileExtra {
  createdAt?: string
  counts?: { messengers: number; folders: number }
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtTime(secs: number) {
  if (!secs) return '0 мин'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}ч ${m}м`
  return `${m} мин`
}

const PLAN_COLORS: Record<string, string> = {
  FREE: '#64748b', PRO: '#3b82f6', TEAM: '#06b6d4'
}
const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free', PRO: 'Pro', TEAM: 'Team'
}
// Mirrors REFERRAL_BONUS_DAYS in landing/lib/referral.js — display-only,
// the actual grant amount is always decided server-side.
const REFERRAL_BONUS_DAYS = 14

// Silent poll cadence for an open support-ticket thread (lets an admin reply
// — from the dashboard or via the Telegram tickets integration — show up
// without the user reloading the page). Matches TICKET_POLL_MS in
// admin-server.tsx deliberately: both share the same global express-rate-limit
// budget (100 req/15min per IP across ALL /api/ routes, see
// api-index-server.js), and 30s leaves enough headroom that a thread left
// open for the full window doesn't eat the budget other dashboard calls need.
const TICKET_THREAD_POLL_MS = 30000

// ── SVG Icons ─────────────────────────────────────────────────────
const IcoOverview = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M4 20.5c0-4.2 3.58-7.5 8-7.5s8 3.3 8 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoDevices = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 18h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="16" y="8" width="6" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 18v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M11 18v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoSubscription = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L14.4 8.6L21.5 9.3L16.5 13.8L18.1 20.7L12 17.1L5.9 20.7L7.5 13.8L2.5 9.3L9.6 8.6L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoCheck = ({ color = '#3b82f6' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoTime = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoMsg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoFlame = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoCard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="4" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoCrown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M3 8.5l4.5 3L12 4l4.5 7.5 4.5-3-2 10.5H5L3 8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
)
const IcoLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoCamera = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7h12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const IcoGift = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="9" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="5" y="13" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 9v12M12 9c-1.5-4-6-4-6-1.2C6 9 8 9 12 9ZM12 9c1.5-4 6-4 6-1.2C18 9 16 9 12 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const IcoCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const IcoSupport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
// Корпоративная версия (TEAM) — Phase 1: sidebar entry point to the
// self-service org console (landing/team-server.tsx). A real navigation link,
// not a NAV tab entry, since /team is its own page/route.
const IcoTeam = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16 5.2c1.5.3 2.6 1.6 2.6 3.1 0 1.5-1.1 2.8-2.6 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M17.5 14.3c2.1.6 3.5 2.4 3.5 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)

// ── Main Component ────────────────────────────────────────────────
// useSearchParams() (used below to read the ?emailVerified=1|0 redirect
// param) requires a Suspense boundary at build time — without it `next build`
// fails prerendering entirely and takes the whole site down (learned the
// hard way: this broke prod once). fallback is null since the dashboard
// already gates on `_hasHydrated`/`user` before rendering real content, so
// there's no meaningful loading state to show during the brief Suspense gap.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  )
}

function DashboardPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout, setUser, _hasHydrated } = useAuthStore()
  const [tab, setTab] = useState<'overview' | 'profile' | 'devices' | 'subscription' | 'referral' | 'support'>('overview')
  const [stats, setStats]     = useState<StatsData | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loginHistory, setLoginHistory] = useState<LoginEvent[]>([])
  const [loadingStats, setLoadingStats]     = useState(true)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)
  const [buyingPlan, setBuyingPlan] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [autoRenew, setAutoRenew]     = useState(false)
  const [hasMethod, setHasMethod]     = useState(false)
  const [togglingAR, setTogglingAR]   = useState(false)
  const [promoCode, setPromoCode]         = useState('')
  const [redeemingPromo, setRedeemingPromo] = useState(false)
  const [promoMsg, setPromoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [referralInfo, setReferralInfo] = useState<{ referralCode: string; totalReferred: number; bonusesGranted: number; pending: number; bonusDays: number } | null>(null)
  const [loadingReferral, setLoadingReferral] = useState(false)
  const [referralCopied, setReferralCopied] = useState(false)

  // ── Support tickets tab state ──────────────────────────────────
  const [tickets, setTickets] = useState<any[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [activeTicket, setActiveTicket] = useState<any | null>(null)
  const [loadingTicketThread, setLoadingTicketThread] = useState(false)
  const [newTicketSubject, setNewTicketSubject] = useState('')
  const [newTicketBody, setNewTicketBody] = useState('')
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [ticketMsg, setTicketMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // ── Profile tab state ──────────────────────────────────────────
  const [profileExtra, setProfileExtra] = useState<ProfileExtra | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [sendingVerify, setSendingVerify] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) router.push('/auth/login')
  }, [user?.id, _hasHydrated]) // eslint-disable-line

  useEffect(() => {
    if (!user?.id) return
    api.get('/api/stats/summary')
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false))
  }, [user?.id]) // eslint-disable-line

  useEffect(() => {
    setNameDraft(user?.name || '')
  }, [user?.name])

  const loadDevices = useCallback(() => {
    setLoadingDevices(true)
    api.get('/api/user/devices')
      .then(r => setDevices(r.data.devices || []))
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false))
  }, [])

  useEffect(() => {
    if (tab === 'devices') loadDevices()
  }, [tab, loadDevices])

  const loadLoginHistory = useCallback(() => {
    setLoadingHistory(true)
    api.get('/api/user/login-history')
      .then(r => setLoginHistory(r.data.events || []))
      .catch(() => setLoginHistory([]))
      .finally(() => setLoadingHistory(false))
  }, [])

  useEffect(() => {
    if (tab === 'devices') loadLoginHistory()
  }, [tab, loadLoginHistory])

  const loadProfile = useCallback(() => {
    setLoadingProfile(true)
    api.get('/api/user/profile')
      .then(r => setProfileExtra({ createdAt: r.data?.createdAt, counts: r.data?._count }))
      .catch(() => setProfileExtra(null))
      .finally(() => setLoadingProfile(false))
  }, [])

  useEffect(() => {
    if (tab === 'profile') loadProfile()
  }, [tab, loadProfile])

  const handleSaveProfile = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) { setProfileMsg({ type: 'err', text: 'Имя не может быть пустым' }); return }
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const { data } = await api.put('/api/user/profile', { name: trimmed })
      setUser({ ...(user as any), name: data?.name ?? trimmed })
      setProfileMsg({ type: 'ok', text: 'Изменения сохранены' })
    } catch (e: any) {
      setProfileMsg({ type: 'err', text: e?.response?.data?.error || 'Не удалось сохранить' })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordMsg(null)
    if (newPassword.length < 8) { setPasswordMsg({ type: 'err', text: 'Новый пароль — минимум 8 символов' }); return }
    if (newPassword !== newPassword2) { setPasswordMsg({ type: 'err', text: 'Пароли не совпадают' }); return }
    setSavingPassword(true)
    try {
      await api.put('/api/user/password', { currentPassword, newPassword })
      setPasswordMsg({ type: 'ok', text: 'Пароль обновлён' })
      setCurrentPassword(''); setNewPassword(''); setNewPassword2('')
    } catch (e: any) {
      setPasswordMsg({ type: 'err', text: e?.response?.data?.error || 'Не удалось изменить пароль' })
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSendVerification = async () => {
    setSendingVerify(true)
    setVerifyMsg(null)
    try {
      const { data } = await api.post('/api/auth/verify-email/send')
      setVerifyMsg({ type: 'ok', text: data?.message || 'Письмо отправлено, проверьте почту' })
    } catch (e: any) {
      setVerifyMsg({ type: 'err', text: e?.response?.data?.error || 'Не удалось отправить письмо' })
    } finally {
      setSendingVerify(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      await api.delete(`/api/user/devices/${id}`)
      setDevices(prev => prev.filter(d => d.id !== id))
    } catch {}
    setRevokingId(null)
  }

  const handleLogoutAll = async () => {
    if (!confirm('Выйти на всех устройствах? Вы будете перенаправлены на страницу входа.')) return
    setLoggingOutAll(true)
    try {
      await api.delete('/api/user/devices', { data: {} })
      logout()
      router.push('/auth/login')
    } catch (e: any) {
      alert('Ошибка: ' + (e?.response?.data?.error || e?.message || 'попробуйте ещё раз'))
      setLoggingOutAll(false)
    }
  }

  const handleBuyPlan = async (plan: 'month' | 'year', method?: string) => {
    setBuyingPlan(plan)
    try {
      const { data } = await api.post('/api/payments/create', { plan, ...(method ? { method } : {}) })
      if (data?.data?.confirmationUrl) {
        window.location.href = data.data.confirmationUrl
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Ошибка создания платежа. Попробуйте позже.')
    } finally {
      setBuyingPlan(null)
    }
  }

  // Способ оплаты выбирается в НАШЕМ интерфейсе, до перехода на страницу
  // ЮKassa (см. showPaymentMethodModal ниже) — раньше выбор был только на
  // самой странице ЮKassa post-redirect.
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState<'month' | 'year' | null>(null)
  const PAYMENT_METHOD_OPTIONS: { id: string; label: string; sub: string }[] = [
    { id: 'bank_card', label: 'Банковская карта', sub: 'Visa, Mastercard, МИР' },
    { id: 'sbp',       label: 'СБП',              sub: 'Система быстрых платежей' },
    { id: 'yoo_money', label: 'ЮMoney',           sub: 'Кошелёк ЮMoney' },
    { id: 'sberbank',  label: 'SberPay',          sub: 'Оплата через СберБанк Онлайн' },
  ]
  const selectPaymentMethod = (method: string) => {
    const plan = showPaymentMethodModal
    setShowPaymentMethodModal(null)
    if (plan) handleBuyPlan(plan, method)
  }

  // Crypto checkout — separate flow from YooKassa above: this hits a
  // Next.js API route on our own origin (landing/api/create-crypto-payment/
  // route.ts, proxying to NOWPayments), not the Express API at api.centrio.me,
  // so it can't go through the shared `api` axios instance — that instance's
  // baseURL points at api.centrio.me. The token is attached manually instead.
  const handleBuyCrypto = async (plan: 'month' | 'year') => {
    setShowPaymentMethodModal(null)
    setBuyingPlan(plan)
    try {
      const token = useAuthStore.getState().accessToken
      const res = await fetch('/api/create-crypto-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.payment_url) {
        window.location.href = data.payment_url
      } else {
        alert(data?.error || 'Ошибка создания платежа. Попробуйте позже.')
        setBuyingPlan(null)
      }
    } catch (e: any) {
      alert('Ошибка создания платежа. Попробуйте позже.')
      setBuyingPlan(null)
    }
  }

  // FRIDE checkout ("Карты EU/US") — hits the Express API directly
  // (landing/payments-server.js's /fride-create), so unlike crypto above it
  // goes through the normal `api` axios instance like YooKassa does.
  const handleBuyFride = async (plan: 'month' | 'year') => {
    setShowPaymentMethodModal(null)
    setBuyingPlan(plan)
    try {
      const { data } = await api.post('/api/payments/fride-create', { plan })
      if (data?.success && data?.data?.paymentUrl) {
        window.location.href = data.data.paymentUrl
      } else {
        alert(data?.error || 'Ошибка создания платежа. Попробуйте позже.')
        setBuyingPlan(null)
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Ошибка создания платежа. Попробуйте позже.')
      setBuyingPlan(null)
    }
  }

  const loadPayments = useCallback(() => {
    setLoadingPayments(true)
    api.get('/api/payments/my')
      .then(r => setPayments(r.data?.data || []))
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false))
  }, [])

  const refreshUser = useCallback(() => {
    api.get('/api/user/profile')
      .then(r => { if (r.data?.id) setUser(r.data) })
      .catch(() => {})
  }, [setUser])

  // Avatar upload: FormData POST to /api/upload/avatar (multer-backed route,
  // see landing/upload-route.js). Deliberately no explicit Content-Type
  // header here — axios auto-detects the FormData body and lets the browser
  // set 'multipart/form-data' with the correct boundary itself; overriding
  // it manually (a common mistake) drops the boundary and breaks parsing
  // server-side. Validates type/size client-side first purely for fast UX
  // feedback — the server re-validates both (multer fileFilter + 5MB limit
  // in upload-route.js) since client-side checks are trivially bypassable.
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so selecting the same file again still fires onChange
    if (!file || uploadingAvatar) return

    if (!file.type.startsWith('image/')) {
      setAvatarMsg({ type: 'err', text: 'Можно загрузить только изображение' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMsg({ type: 'err', text: 'Файл слишком большой (максимум 5 МБ)' })
      return
    }

    setUploadingAvatar(true)
    setAvatarMsg(null)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const { data } = await api.post('/api/upload/avatar', formData)
      if (data?.avatar) {
        setUser({ ...(user as any), avatar: data.avatar })
        setAvatarMsg({ type: 'ok', text: 'Аватар обновлён' })
      } else {
        setAvatarMsg({ type: 'err', text: 'Не удалось загрузить аватар' })
      }
    } catch (err: any) {
      setAvatarMsg({ type: 'err', text: err?.response?.data?.error || 'Не удалось загрузить аватар' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Account deletion: DELETE /api/user/me (see landing/user-route.js).
  // The server anonymizes rather than hard-deletes (sessions/messengers/
  // folders are removed immediately, the user row is scrubbed of PII but
  // kept for payment/tax-record retention) — see the comment on that route
  // for why. Requires typing the literal word "УДАЛИТЬ" client-side as an
  // extra guard against a stray click on something this irreversible;
  // password is optional here (left blank for OAuth-only accounts with no
  // passwordHash set — mirrors the same convention already used in the
  // "Изменить пароль" form above) and the server itself decides whether a
  // password is actually required for this particular account.
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'УДАЛИТЬ') {
      setDeleteMsg({ type: 'err', text: 'Введите «УДАЛИТЬ» для подтверждения' })
      return
    }
    setDeletingAccount(true)
    setDeleteMsg(null)
    try {
      await api.delete('/api/user/me', { data: { password: deletePassword || undefined, confirmDelete: true } })
      logout()
      router.push('/')
    } catch (e: any) {
      setDeleteMsg({ type: 'err', text: e?.response?.data?.error || 'Не удалось удалить аккаунт' })
      setDeletingAccount(false)
    }
  }

  // Landed here from the "Подтвердить email" link clicked in the inbox —
  // the API redirects back with ?emailVerified=1|0 after consuming the
  // token server-side. Refresh the cached user (picks up emailVerified:true)
  // and surface the result, then strip the query param so a page reload
  // doesn't re-show the banner.
  useEffect(() => {
    const verified = searchParams.get('emailVerified')
    if (verified === null) return
    if (verified === '1') {
      refreshUser()
      setVerifyMsg({ type: 'ok', text: 'Email подтверждён' })
    } else {
      setVerifyMsg({ type: 'err', text: 'Не удалось подтвердить email — ссылка недействительна или устарела' })
    }
    setTab('profile')
    router.replace('/dashboard')
  }, [searchParams, refreshUser, router])

  const loadAutoRenew = useCallback(() => {
    api.get('/api/payments/auto-renew')
      .then(r => { setAutoRenew(r.data?.data?.autoRenew ?? false); setHasMethod(r.data?.data?.hasMethod ?? false) })
      .catch(() => {})
  }, [])

  const loadReferral = useCallback(() => {
    setLoadingReferral(true)
    api.get('/api/user/referrals')
      .then(r => setReferralInfo(r.data))
      .catch(() => setReferralInfo(null))
      .finally(() => setLoadingReferral(false))
  }, [])

  // Guarded: this is a client component, but Next.js still renders it once
  // server-side for the initial HTML before hydration — `window` doesn't
  // exist there. Same class of bug this codebase already hit once with
  // useSearchParams() needing a Suspense boundary; the fix here is simpler
  // since we just need to skip window access, not restructure the tree.
  const referralLink = referralInfo && typeof window !== 'undefined'
    ? `${window.location.origin}/auth/register?ref=${referralInfo.referralCode}`
    : ''

  const copyReferralLink = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 2000)
    } catch {}
  }

  const toggleAutoRenew = async () => {
    setTogglingAR(true)
    try {
      const { data } = await api.patch('/api/payments/auto-renew', { enabled: !autoRenew })
      setAutoRenew(data?.data?.autoRenew ?? !autoRenew)
    } catch {} finally { setTogglingAR(false) }
  }

  const redeemPromoCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!promoCode.trim() || redeemingPromo) return
    setRedeemingPromo(true); setPromoMsg(null)
    try {
      const { data } = await api.post('/api/payments/promo/redeem', { code: promoCode.trim() })
      if (data?.success) {
        const grant = data.data.days != null ? `${data.data.days} дн.` : `${data.data.months} мес.`
        setPromoMsg({ type: 'ok', text: `Промокод активирован — +${grant} Pro` })
        setPromoCode('')
        refreshUser()
        loadPayments()
      } else {
        setPromoMsg({ type: 'err', text: data?.error || 'Не удалось активировать код' })
      }
    } catch (err: any) {
      setPromoMsg({ type: 'err', text: err?.response?.data?.error || 'Не удалось активировать код' })
    } finally {
      setRedeemingPromo(false)
    }
  }

  useEffect(() => {
    if (tab === 'subscription') {
      refreshUser()
      loadPayments()
      loadAutoRenew()
    }
    if (tab === 'referral') {
      loadReferral()
    }
  }, [tab, loadPayments, refreshUser, loadAutoRenew, loadReferral])

  const loadTickets = useCallback(() => {
    setLoadingTickets(true)
    api.get('/api/tickets')
      .then(r => setTickets(r.data?.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setLoadingTickets(false))
  }, [])

  useEffect(() => {
    if (tab === 'support') loadTickets()
  }, [tab, loadTickets])

  const openTicket = async (id: string) => {
    setLoadingTicketThread(true)
    setActiveTicket(null)
    try {
      const { data } = await api.get(`/api/tickets/${id}`)
      setActiveTicket(data)
    } catch {
      setActiveTicket(null)
    } finally {
      setLoadingTicketThread(false)
    }
  }

  const closeTicketThread = () => {
    setActiveTicket(null)
    setReplyBody('')
    loadTickets()
  }

  // While a ticket thread is open, quietly re-fetch it in the background so a
  // support/admin/Telegram reply appears without a page reload. Deliberately
  // does NOT touch loadingTicketThread (no spinner flash) and only replaces
  // activeTicket when something actually changed, so it doesn't disturb the
  // reply form or re-render the message list on every idle tick. Paused while
  // the tab isn't visible to stay well within the shared /api/ rate limit.
  useEffect(() => {
    if (!activeTicket) return
    const ticketId = activeTicket.id
    let cancelled = false

    async function pollThread() {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const { data } = await api.get(`/api/tickets/${ticketId}`)
        if (cancelled || !data) return
        setActiveTicket(prev => {
          if (!prev || prev.id !== data.id) return prev
          const changed = prev.status !== data.status || (prev.messages || []).length !== (data.messages || []).length
          return changed ? data : prev
        })
      } catch { /* сеть недоступна — просто пропускаем этот цикл опроса */ }
    }

    const interval = setInterval(pollThread, TICKET_THREAD_POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeTicket?.id])

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTicketSubject.trim() || !newTicketBody.trim() || creatingTicket) return
    setCreatingTicket(true)
    setTicketMsg(null)
    try {
      const { data } = await api.post('/api/tickets', { subject: newTicketSubject.trim(), body: newTicketBody.trim() })
      setNewTicketSubject('')
      setNewTicketBody('')
      setTicketMsg({ type: 'ok', text: 'Обращение отправлено' })
      loadTickets()
      if (data?.id) openTicket(data.id)
    } catch (err: any) {
      setTicketMsg({ type: 'err', text: err?.response?.data?.error || 'Не удалось отправить обращение' })
    } finally {
      setCreatingTicket(false)
    }
  }

  const sendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyBody.trim() || !activeTicket || sendingReply) return
    setSendingReply(true)
    try {
      await api.post(`/api/tickets/${activeTicket.id}/messages`, { body: replyBody.trim() })
      setReplyBody('')
      openTicket(activeTicket.id)
    } catch {} finally {
      setSendingReply(false)
    }
  }

  const TICKET_STATUS_LABEL: Record<string, string> = { OPEN: 'Открыто', ANSWERED: 'Отвечено', CLOSED: 'Закрыто' }
  const TICKET_STATUS_COLOR: Record<string, string> = { OPEN: '#fbbf24', ANSWERED: '#4ade80', CLOSED: 'rgba(255,255,255,0.35)' }

  if (!_hasHydrated || !user) {
    return (
      <div style={{ minHeight:'100vh', background:'#060a14', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const isPro  = user.plan === 'PRO'  || user.plan === 'TEAM'
  const isTeam = user.plan === 'TEAM'
  const planColor = PLAN_COLORS[user.plan || 'FREE'] || '#64748b'
  const chartMax = Math.max(...(stats?.chart.map(c => c.minutes) || [1]), 1)
  const initial = (user.name || user.email).charAt(0).toUpperCase()

  const NAV = [
    { key: 'overview',     label: 'Обзор',              Icon: IcoOverview },
    { key: 'profile',      label: 'Профиль',            Icon: IcoUser },
    { key: 'devices',      label: 'Устройства',          Icon: IcoDevices },
    { key: 'subscription', label: 'Подписка',            Icon: IcoSubscription },
    { key: 'referral',     label: 'Приглашай друзей',    Icon: IcoGift },
    { key: 'support',      label: 'Поддержка',           Icon: IcoSupport },
  ] as const

  const glass = {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 20,
  } as React.CSSProperties

  const glassBlue = {
    background: 'rgba(59,130,246,0.08)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 20,
    boxShadow: '0 0 40px rgba(59,130,246,0.08)',
  } as React.CSSProperties

  return (
    <div className={`dash-shell ${montserrat.className}`} style={{ minHeight:'100vh', background:'#060a14', color:'#fff', display:'flex' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(59,130,246,0.25);border-radius:4px}
        body{background:#060a14}

        .nav-item{
          position:relative;
          display:flex;align-items:center;gap:11px;
          padding:11px 14px;border-radius:13px;
          font-size:13.5px;font-weight:600;
          color:rgba(255,255,255,0.45);
          cursor:pointer;border:none;background:none;
          width:100%;text-align:left;font-family:inherit;
          transition:all .2s cubic-bezier(.4,0,.2,1);
        }
        .nav-item:hover{color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06);transform:translateX(2px)}
        .nav-item.active{
          color:#fff;
          background:linear-gradient(135deg, rgba(59,130,246,0.24), rgba(99,102,241,0.14));
          border:1px solid rgba(96,165,250,0.35);
          box-shadow:0 4px 18px rgba(59,130,246,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .nav-item.active::before{
          content:'';position:absolute;left:-16px;top:50%;transform:translateY(-50%);
          width:3px;height:18px;border-radius:3px;
          background:linear-gradient(180deg,#60a5fa,#818cf8);
          box-shadow:0 0 10px rgba(96,165,250,0.75);
        }
        .nav-item.active svg{color:#60a5fa;filter:drop-shadow(0 0 6px rgba(96,165,250,0.5))}

        .upgrade-cta{
          width:100%;display:flex;align-items:center;justify-content:center;gap:8px;
          background:linear-gradient(135deg,#f59e0b,#f97316);
          border:none;border-radius:12px;color:#1a0f02;font-weight:800;font-size:12.5px;
          padding:10px 14px;margin-bottom:10px;cursor:pointer;font-family:inherit;
          box-shadow:0 4px 16px rgba(245,158,11,0.35);transition:transform .18s ease, box-shadow .18s ease;
        }
        .upgrade-cta:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(245,158,11,0.45)}

        .avatar-ring-sm{
          width:42px;height:42px;border-radius:13px;flex-shrink:0;padding:2px;
          background:conic-gradient(from 200deg, ${planColor}, ${planColor}55, ${planColor});
          box-shadow:0 4px 14px ${planColor}45;
        }
        .avatar-ring-sm-inner{
          width:100%;height:100%;border-radius:11px;
          background:#0a0f1e;display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:14.5px;color:#fff;
          overflow:hidden;
        }
        .avatar-img{
          width:100%;height:100%;object-fit:cover;border-radius:inherit;
        }

        .stat-card{
          background:rgba(255,255,255,0.04);
          backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:20px;
          padding:24px;
          transition:border-color .2s, box-shadow .2s, transform .2s;
          animation:fadeIn .4s ease both;
        }
        .stat-card:hover{border-color:rgba(59,130,246,0.3);box-shadow:0 0 30px rgba(59,130,246,0.1);transform:translateY(-2px)}

        .glass-card{
          background:rgba(255,255,255,0.04);
          backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:20px;
          animation:fadeIn .4s ease both;
        }

        .btn-primary{
          background:linear-gradient(135deg,#2563eb,#3b82f6);
          border:none;color:#fff;border-radius:12px;
          padding:11px 22px;font-size:13.5px;font-weight:700;
          cursor:pointer;transition:all .2s;font-family:inherit;
          box-shadow:0 4px 20px rgba(59,130,246,0.35);
          display:flex;align-items:center;justify-content:center;gap:7px;
          white-space:nowrap;
        }
        .btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(59,130,246,0.45)}
        .btn-primary:active{transform:translateY(0)}
        .btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}

        .btn-danger{
          background:rgba(239,68,68,0.08);
          border:1px solid rgba(239,68,68,0.2);
          color:#f87171;border-radius:10px;
          padding:9px 16px;font-size:13px;font-weight:600;
          cursor:pointer;font-family:inherit;
          transition:all .2s;white-space:nowrap;
          display:flex;align-items:center;gap:7px;
        }
        .btn-danger:hover{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.4)}
        .btn-danger:disabled{opacity:0.5;cursor:not-allowed}

        .btn-ghost{
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.1);
          color:rgba(255,255,255,0.55);border-radius:10px;
          padding:9px 16px;font-size:13px;font-weight:600;
          cursor:pointer;font-family:inherit;
          transition:all .18s;
          display:flex;align-items:center;gap:7px;
        }
        .btn-ghost:hover{background:rgba(255,255,255,0.09);color:rgba(255,255,255,0.8)}

        .plan-card{
          position:relative;overflow:hidden;
          background:rgba(255,255,255,0.04);
          backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:20px;padding:26px;flex:1;
          display:flex;flex-direction:column;gap:16px;
          transition:all .25s;
          animation:fadeIn .4s ease both;
        }
        .plan-card:hover{border-color:rgba(255,255,255,0.16);transform:translateY(-3px)}
        .plan-card.pro{border-color:rgba(59,130,246,0.35);background:rgba(59,130,246,0.06);box-shadow:0 0 40px rgba(59,130,246,0.1)}
        .plan-card.pro:hover{box-shadow:0 8px 44px rgba(59,130,246,0.22)}
        .plan-card.team{border-color:rgba(6,182,212,0.35);background:rgba(6,182,212,0.06);box-shadow:0 0 40px rgba(6,182,212,0.08)}
        .plan-card.current-plan{box-shadow:inset 0 0 0 1.5px currentColor}
        .plan-ribbon{
          position:absolute;top:16px;right:-32px;
          background:linear-gradient(135deg,#22c55e,#16a34a);
          color:#04160a;font-size:10px;font-weight:800;letter-spacing:.05em;
          padding:4px 38px;transform:rotate(40deg);
          box-shadow:0 3px 10px rgba(34,197,94,0.4);
        }

        .device-row{
          background:rgba(255,255,255,0.04);
          backdrop-filter:blur(20px);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:16px;padding:18px 22px;
          display:flex;align-items:center;gap:16px;
          transition:border-color .2s;
          animation:fadeIn .35s ease both;
        }
        .device-row:hover{border-color:rgba(59,130,246,0.25)}

        .badge{
          font-size:10.5px;font-weight:700;
          padding:3px 8px;border-radius:6px;
          text-transform:uppercase;letter-spacing:.04em;
        }

        .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
        .bar-col:hover .bar-fill{filter:brightness(1.25)}
        .bar-fill{width:100%;border-radius:5px 5px 2px 2px;transition:height .5s cubic-bezier(.4,0,.2,1),filter .2s}

        .field-label{
          font-size:11.5px;font-weight:700;color:rgba(255,255,255,0.4);
          text-transform:uppercase;letter-spacing:.06em;
          margin-bottom:7px;display:block;
        }
        .field-input{
          width:100%;background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.1);border-radius:11px;
          padding:12px 14px;color:#fff;font-size:14px;
          font-family:inherit;outline:none;
          transition:border-color .18s, background .18s, box-shadow .18s;
        }
        .field-input:focus{border-color:rgba(96,165,250,0.55);background:rgba(59,130,246,0.07);box-shadow:0 0 0 3px rgba(59,130,246,0.14)}
        .field-input:disabled{opacity:.5;cursor:not-allowed}

        .section-title{
          font-size:15px;font-weight:800;letter-spacing:-.01em;
          margin-bottom:18px;display:flex;align-items:center;gap:9px;
        }
        .section-title svg{color:rgba(96,165,250,0.8)}

        .mini-stat{
          background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:13px;padding:12px 14px;text-align:center;
        }
        .mini-stat-value{font-size:19px;font-weight:900;letter-spacing:-.02em}
        .mini-stat-label{font-size:10.5px;color:rgba(255,255,255,0.35);margin-top:2px;font-weight:600}

        .avatar-ring-lg{
          width:92px;height:92px;border-radius:26px;
          background:conic-gradient(from 200deg, #60a5fa, #818cf8, #38bdf8, #60a5fa);
          padding:3px;margin:0 auto;
          box-shadow:0 10px 30px rgba(59,130,246,0.3);
        }
        .avatar-ring-lg-inner{
          width:100%;height:100%;border-radius:23px;
          background:#0a0f1e;display:flex;align-items:center;justify-content:center;
          font-size:34px;font-weight:900;color:#fff;
          overflow:hidden;
        }
        .avatar-edit-btn{
          position:absolute;right:-2px;bottom:-2px;width:30px;height:30px;border-radius:50%;
          background:linear-gradient(135deg,#3b82f6,#6366f1);border:3px solid #0a0f1e;
          display:flex;align-items:center;justify-content:center;color:#fff;
          box-shadow:0 4px 12px rgba(59,130,246,0.45);transition:transform .15s ease;
        }
        .avatar-edit-btn:hover{transform:scale(1.08)}

        .form-msg{ font-size:12.5px; font-weight:600; }
        .form-msg.ok{ color:#22c55e; }
        .form-msg.err{ color:#f87171; }

        /* ── Mobile responsiveness ── */
        @media (max-width: 900px){
          .dash-shell{ flex-direction:column !important; overflow-x:hidden !important; }
          .dash-sidebar{
            width:100% !important; height:auto !important; min-height:0 !important;
            position:relative !important; top:auto !important;
            flex-direction:row !important; flex-wrap:wrap !important; align-items:center !important;
            border-right:none !important; border-bottom:1px solid rgba(255,255,255,0.07) !important;
            padding:14px 16px !important; gap:10px !important;
          }
          .dash-sidebar > a{ margin-bottom:0 !important; flex-shrink:0; }
          .dash-menu-label{ display:none !important; }
          .dash-nav{
            flex-direction:row !important; flex:1 1 100% !important; order:3;
            overflow-x:auto !important; gap:6px !important;
            -webkit-overflow-scrolling:touch;
          }
          .dash-nav .nav-item{
            width:auto !important; flex-shrink:0; white-space:nowrap;
            padding:9px 12px !important;
          }
          .dash-nav .nav-item.active::before{ display:none; }
          .dash-usercard{
            border-top:none !important; padding-top:0 !important;
            margin-left:auto; display:flex !important; align-items:center; gap:8px;
          }
          .dash-usercard > button:first-child{ margin-bottom:0 !important; }
          .dash-usercard .upgrade-cta{ display:none; }
          .dash-usercard .btn-ghost{ width:auto !important; padding:9px 12px !important; font-size:0 !important; gap:0 !important; }
          .dash-usercard .btn-ghost svg{ font-size:initial; }
          .dash-main{ padding:20px 16px !important; }

          .dash-grid-4{ grid-template-columns:1fr 1fr !important; }
          .dash-grid-main-320{ grid-template-columns:1fr !important; }
          .dash-grid-320-1{ grid-template-columns:1fr !important; }
          .dash-grid-3{ grid-template-columns:1fr !important; }
          .dash-plan-cards{ flex-direction:column !important; }
          .dash-summary-strip{ grid-template-columns:1fr 1fr !important; row-gap:16px !important; }
          .dash-summary-strip > div:nth-child(3){ border-left:none !important; margin-left:0 !important; }
        }
        @media (max-width: 520px){
          .dash-grid-4{ grid-template-columns:1fr 1fr !important; gap:10px !important; }
          .dash-summary-strip{ grid-template-columns:1fr !important; }
          .dash-summary-strip > div{ border-left:none !important; margin-left:0 !important; padding-left:0 !important; }
          .dash-main{ padding:16px 12px !important; }
        }
      `}</style>

      {/* ── Ambient glow ── */}
      <div style={{ position:'fixed', top:-200, left:'20%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(59,130,246,0.13) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', bottom:-100, right:'10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

      {/* ════════════════ SIDEBAR ════════════════ */}
      <aside className="dash-sidebar" style={{
        width: 252, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 16px', zIndex: 10,
      }}>
        {/* Logo */}
        <a href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', marginBottom:36, paddingLeft:4 }}>
          <img src="/logo.png" alt="Centrio" width={32} height={32} style={{ borderRadius:9, objectFit:'contain' }} />
          <span style={{ fontWeight:900, fontSize:18, color:'#fff', letterSpacing:'-.03em' }}>Centrio</span>
        </a>

        {/* Navigation */}
        <nav className="dash-nav" style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
          <div className="dash-menu-label" style={{ fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,0.25)', letterSpacing:'.09em', textTransform:'uppercase', marginBottom:6, paddingLeft:4 }}>
            Меню
          </div>
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`nav-item${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
          <a href="/team" className="nav-item" style={{ textDecoration:'none' }}>
            <IcoTeam />
            {user.orgSummary ? 'Команда' : 'Создать команду'}
          </a>
        </nav>

        {/* User card */}
        <div className="dash-usercard" style={{ borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:18 }}>
          <button
            onClick={() => setTab('profile')}
            style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, paddingLeft:2, background:'none', border:'none', cursor:'pointer', width:'100%', textAlign:'left', font:'inherit' }}
          >
            <div className="avatar-ring-sm">
              <div className="avatar-ring-sm-inner">
                {user.avatar ? <img src={user.avatar} alt="" className="avatar-img" /> : initial}
              </div>
            </div>
            <div style={{ overflow:'hidden', flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user.name || user.email.split('@')[0]}
              </div>
              <span className="badge" style={{ background:`${planColor}22`, color:planColor, border:`1px solid ${planColor}44`, display:'inline-flex', alignItems:'center', gap:4 }}>
                {isPro && <IcoCrown />} {PLAN_LABELS[user.plan || 'FREE']}
              </span>
            </div>
          </button>
          {!isPro && (
            <button className="upgrade-cta" onClick={() => setTab('subscription')}>
              <IcoCrown /> Перейти на Pro
            </button>
          )}
          <button className="btn-ghost" style={{ width:'100%', justifyContent:'center', fontSize:12.5 }} onClick={() => { logout(); router.push('/') }}>
            <IcoLogout /> Выйти
          </button>
        </div>
      </aside>

      {/* ════════════════ MAIN ════════════════ */}
      <main className="dash-main" style={{ flex:1, minHeight:'100vh', overflowY:'auto', padding:'36px 32px', position:'relative', zIndex:1 }}>

        {/* ──────────── OVERVIEW ──────────── */}
        {tab === 'overview' && (
          <div>
            {/* Page header */}
            <div style={{ marginBottom:32 }}>
              <h1 style={{ fontSize:25, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>
                {new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 17 ? 'Добрый день' : 'Добрый вечер'}
                {user.name ? `, ${user.name.split(' ')[0]}` : ''}
              </h1>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>
                Статистика использования Centrio
              </p>
            </div>

            {/* No data banner */}
            {!loadingStats && stats && stats.total.appTime === 0 && (
              <div style={{ ...glassBlue, padding:'18px 22px', marginBottom:28, display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>Установите приложение</div>
                  <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.45)' }}>После установки Centrio здесь появится статистика</div>
                </div>
                <a href="/download/windows" className="btn-primary" style={{ textDecoration:'none' }}>
                  Скачать <IcoArrow />
                </a>
              </div>
            )}

            {/* Stat cards */}
            <div className="dash-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
              {[
                {
                  label: 'Время сегодня',
                  value: loadingStats ? '...' : fmtTime(stats?.today.appTime || 0),
                  sub: `За неделю: ${fmtTime(stats?.week.appTime || 0)}`,
                  color: '#3b82f6',
                  Icon: IcoTime,
                },
                {
                  label: 'Уведомлений',
                  value: loadingStats ? '...' : (stats?.total.notifCount || 0).toLocaleString(),
                  sub: `Сегодня: ${stats?.today.notifCount || 0}`,
                  color: '#818cf8',
                  Icon: IcoBell,
                },
                {
                  label: 'Сообщений',
                  value: loadingStats ? '...' : (stats?.total.msgSent || 0).toLocaleString(),
                  sub: `Получено: ${(stats?.total.msgReceived || 0).toLocaleString()}`,
                  color: '#38bdf8',
                  Icon: IcoMsg,
                },
                {
                  label: 'Дней подряд',
                  value: loadingStats ? '...' : `${stats?.streak || 0}`,
                  sub: 'Streak',
                  color: '#f472b6',
                  Icon: IcoFlame,
                },
              ].map((s, i) => (
                <div key={s.label} className="stat-card" style={{ animationDelay:`${i*0.07}s` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                    <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.4)', fontWeight:600, letterSpacing:'.02em' }}>{s.label}</div>
                    <div style={{ width:34, height:34, borderRadius:10, background:`${s.color}18`, border:`1px solid ${s.color}35`, display:'flex', alignItems:'center', justifyContent:'center', color:s.color }}>
                      <s.Icon />
                    </div>
                  </div>
                  <div style={{ fontSize:30, fontWeight:900, color:'#fff', letterSpacing:'-.03em', marginBottom:4, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Chart + Services */}
            <div className="dash-grid-main-320" style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20, marginBottom:20 }}>
              {/* Activity chart */}
              <div className="glass-card" style={{ padding:28 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15.5 }}>Активность</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>За последние 7 дней</div>
                  </div>
                  <div style={{ fontSize:11, color:'rgba(59,130,246,0.8)', background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', padding:'4px 10px', borderRadius:8, fontWeight:600 }}>
                    Мин / день
                  </div>
                </div>
                {loadingStats ? (
                  <div style={{ height:140, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.2)', fontSize:13 }}>Загрузка...</div>
                ) : (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:140 }}>
                    {(stats?.chart || Array(7).fill({ label:'', minutes:0 })).map((day, i) => {
                      const pct = chartMax > 0 ? (day.minutes / chartMax) : 0
                      const h = Math.max(pct * 100, day.minutes > 0 ? 6 : 3)
                      return (
                        <div key={i} className="bar-col">
                          <div style={{ width:'100%', height:120, display:'flex', alignItems:'flex-end' }}>
                            <div
                              className="bar-fill"
                              title={`${day.minutes} мин`}
                              style={{
                                height:`${h}%`,
                                background: day.minutes > 0
                                  ? 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)'
                                  : 'rgba(255,255,255,0.05)',
                                minHeight: 3,
                                boxShadow: day.minutes > 0 ? '0 0 12px rgba(59,130,246,0.3)' : 'none',
                              }}
                            />
                          </div>
                          <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.3)', textTransform:'capitalize', fontWeight:600 }}>{day.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Services */}
              <div className="glass-card" style={{ padding:28 }}>
                <div style={{ fontWeight:800, fontSize:15.5, marginBottom:6 }}>Мессенджеры</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginBottom:20 }}>Топ по времени</div>
                {loadingStats ? (
                  <div style={{ color:'rgba(255,255,255,0.25)', fontSize:13 }}>Загрузка...</div>
                ) : !stats?.services.length ? (
                  <div style={{ color:'rgba(255,255,255,0.25)', fontSize:13, lineHeight:1.7 }}>
                    Статистика появится после установки приложения
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {stats.services.slice(0, 5).map(s => {
                      const maxMin = stats.services[0]?.minutes || 1
                      const pct = (s.minutes / maxMin) * 100
                      return (
                        <div key={s.name}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                            <span style={{ fontSize:13, fontWeight:600, textTransform:'capitalize', color:'rgba(255,255,255,0.8)' }}>{s.name}</span>
                            <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)' }}>{fmtTime(s.minutes * 60)}</span>
                          </div>
                          <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3 }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#3b82f6,#60a5fa)', borderRadius:3, boxShadow:'0 0 8px rgba(59,130,246,0.4)', transition:'width .6s' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Summary strip */}
            <div className="dash-summary-strip" style={{ ...glassBlue, padding:'22px 28px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 }}>
              {[
                { label:'Всего в приложении', value: fmtTime(stats?.total.appTime || 0), Icon: IcoTime },
                { label:'Всего уведомлений',  value: (stats?.total.notifCount || 0).toLocaleString(), Icon: IcoBell },
                { label:'Всего сообщений',    value: ((stats?.total.msgSent||0)+(stats?.total.msgReceived||0)).toLocaleString(), Icon: IcoMsg },
                { label:'Дней активности',    value: `${stats?.streak || 0}`, Icon: IcoFlame },
              ].map((s, i) => (
                <div key={s.label} style={{ paddingLeft: i > 0 ? 24 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none', marginLeft: i > 0 ? 24 : 0 }}>
                  <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.38)', marginBottom:6, display:'flex', alignItems:'center', gap:5, fontWeight:600 }}>
                    <s.Icon /> {s.label}
                  </div>
                  <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-.02em' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──────────── PROFILE ──────────── */}
        {tab === 'profile' && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>Профиль</h2>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>Личные данные и безопасность аккаунта</p>
            </div>

            <div className="dash-grid-320-1" style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20, alignItems:'start' }}>
              {/* Identity card */}
              <div className="glass-card" style={{ padding:'32px 26px', textAlign:'center' }}>
                <div style={{ position:'relative', width:92, margin:'0 auto' }}>
                  <div className="avatar-ring-lg">
                    <div className="avatar-ring-lg-inner">
                      {user.avatar ? <img src={user.avatar} alt="" className="avatar-img" /> : initial}
                    </div>
                  </div>
                  <label
                    htmlFor="avatarUploadInput"
                    className="avatar-edit-btn"
                    title="Изменить фото"
                    style={{ cursor: uploadingAvatar ? 'default' : 'pointer', opacity: uploadingAvatar ? 0.6 : 1 }}
                  >
                    <IcoCamera />
                  </label>
                  <input
                    id="avatarUploadInput"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    style={{ display:'none' }}
                  />
                </div>
                {avatarMsg && (
                  <div className={`form-msg ${avatarMsg.type}`} style={{ marginTop:10 }}>{avatarMsg.text}</div>
                )}
                <div style={{ fontSize:17, fontWeight:800, marginTop:18, letterSpacing:'-.01em' }}>
                  {user.name || user.email.split('@')[0]}
                </div>
                <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.4)', marginTop:3, wordBreak:'break-all' }}>
                  {user.email}
                </div>
                <span className="badge" style={{ background:`${planColor}22`, color:planColor, border:`1px solid ${planColor}44`, display:'inline-flex', alignItems:'center', gap:4, marginTop:12 }}>
                  {isPro && <IcoCrown />} {PLAN_LABELS[user.plan || 'FREE']}
                </span>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:24 }}>
                  <div className="mini-stat">
                    <div className="mini-stat-value">{loadingProfile ? '…' : (profileExtra?.counts?.messengers ?? '—')}</div>
                    <div className="mini-stat-label">Мессенджеров</div>
                  </div>
                  <div className="mini-stat">
                    <div className="mini-stat-value">{loadingProfile ? '…' : (profileExtra?.counts?.folders ?? '—')}</div>
                    <div className="mini-stat-label">Папок</div>
                  </div>
                </div>

                <div style={{ marginTop:18, fontSize:11.5, color:'rgba(255,255,255,0.3)' }}>
                  С нами с{' '}
                  {profileExtra?.createdAt
                    ? new Date(profileExtra.createdAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' })
                    : '—'}
                </div>
              </div>

              {/* Right column: edit forms */}
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                {/* Personal data */}
                <div className="glass-card" style={{ padding:'26px 28px' }}>
                  <div className="section-title"><IcoUser /> Личные данные</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div>
                      <label className="field-label">Имя</label>
                      <input
                        className="field-input"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        placeholder="Ваше имя"
                        maxLength={80}
                      />
                    </div>
                    <div>
                      <label className="field-label">Email</label>
                      <input className="field-input" value={user.email} disabled />
                      {!user.emailVerified && !user.hasOAuth && (
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10, flexWrap:'wrap' }}>
                          <span className="badge" style={{ background:'rgba(245,158,11,0.12)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.3)' }}>
                            Email не подтверждён
                          </span>
                          <button
                            className="btn-ghost"
                            onClick={handleSendVerification}
                            disabled={sendingVerify}
                            style={{ fontSize:12.5, padding:'6px 14px' }}
                          >
                            {sendingVerify ? 'Отправляем…' : 'Отправить письмо'}
                          </button>
                        </div>
                      )}
                      {verifyMsg && (
                        <div className={`form-msg ${verifyMsg.type}`} style={{ marginTop:8 }}>{verifyMsg.text}</div>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <button
                        className="btn-primary"
                        onClick={handleSaveProfile}
                        disabled={savingProfile || !nameDraft.trim() || nameDraft.trim() === (user.name || '')}
                      >
                        {savingProfile ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                      {profileMsg && (
                        <span className={`form-msg ${profileMsg.type}`}>{profileMsg.text}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Security */}
                <div className="glass-card" style={{ padding:'26px 28px' }}>
                  <div className="section-title"><IcoLock /> Безопасность</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div>
                      <label className="field-label">Текущий пароль</label>
                      <input
                        className="field-input"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>
                    <div style={{ display:'flex', gap:14 }}>
                      <div style={{ flex:1 }}>
                        <label className="field-label">Новый пароль</label>
                        <input
                          className="field-input"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Минимум 8 символов"
                          autoComplete="new-password"
                        />
                      </div>
                      <div style={{ flex:1 }}>
                        <label className="field-label">Повторите пароль</label>
                        <input
                          className="field-input"
                          type="password"
                          value={newPassword2}
                          onChange={(e) => setNewPassword2(e.target.value)}
                          placeholder="Ещё раз"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.3)', lineHeight:1.5 }}>
                      Если вы вошли через Google или Яндекс и пароль ещё не задан — поле «Текущий пароль» можно оставить пустым.
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <button className="btn-primary" onClick={handleChangePassword} disabled={savingPassword}>
                        {savingPassword ? 'Обновляем…' : 'Изменить пароль'}
                      </button>
                      {passwordMsg && (
                        <span className={`form-msg ${passwordMsg.type}`}>{passwordMsg.text}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ color:'rgba(59,130,246,0.6)', flexShrink:0 }}><IcoShield /></div>
                  <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.35)', lineHeight:1.65 }}>
                    Используйте надёжный уникальный пароль и не сообщайте его никому — служба поддержки Centrio никогда его не спрашивает.
                  </div>
                </div>

                {/* Danger zone */}
                <div className="glass-card" style={{ padding:'26px 28px', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.03)' }}>
                  <div className="section-title" style={{ color:'#f87171' }}><IcoTrash /> Опасная зона</div>
                  <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.4)', lineHeight:1.6, marginBottom:16 }}>
                    Удаление аккаунта необратимо. Все ваши мессенджеры, папки и активные сессии удаляются немедленно, персональные данные обезличиваются. История платежей сохраняется — этого требует законодательство о хранении финансовых документов.
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ borderColor:'rgba(239,68,68,0.35)', color:'#f87171' }}
                    onClick={() => { setShowDeleteModal(true); setDeleteMsg(null); setDeletePassword(''); setDeleteConfirmText('') }}
                  >
                    <IcoTrash /> Удалить аккаунт
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──────────── DEVICES ──────────── */}
        {tab === 'devices' && (
          <div>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
              <div>
                <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>Устройства</h2>
                <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>
                  {isPro ? 'Все активные сессии вашего аккаунта' : 'Free план — 1 активное устройство'}
                </p>
              </div>
              <button
                className="btn-danger"
                onClick={handleLogoutAll}
                disabled={loggingOutAll}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                {loggingOutAll ? 'Выходим...' : 'Выйти на всех устройствах'}
              </button>
            </div>

            {!isPro && devices.length > 0 && (
              <div style={{ background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0, color:'#fbbf24' }}><path d="M10.29 3.86L1.82 18A2 2 0 0 0 3.53 21H20.47A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                <span style={{ fontSize:13, color:'rgba(255,255,255,0.65)' }}>
                  На плане Free — только 1 устройство.{' '}
                  <button onClick={() => setTab('subscription')} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:13, padding:0, textDecoration:'underline', fontFamily:'inherit' }}>
                    Перейти на Pro
                  </button>
                </span>
              </div>
            )}

            {loadingDevices ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, color:'rgba(255,255,255,0.3)', padding:'40px 0' }}>
                <div style={{ width:22, height:22, border:'2px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
                Загружаем сессии...
              </div>
            ) : devices.length === 0 ? (
              <div style={{ textAlign:'center', padding:'70px 0', color:'rgba(255,255,255,0.25)' }}>
                <div style={{ width:60, height:60, borderRadius:18, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'rgba(255,255,255,0.2)' }}>
                  <IcoDevices />
                </div>
                <div style={{ fontSize:16, fontWeight:700, marginBottom:6, color:'rgba(255,255,255,0.5)' }}>Нет активных сессий</div>
                <div style={{ fontSize:13 }}>Войдите в Centrio на устройстве и оно появится здесь</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {devices.map((device, idx) => (
                  <div key={device.id} className="device-row">
                    <div style={{ width:42, height:42, borderRadius:12, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color:'#60a5fa' }}><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontWeight:700, fontSize:14.5 }}>{device.label}</span>
                        {idx === 0 && (
                          <span className="badge" style={{ background:'rgba(59,130,246,0.15)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.3)' }}>
                            Текущая
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>
                        IP: {device.ipAddress} &nbsp;·&nbsp; Вход: {new Date(device.createdAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' })}
                      </div>
                    </div>
                    {idx !== 0 && (
                      <button className="btn-danger" onClick={() => handleRevoke(device.id)} disabled={revokingId === device.id} style={{ fontSize:12.5, padding:'7px 14px' }}>
                        {revokingId === device.id ? '...' : 'Отключить'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop:28, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ color:'rgba(59,130,246,0.6)', flexShrink:0 }}><IcoShield /></div>
              <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.35)', lineHeight:1.65 }}>
                Если видите незнакомое устройство — немедленно отключите его и смените пароль.
                Сессии автоматически истекают через 30 дней.
              </div>
            </div>

            {/* ──────────── LOGIN HISTORY ────────────
                Distinct from the active-sessions list above: this survives
                logout/expiry, so it's the only place to spot "someone logged
                in from an unfamiliar IP" after that session already ended. */}
            <div style={{ marginTop:36 }}>
              <h3 style={{ fontSize:16, fontWeight:800, letterSpacing:'-.02em', marginBottom:4 }}>История входов</h3>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13, marginBottom:16 }}>
                Последние успешные входы в аккаунт, включая уже завершившиеся сессии
              </p>

              {loadingHistory ? (
                <div style={{ display:'flex', alignItems:'center', gap:12, color:'rgba(255,255,255,0.3)', padding:'24px 0' }}>
                  <div style={{ width:20, height:20, border:'2px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
                  Загружаем историю...
                </div>
              ) : loginHistory.length === 0 ? (
                <div style={{ color:'rgba(255,255,255,0.25)', fontSize:13, padding:'16px 0' }}>Пока нет записей</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {loginHistory.map(ev => (
                    <div key={ev.id} className="device-row" style={{ padding:'12px 16px' }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:15 }}>
                        {ev.icon}
                      </div>
                      <div style={{ flex:1, overflow:'hidden' }}>
                        <div style={{ fontWeight:700, fontSize:13.5 }}>
                          {ev.providerLabel} · {ev.os}
                        </div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>
                          IP: {ev.ipAddress} &nbsp;·&nbsp; {new Date(ev.createdAt).toLocaleString('ru-RU', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────── SUBSCRIPTION ──────────── */}
        {tab === 'subscription' && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>Подписка</h2>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>Управляйте тарифным планом</p>
            </div>

            {/* Current plan */}
            <div style={{ ...glassBlue, padding:'26px 30px', marginBottom:28, display:'flex', alignItems:'center', gap:20, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-60, right:-40, width:200, height:200, borderRadius:'50%', background:`radial-gradient(circle, ${planColor}30 0%, transparent 70%)`, pointerEvents:'none' }} />
              <div style={{ width:54, height:54, borderRadius:16, background:`${planColor}20`, border:`1px solid ${planColor}45`, display:'flex', alignItems:'center', justifyContent:'center', color:planColor, flexShrink:0, boxShadow:`0 6px 20px ${planColor}30`, zIndex:1 }}>
                <IcoSubscription />
              </div>
              <div style={{ flex:1, zIndex:1 }}>
                <div style={{ fontSize:17, fontWeight:800, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
                  Текущий план:&nbsp;<span style={{ color:planColor }}>{PLAN_LABELS[user.plan || 'FREE']}</span>
                  {isPro && <IcoCrown />}
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.42)' }}>
                  {isPro
                    ? (user.planExpiresAt
                        ? `Активен до ${new Date(user.planExpiresAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' })}`
                        : 'Полный доступ ко всем функциям Centrio')
                    : 'Базовый доступ · до 5 мессенджеров'}
                </div>
              </div>
              <button className="btn-primary" onClick={() => setShowPaymentMethodModal('month')} disabled={buyingPlan !== null} style={{ zIndex:1 }}>
                {buyingPlan === 'month' ? 'Загрузка…' : isPro ? <>Продлить подписку <IcoArrow /></> : <>Купить Pro <IcoArrow /></>}
              </button>
            </div>

            {/* Auto-renew toggle (only for PRO users) */}
            {isPro && (
              <div className="glass-card" style={{ padding:'18px 24px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:3, display:'flex', alignItems:'center', gap:8 }}>
                    Автопродление
                    {autoRenew && <span style={{ fontSize:10, background:'rgba(34,197,94,0.15)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'1px 8px' }}>Включено</span>}
                  </div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.38)', lineHeight:1.5 }}>
                    {hasMethod
                      ? (autoRenew ? 'Подписка продлится автоматически за 3 дня до истечения. Карта привязана.' : 'Сохранённый метод оплаты есть — можно включить')
                      : 'Оплатите подписку через ЮКассу, чтобы активировать автопродление'}
                  </div>
                </div>
                {hasMethod ? (
                  // Disabling auto-renew always deletes the saved card token
                  // server-side (see PATCH /api/payments/auto-renew) — this
                  // is the one-click "отвязать карту" action, labeled
                  // explicitly so it's unambiguous, not just an on/off toggle.
                  <button onClick={toggleAutoRenew} disabled={togglingAR}
                    style={{ background: autoRenew ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${autoRenew ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius:10, padding:'9px 20px', color: autoRenew ? '#ef4444' : '#22c55e', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity: togglingAR ? 0.6 : 1, transition:'all 0.2s' }}>
                    {togglingAR ? '...' : autoRenew ? 'Отвязать карту' : 'Включить'}
                  </button>
                ) : (
                  // ЮKassa не даёт "просто сохранить карту" без реального
                  // платежа — привязка происходит как побочный эффект
                  // обычной оплаты через save_payment_method (см.
                  // /api/payments/create, main branch). Раньше тут открывалась
                  // фейковая модалка с полями номера карты/CVC — макет для
                  // скриншотов в заявку на одобрение рекуррентных платежей
                  // ЮKassa, никогда не подключённый к реальному эндпоинту (и
                  // хорошо — вводить номер карты в собственной форме вместо
                  // хостинга ЮKassa нарушало бы PCI DSS). Теперь, когда
                  // рекуррент одобрен, кнопка ведёт на настоящий платёж через
                  // тот же безопасный редирект на ЮKassa, что и обычная
                  // покупка/продление — карта сохранится автоматически.
                  // Card binding only works with method='bank_card' (YooKassa's
                  // save_payment_method is card-only) — this button skips the
                  // general method selector and goes straight to a card payment.
                  <button onClick={() => handleBuyPlan('month', 'bank_card')} disabled={buyingPlan !== null}
                    style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:10, padding:'9px 20px', color:'#60a5fa', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s', opacity: buyingPlan !== null ? 0.6 : 1 }}>
                    {buyingPlan === 'month' ? 'Загрузка…' : 'Привязать карту'}
                  </button>
                )}
              </div>
            )}

            {/* Promo code redemption */}
            <div className="glass-card" style={{ padding:'18px 24px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:800, marginBottom:3 }}>Промокод</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.38)', lineHeight:1.5, marginBottom:14 }}>
                Есть промокод? Активируйте его, чтобы получить Pro бесплатно
              </div>
              <form onSubmit={redeemPromoCode} style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <input
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Например, CENTRIO2026"
                  disabled={redeemingPromo}
                  style={{ flex:'1 1 220px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', color:'#fff', fontSize:13, outline:'none', fontFamily:'inherit' }}
                />
                <button type="submit" className="btn-primary" disabled={redeemingPromo || !promoCode.trim()}>
                  {redeemingPromo ? 'Активация…' : 'Применить'}
                </button>
              </form>
              {promoMsg && (
                <div style={{ marginTop:10, fontSize:12.5, color: promoMsg.type === 'ok' ? '#22c55e' : '#ef4444' }}>
                  {promoMsg.text}
                </div>
              )}
              <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:10, fontSize:12.5, color:'rgba(255,255,255,0.4)' }}>
                <IcoGift />
                Pro можно получить и бесплатно — приглашайте друзей на вкладке{' '}
                <button onClick={() => setTab('referral')} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:12.5, padding:0, textDecoration:'underline', fontFamily:'inherit' }}>
                  «Приглашай друзей»
                </button>
              </div>
            </div>

            {/* Plan cards */}
            <div className="dash-plan-cards" style={{ display:'flex', gap:16, marginBottom:32 }}>
              {/* Free */}
              <div className={`plan-card${!isPro ? ' current-plan' : ''}`}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Free</div>
                  <div style={{ fontSize:30, fontWeight:900, letterSpacing:'-.03em' }}>0 <span style={{ fontSize:16, fontWeight:400, color:'rgba(255,255,255,0.35)' }}>₽/мес</span></div>
                  {!isPro && <span className="badge" style={{ background:'rgba(100,116,139,0.2)', color:'#94a3b8', border:'1px solid rgba(100,116,139,0.3)', marginTop:8, display:'inline-block' }}>Текущий</span>}
                </div>
                <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:16, display:'flex', flexDirection:'column', gap:9 }}>
                  {['1 устройство', 'До 3 мессенджеров', 'Базовая синхронизация', 'Статистика'].map(f => (
                    <div key={f} style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'rgba(255,255,255,0.55)' }}>
                      <IcoCheck color="#64748b" /> {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro — Месяц */}
              <div className={`plan-card pro${isPro && !isTeam ? ' current-plan' : ''}`}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Pro · Месяц</div>
                  <div style={{ fontSize:30, fontWeight:900, letterSpacing:'-.03em', color:'#fff' }}>199 <span style={{ fontSize:16, fontWeight:400, color:'rgba(255,255,255,0.35)' }}>₽/мес</span></div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.28)', marginTop:4 }}>Оплата каждый месяц</div>
                  {isPro && !isTeam && <span className="badge" style={{ background:'rgba(59,130,246,0.2)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.35)', marginTop:8, display:'inline-block' }}>Текущий</span>}
                </div>
                <div style={{ borderTop:'1px solid rgba(59,130,246,0.15)', paddingTop:16, display:'flex', flexDirection:'column', gap:9 }}>
                  {['До 5 устройств', 'Неограниченно мессенджеров', 'Облачная синхронизация', 'Расширенная статистика', 'Приоритетная поддержка'].map(f => (
                    <div key={f} style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                      <IcoCheck color="#3b82f6" /> {f}
                    </div>
                  ))}
                </div>
                <button className="btn-primary" onClick={() => setShowPaymentMethodModal('month')} disabled={buyingPlan !== null}
                  style={{ marginTop:'auto', fontSize:13, padding:'11px 16px' }}>
                  {buyingPlan === 'month' ? '...' : isPro ? <>Продлить <IcoArrow /></> : <>Купить <IcoArrow /></>}
                </button>
              </div>

              {/* Pro — Год */}
              <div className={`plan-card pro${isPro && !isTeam ? ' current-plan' : ''}`}>
                <div className="plan-ribbon">Выгоднее</div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'.08em' }}>Pro · Год</div>
                    <span style={{ fontSize:10, fontWeight:700, background:'rgba(34,197,94,0.15)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, padding:'1px 7px' }}>−34%</span>
                  </div>
                  <div style={{ fontSize:30, fontWeight:900, letterSpacing:'-.03em', color:'#fff' }}>1 590 <span style={{ fontSize:16, fontWeight:400, color:'rgba(255,255,255,0.35)' }}>₽/год</span></div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.28)', marginTop:4 }}>≈ 132,5 ₽/мес при оплате раз в год</div>
                  {isPro && !isTeam && <span className="badge" style={{ background:'rgba(59,130,246,0.2)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.35)', marginTop:8, display:'inline-block' }}>Текущий</span>}
                </div>
                <div style={{ borderTop:'1px solid rgba(59,130,246,0.15)', paddingTop:16, display:'flex', flexDirection:'column', gap:9 }}>
                  {['До 5 устройств', 'Неограниченно мессенджеров', 'Облачная синхронизация', 'Расширенная статистика', 'Приоритетная поддержка'].map(f => (
                    <div key={f} style={{ display:'flex', alignItems:'center', gap:9, fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                      <IcoCheck color="#3b82f6" /> {f}
                    </div>
                  ))}
                </div>
                <button className="btn-primary" onClick={() => setShowPaymentMethodModal('year')} disabled={buyingPlan !== null}
                  style={{ marginTop:'auto', fontSize:13, padding:'11px 16px', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', boxShadow:'0 4px 16px rgba(37,99,235,0.3)' }}>
                  {buyingPlan === 'year' ? '...' : isPro ? <>Продлить <IcoArrow /></> : <>Купить <IcoArrow /></>}
                </button>
              </div>
            </div>

            {/* Payment info */}
            <div className="glass-card" style={{ padding:'22px 26px', marginBottom:20 }}>
              <div className="section-title"><IcoCard /> Способы оплаты</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {[
                  { label:'ЮKassa', sub:'Карты РФ, СБП, ЮMoney', active:true },
                  { label:'Криптовалюта', sub:'BTC, ETH, USDT', active:true },
                  { label:'Карты EU/US', sub:'Visa, Mastercard', active:true },
                ].map(m => (
                  <div key={m.label} style={{ background: m.active ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.04)', border: m.active ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'12px 18px' }}>
                    <div style={{ fontSize:13.5, fontWeight:700, marginBottom:2 }}>{m.label}</div>
                    <div style={{ fontSize:11.5, color: m.active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)' }}>{m.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:14, fontSize:12, color:'rgba(255,255,255,0.22)', lineHeight:1.6 }}>
                Платежи защищены · ЮKassa · ИП Козловский А.С. · ИНН: 501908743800
              </div>
            </div>

            {/* Payment history */}
            <div className="glass-card" style={{ padding:'22px 26px' }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:16 }}>История платежей</div>
              {loadingPayments ? (
                <div style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>Загрузка…</div>
              ) : payments.length === 0 ? (
                <div style={{ color:'rgba(255,255,255,0.25)', fontSize:13 }}>Платежей пока нет</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {payments.map((p: any) => {
                    const STATUS: Record<string, { label:string; color:string }> = {
                      SUCCEEDED: { label:'Оплачен', color:'#22c55e' },
                      PENDING:   { label:'Обрабатывается', color:'#f59e0b' },
                      FAILED:    { label:'Ошибка', color:'#ef4444' },
                      CANCELLED: { label:'Отменён', color:'#6b7280' },
                    }
                    const s = STATUS[p.status] || { label: p.status, color:'#6b7280' }
                    const months = p.months === 12 ? '12 мес (год)' : `${p.months} мес`
                    const title = p.provider === 'referral'
                      ? `Реферальный бонус · +${REFERRAL_BONUS_DAYS} дней`
                      : `Centrio Pro · ${months}`
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:14, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 16px' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13.5, fontWeight:700 }}>{title}</div>
                          <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>
                            {new Date(p.createdAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' })}
                          </div>
                          {/* YooKassa is passed a `receipt` object (customer.email +
                              itemized amount, see POST /api/payments/create) on every
                              charge — it fiscalizes and emails the 54-FZ receipt itself,
                              automatically, with no separate "fetch/download" step or
                              stored URL on our side. This note just makes that existing,
                              already-happening behavior visible to the user. Other
                              providers (fride, nowpayments/crypto) don't get this note —
                              no receipt object is sent for those charges. */}
                          {p.provider === 'yookassa' && p.status === 'SUCCEEDED' && (
                            <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)', marginTop:3 }}>
                              Чек отправлен на {user.email}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize:14, fontWeight:800 }}>{p.amount} ₽</div>
                        <div style={{ fontSize:12, fontWeight:700, color: s.color, background: `${s.color}18`, border:`1px solid ${s.color}40`, borderRadius:8, padding:'4px 10px' }}>{s.label}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────── REFERRAL ──────────── */}
        {tab === 'referral' && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>Приглашай друзей</h2>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>Получайте Pro бесплатно за каждого друга, который оплатит подписку</p>
            </div>

            {/* Reward hero */}
            <div style={{ ...glassBlue, padding:'26px 30px', marginBottom:24, display:'flex', alignItems:'center', gap:20, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-60, right:-40, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, #3b82f630 0%, transparent 70%)', pointerEvents:'none' }} />
              <div style={{ width:54, height:54, borderRadius:16, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.35)', display:'flex', alignItems:'center', justifyContent:'center', color:'#60a5fa', flexShrink:0, boxShadow:'0 6px 20px rgba(59,130,246,0.25)', zIndex:1 }}>
                <IcoGift />
              </div>
              <div style={{ flex:1, zIndex:1 }}>
                <div style={{ fontSize:17, fontWeight:800, marginBottom:4 }}>
                  +{referralInfo ? referralInfo.bonusDays : 14} дней Pro — вам и другу
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.42)' }}>
                  Как только приглашённый друг впервые оплатит подписку Centrio Pro, вы оба автоматически получите бонусные дни
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="glass-card" style={{ padding:'20px 24px', marginBottom:20 }}>
              <div className="section-title" style={{ marginBottom:16 }}>Как это работает</div>
              <div className="dash-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                {[
                  { n: '1', title: 'Поделитесь ссылкой', text: 'Отправьте свою реферальную ссылку другу — в мессенджере, почте или соцсетях' },
                  { n: '2', title: 'Друг регистрируется', text: 'Он переходит по ссылке и создаёт аккаунт Centrio — это бесплатно и ни к чему не обязывает' },
                  { n: '3', title: 'Друг оплачивает Pro', text: `При первой оплате подписки вы оба получаете +${referralInfo ? referralInfo.bonusDays : 14} дней Pro бесплатно` },
                ].map(step => (
                  <div key={step.n} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ width:28, height:28, borderRadius:9, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#60a5fa', fontSize:13, fontWeight:800, marginBottom:10 }}>
                      {step.n}
                    </div>
                    <div style={{ fontSize:13.5, fontWeight:700, marginBottom:4 }}>{step.title}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>{step.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referral link */}
            <div className="glass-card" style={{ padding:'20px 24px', marginBottom:20 }}>
              <div className="section-title" style={{ marginBottom:3 }}><IcoGift /> Ваша реферальная ссылка</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.38)', lineHeight:1.5, marginBottom:14 }}>
                Приглашать можно неограниченное количество друзей — бонус начисляется за каждого
              </div>
              {loadingReferral ? (
                <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.3)' }}>Загрузка…</div>
              ) : referralInfo ? (
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <input
                    readOnly
                    value={referralLink}
                    onFocus={e => e.currentTarget.select()}
                    style={{ flex:'1 1 260px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', color:'rgba(255,255,255,0.8)', fontSize:12.5, outline:'none', fontFamily:'inherit' }}
                  />
                  <button type="button" className="btn-primary" onClick={copyReferralLink} style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
                    <IcoCopy /> {referralCopied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.3)' }}>Не удалось загрузить реферальную ссылку</div>
              )}
            </div>

            {/* Stats */}
            <div className="dash-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
              {[
                { label: 'Приглашено',              value: referralInfo?.totalReferred ?? 0,   color: '#3b82f6', Icon: IcoUser },
                { label: 'Оплатили (бонус начислен)', value: referralInfo?.bonusesGranted ?? 0,  color: '#22c55e', Icon: IcoCheck },
                { label: 'Ждут первой оплаты',        value: referralInfo?.pending ?? 0,         color: '#94a3b8', Icon: IcoTime },
              ].map(s => (
                <div key={s.label} className="glass-card" style={{ padding:'18px 20px' }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:`${s.color}18`, border:`1px solid ${s.color}35`, display:'flex', alignItems:'center', justifyContent:'center', color:s.color, marginBottom:12 }}>
                    <s.Icon />
                  </div>
                  <div style={{ fontSize:24, fontWeight:900, letterSpacing:'-.02em' }}>{loadingReferral ? '...' : s.value}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Terms */}
            <div className="glass-card" style={{ padding:'18px 24px' }}>
              <div className="section-title" style={{ marginBottom:14 }}>Условия программы</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  'Бонус начисляется только после первой реальной оплаты друга — регистрации по ссылке недостаточно',
                  'Друг должен зарегистрироваться именно по вашей персональной ссылке',
                  `Бонусные ${referralInfo ? referralInfo.bonusDays : 14} дней Pro добавляются автоматически обеим сторонам — никаких дополнительных действий не требуется`,
                  'Активация промокода другом не засчитывается как оплата — бонус даёт только реальный платёж',
                  'Ограничения на количество приглашённых друзей нет',
                ].map(text => (
                  <div key={text} style={{ display:'flex', alignItems:'flex-start', gap:9, fontSize:13, color:'rgba(255,255,255,0.55)', lineHeight:1.5 }}>
                    <IcoCheck color="#3b82f6" /> {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ──────────── SUPPORT TICKETS ──────────── */}
        {tab === 'support' && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:'-.03em', marginBottom:6 }}>Поддержка</h2>
              <p style={{ color:'rgba(255,255,255,0.38)', fontSize:13.5 }}>
                Обращения и переписка с поддержкой Centrio
              </p>
            </div>

            {activeTicket ? (
              <div className="glass-card" style={{ padding:'26px 28px' }}>
                <button
                  onClick={closeTicketThread}
                  style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:12.5, padding:0, marginBottom:18, display:'inline-flex', alignItems:'center', gap:6, fontFamily:'inherit' }}
                >
                  ← Назад к списку
                </button>

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                  <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-.02em' }}>{activeTicket.subject}</div>
                  <span
                    className="badge"
                    style={{
                      background: `${TICKET_STATUS_COLOR[activeTicket.status]}18`,
                      color: TICKET_STATUS_COLOR[activeTicket.status],
                      border: `1px solid ${TICKET_STATUS_COLOR[activeTicket.status]}40`
                    }}
                  >
                    {TICKET_STATUS_LABEL[activeTicket.status] || activeTicket.status}
                  </span>
                </div>

                {loadingTicketThread ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, color:'rgba(255,255,255,0.3)', padding:'24px 0' }}>
                    <div style={{ width:20, height:20, border:'2px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
                    Загружаем переписку...
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:22 }}>
                    {(activeTicket.messages || []).map((m: any) => (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: m.isAdmin ? 'flex-start' : 'flex-end',
                          maxWidth:'78%',
                          background: m.isAdmin ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.12)',
                          border: `1px solid ${m.isAdmin ? 'rgba(255,255,255,0.09)' : 'rgba(59,130,246,0.25)'}`,
                          borderRadius:14,
                          padding:'12px 16px'
                        }}
                      >
                        <div style={{ fontSize:11, fontWeight:700, color: m.isAdmin ? '#60a5fa' : 'rgba(255,255,255,0.4)', marginBottom:5 }}>
                          {m.isAdmin ? 'Поддержка Centrio' : 'Вы'}
                        </div>
                        <div style={{ fontSize:13.5, lineHeight:1.55, whiteSpace:'pre-wrap' }}>{m.body}</div>
                        <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.25)', marginTop:6 }}>
                          {new Date(m.createdAt).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={sendTicketReply} style={{ display:'flex', gap:10, borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:18 }}>
                  <textarea
                    className="field-input"
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder="Написать сообщение..."
                    rows={2}
                    style={{ flex:1, resize:'vertical', minHeight:44 }}
                  />
                  <button type="submit" className="btn-primary" disabled={sendingReply || !replyBody.trim()} style={{ alignSelf:'flex-end', display:'inline-flex', alignItems:'center', gap:7 }}>
                    <IcoSend /> {sendingReply ? 'Отправка...' : 'Отправить'}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div className="glass-card" style={{ padding:'22px 26px', marginBottom:24 }}>
                  <div className="section-title" style={{ marginBottom:14 }}><IcoSupport /> Новое обращение</div>
                  <form onSubmit={createTicket} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <div>
                      <label className="field-label">Тема</label>
                      <input
                        className="field-input"
                        value={newTicketSubject}
                        onChange={e => setNewTicketSubject(e.target.value)}
                        placeholder="Коротко опишите проблему"
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <label className="field-label">Сообщение</label>
                      <textarea
                        className="field-input"
                        value={newTicketBody}
                        onChange={e => setNewTicketBody(e.target.value)}
                        placeholder="Опишите вопрос подробнее..."
                        rows={4}
                        maxLength={5000}
                        style={{ resize:'vertical' }}
                      />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <button type="submit" className="btn-primary" disabled={creatingTicket || !newTicketSubject.trim() || !newTicketBody.trim()}>
                        {creatingTicket ? 'Отправка...' : 'Отправить обращение'}
                      </button>
                      {ticketMsg && <span className={`form-msg ${ticketMsg.type}`}>{ticketMsg.text}</span>}
                    </div>
                  </form>
                </div>

                <div style={{ fontSize:14, fontWeight:800, marginBottom:14 }}>Мои обращения</div>
                {loadingTickets ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, color:'rgba(255,255,255,0.3)', padding:'24px 0' }}>
                    <div style={{ width:20, height:20, border:'2px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
                    Загружаем обращения...
                  </div>
                ) : tickets.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'50px 0', color:'rgba(255,255,255,0.25)' }}>
                    <div style={{ width:60, height:60, borderRadius:18, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'rgba(255,255,255,0.2)' }}>
                      <IcoSupport />
                    </div>
                    <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Обращений пока нет</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {tickets.map((t: any) => (
                      <div key={t.id} className="device-row" style={{ cursor:'pointer' }} onClick={() => openTicket(t.id)}>
                        <div style={{ width:42, height:42, borderRadius:12, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#60a5fa' }}>
                          <IcoSupport />
                        </div>
                        <div style={{ flex:1, overflow:'hidden' }}>
                          <div style={{ fontWeight:700, fontSize:14.5, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.subject}</div>
                          <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>
                            {t._count?.messages ?? 0} сообщ. &nbsp;·&nbsp; {new Date(t.updatedAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' })}
                          </div>
                        </div>
                        <span
                          className="badge"
                          style={{
                            background: `${TICKET_STATUS_COLOR[t.status]}18`,
                            color: TICKET_STATUS_COLOR[t.status],
                            border: `1px solid ${TICKET_STATUS_COLOR[t.status]}40`
                          }}
                        >
                          {TICKET_STATUS_LABEL[t.status] || t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Payment method selection — shown BEFORE redirecting to YooKassa, so
          the choice happens in our own UI instead of on YooKassa's page. */}
      {showPaymentMethodModal && (
        <div
          onClick={() => buyingPlan === null && setShowPaymentMethodModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(6,8,15,0.72)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{ width:'100%', maxWidth:420, padding:32, position:'relative', animation:'fadeIn .2s ease both' }}
          >
            <button
              onClick={() => buyingPlan === null && setShowPaymentMethodModal(null)}
              style={{ position:'absolute', top:18, right:18, width:30, height:30, borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.5)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, lineHeight:1 }}
            >
              ×
            </button>

            <div style={{ width:44, height:44, borderRadius:12, background:'rgba(59,130,246,0.12)', border:'1px solid rgba(59,130,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#60a5fa', marginBottom:16 }}>
              <IcoCard />
            </div>
            <div style={{ fontSize:19, fontWeight:800, letterSpacing:'-.02em', marginBottom:6 }}>Способ оплаты</div>
            <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.4)', lineHeight:1.5, marginBottom:22 }}>
              Выберите, как хотите оплатить {showPaymentMethodModal === 'year' ? 'годовую' : 'месячную'} подписку. Оплата проходит через защищённую страницу ЮKassa.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {PAYMENT_METHOD_OPTIONS.map(m => (
                <button
                  key={m.id}
                  onClick={() => selectPaymentMethod(m.id)}
                  disabled={buyingPlan !== null}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', textAlign:'left', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'14px 16px', cursor: buyingPlan !== null ? 'default' : 'pointer', fontFamily:'inherit', opacity: buyingPlan !== null ? 0.6 : 1, transition:'all 0.15s' }}
                  onMouseEnter={(e) => { if (buyingPlan === null) e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                >
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{m.label}</div>
                    <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)', marginTop:2 }}>{m.sub}</div>
                  </div>
                  <IcoArrow />
                </button>
              ))}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'18px 0' }}>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.08)' }} />
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>или</span>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.08)' }} />
            </div>

            <button
              onClick={() => showPaymentMethodModal && handleBuyCrypto(showPaymentMethodModal)}
              disabled={buyingPlan !== null}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', textAlign:'left', background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:12, padding:'14px 16px', cursor: buyingPlan !== null ? 'default' : 'pointer', fontFamily:'inherit', opacity: buyingPlan !== null ? 0.6 : 1, transition:'all 0.15s' }}
              onMouseEnter={(e) => { if (buyingPlan === null) e.currentTarget.style.borderColor = 'rgba(251,191,36,0.45)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(251,191,36,0.25)' }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Криптовалюта</div>
                <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)', marginTop:2 }}>BTC, ETH, USDT, TON и другие</div>
              </div>
              <IcoArrow />
            </button>

            <button
              onClick={() => showPaymentMethodModal && handleBuyFride(showPaymentMethodModal)}
              disabled={buyingPlan !== null}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', textAlign:'left', background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.25)', borderRadius:12, padding:'14px 16px', marginTop:10, cursor: buyingPlan !== null ? 'default' : 'pointer', fontFamily:'inherit', opacity: buyingPlan !== null ? 0.6 : 1, transition:'all 0.15s' }}
              onMouseEnter={(e) => { if (buyingPlan === null) e.currentTarget.style.borderColor = 'rgba(59,130,246,0.45)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)' }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Карты EU/US</div>
                <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Иностранные карты, Visa/Mastercard</div>
              </div>
              <IcoArrow />
            </button>

            {buyingPlan !== null && (
              <div style={{ marginTop:16, fontSize:12.5, color:'rgba(255,255,255,0.4)', textAlign:'center' }}>Переходим к оплате…</div>
            )}
          </div>
        </div>
      )}

      {/* Account deletion confirmation modal */}
      {showDeleteModal && (
        <div
          onClick={() => !deletingAccount && setShowDeleteModal(false)}
          style={{ position:'fixed', inset:0, background:'rgba(6,8,15,0.72)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{ width:'100%', maxWidth:420, padding:32, position:'relative', animation:'fadeIn .2s ease both', border:'1px solid rgba(239,68,68,0.3)' }}
          >
            <button
              onClick={() => !deletingAccount && setShowDeleteModal(false)}
              style={{ position:'absolute', top:18, right:18, width:30, height:30, borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.5)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, lineHeight:1 }}
            >
              ×
            </button>

            <div style={{ width:44, height:44, borderRadius:12, background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#f87171', marginBottom:16 }}>
              <IcoTrash />
            </div>
            <div style={{ fontSize:19, fontWeight:800, letterSpacing:'-.02em', marginBottom:6 }}>Удалить аккаунт?</div>
            <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.4)', lineHeight:1.5, marginBottom:24 }}>
              Это действие необратимо. Мессенджеры, папки и все сессии будут удалены немедленно, аккаунт больше нельзя будет восстановить.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="field-label">Пароль</label>
                <input
                  className="field-input"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Оставьте пустым, если вход через Google/Яндекс"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="field-label">Введите «УДАЛИТЬ» для подтверждения</label>
                <input
                  className="field-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="УДАЛИТЬ"
                />
              </div>
              {deleteMsg && (
                <span className={`form-msg ${deleteMsg.type}`}>{deleteMsg.text}</span>
              )}
            </div>

            <button
              className="btn-primary"
              style={{ width:'100%', justifyContent:'center', marginTop:22, background:'#dc2626' }}
              onClick={handleDeleteAccount}
              disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'УДАЛИТЬ'}
            >
              {deletingAccount ? 'Удаляем…' : 'Удалить аккаунт навсегда'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
