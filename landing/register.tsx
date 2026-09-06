'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'

// useSearchParams() (used below to read the ?ref=<referrerUserId> referral
// link param) requires a Suspense boundary at build time — see the same
// pattern in dashboard-server.tsx (learned the hard way there: missing this
// breaks `next build` prerendering for the whole site). fallback is null
// since there's no meaningful loading state for the brief Suspense gap.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  )
}

function RegisterPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth, user, _hasHydrated } = useAuthStore()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Referral link is /auth/register?ref=<referrer's user id> (see
  // landing/lib/referral.js and the referralCode handling in POST
  // /api/auth/register). Invalid/missing values are silently ignored
  // server-side, so there's no need to validate here.
  // BUG HISTORY (2026-08-13): dashboard-server.tsx used to build this link
  // as bare `/register?ref=...` (missing the `/auth` prefix) — since this
  // page has only ever lived at /auth/register, every referral link ever
  // copied by a user 404'd. Fixed in dashboard-server.tsx; this file itself
  // was never wrong, just the link generator.
  const referralCode = searchParams.get('ref') || undefined

  useEffect(() => {
    if (_hasHydrated && user) router.replace('/dashboard')
  }, [user, _hasHydrated, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Пароль должен быть минимум 8 символов'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/register', { name, email, password, referralCode })
      setAuth(data.user, data.accessToken, data.refreshToken)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google` }
  const handleYandex = () => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/yandex` }

  if (!_hasHydrated || (_hasHydrated && user)) {
    return (
      <div style={{ minHeight:'100vh', background:'#060a14', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:38, height:38, border:'3px solid rgba(59,130,246,0.25)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const strengthScore = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3
  const strengthLabel = ['', 'Слабый', 'Средний', 'Надёжный'][strengthScore]
  const strengthColor = ['', '#ef4444', '#f59e0b', '#22c55e'][strengthScore]

  return (
    <>
      <style>{`
        :root { color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060a14; font-family: 'Inter', -apple-system, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }

        .auth-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 13px 16px;
          color: #fff;
          font-size: 14.5px;
          font-family: inherit;
          outline: none;
          transition: border-color .2s, background .2s;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.28); }
        .auth-input:focus { border-color: rgba(59,130,246,0.6); background: rgba(59,130,246,0.06); }

        .auth-btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #1d4ed8, #3b82f6);
          color: #fff; border: none; border-radius: 12px;
          padding: 14px; font-size: 15px; font-weight: 700;
          font-family: inherit; cursor: pointer;
          transition: all .2s;
          box-shadow: 0 4px 24px rgba(59,130,246,0.35);
          letter-spacing: -.01em;
        }
        .auth-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(59,130,246,0.45); }
        .auth-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .auth-oauth-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 12px;
          color: rgba(255,255,255,0.85); font-size: 14px; font-weight: 500;
          font-family: inherit; cursor: pointer;
          transition: all .18s; width: 100%;
        }
        .auth-oauth-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.18); }

        .pass-toggle {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: rgba(255,255,255,0.35);
          cursor: pointer; padding: 4px; transition: color .15s;
          display: flex; align-items: center;
        }
        .pass-toggle:hover { color: rgba(255,255,255,0.65); }
      `}</style>

      <div style={{ minHeight:'100vh', display:'flex', background:'#060a14', color:'#fff' }}>

        {/* ── Ambient glows ── */}
        <div style={{ position:'fixed', top:-180, left:'35%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(59,130,246,0.13) 0%,transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'fixed', bottom:-100, right:'10%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,0.07) 0%,transparent 70%)', pointerEvents:'none' }} />

        {/* ── Left branding panel ── */}
        <div style={{
          width: 420, flexShrink: 0, padding: '60px 48px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div>
            <Link href="/" style={{ display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none', marginBottom:56 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(59,130,246,0.4)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="white" opacity=".9"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="white" opacity=".9"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="white" opacity=".9"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="white" opacity=".9"/></svg>
              </div>
              <span style={{ fontWeight:800, fontSize:20, letterSpacing:'-.025em' }}>Centrio</span>
            </Link>

            <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-.035em', lineHeight:1.2, marginBottom:14 }}>
              Начните бесплатно.<br />Без ограничений.
            </h1>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.65, marginBottom:40 }}>
              Создайте аккаунт за 30 секунд и объедините все мессенджеры в одном месте.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                'До 3 мессенджеров бесплатно',
                'Облачная синхронизация настроек',
                'Уведомления из всех мессенджеров',
                'Работает на Windows, macOS, Linux',
              ].map((f, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:20, height:20, borderRadius:6, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize:13.5, color:'rgba(255,255,255,0.6)' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>
            © 2026 Centrio
          </p>
        </div>

        {/* ── Right form panel ── */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px', overflowY:'auto' }}>
          <div style={{ width:'100%', maxWidth:440, animation:'fadeUp .4s ease' }}>

            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:24, fontWeight:800, letterSpacing:'-.03em', marginBottom:6 }}>Создать аккаунт</h2>
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Это займёт меньше минуты</p>
            </div>

            {/* OAuth */}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
              <button className="auth-oauth-btn" onClick={handleGoogle}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Зарегистрироваться через Google
              </button>
              <button className="auth-oauth-btn" onClick={handleYandex} style={{ borderColor:'rgba(252,63,29,0.25)', background:'rgba(252,63,29,0.07)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FC3F1D"><path d="M2.04 12c0-5.523 4.476-10 9.999-10 5.522 0 9.999 4.477 9.999 10s-4.477 10-9.999 10c-5.523 0-10-4.477-10-10z"/><path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.548H7.49l2.695-4.079c-1.55-1.111-2.42-2.19-2.42-4.028 0-2.1 1.65-3.967 4.375-3.967h3.027v12.004H13.32V7.666z" fill="#fff"/></svg>
                Зарегистрироваться через Яндекс
              </button>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:22 }}>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.28)', whiteSpace:'nowrap' }}>или заполните форму</span>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }} />
            </div>

            {error && (
              <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#fca5a5', marginBottom:16, display:'flex', alignItems:'center', gap:9 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="9" stroke="#f87171" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:18 }}>
                <input className="auth-input" type="text" placeholder="Ваше имя" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
                <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                <div>
                  <div style={{ position:'relative' }}>
                    <input className="auth-input" type={showPass ? 'text' : 'password'} placeholder="Пароль (минимум 8 символов)" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" style={{ paddingRight:44 }} />
                    <button type="button" className="pass-toggle" onClick={() => setShowPass(p => !p)}>
                      {showPass
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                      }
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(strengthScore/3)*100}%`, background:strengthColor, borderRadius:2, transition:'width .3s, background .3s' }} />
                      </div>
                      <span style={{ fontSize:11, color:strengthColor, fontWeight:600, minWidth:56 }}>{strengthLabel}</span>
                    </div>
                  )}
                </div>
              </div>
              <button type="submit" disabled={loading} className="auth-btn-primary">
                {loading ? 'Создание аккаунта...' : 'Создать аккаунт'}
              </button>
            </form>

            <p style={{ textAlign:'center', marginTop:18, fontSize:14, color:'rgba(255,255,255,0.35)' }}>
              Уже есть аккаунт?{' '}
              <Link href="/auth/login" style={{ color:'#60a5fa', textDecoration:'none', fontWeight:600 }}>Войти</Link>
            </p>
            <p style={{ textAlign:'center', marginTop:12, fontSize:12, color:'rgba(255,255,255,0.18)', lineHeight:1.6 }}>
              Регистрируясь, вы соглашаетесь с{' '}
              <Link href="/terms" style={{ color:'rgba(255,255,255,0.35)', textDecoration:'none' }}>условиями</Link>
              {' '}и{' '}
              <Link href="/privacy" style={{ color:'rgba(255,255,255,0.35)', textDecoration:'none' }}>политикой конфиденциальности</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
