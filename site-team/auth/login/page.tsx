'use client'
import { AuthFrame, AuthHeading, AuthLoading, AuthProviders, AuthSubmit, PasswordToggle } from '@/components/auth/AuthFrame'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import TelegramLogin from '@/components/auth/TelegramLogin'

const LOGIN_STR = {
  ru: {
    email: 'Электронная почта или логин',
    forgotLogin: 'Пароль для входа по логину сбрасывает руководитель команды. Попросите его сбросить пароль в Centrio.',
    password: 'Пароль',
    forgotPassword: 'Забыли пароль?',
    passwordPlaceholder: 'Введите пароль',
    signingIn: 'Вход...', signIn: 'Войти',
    noAccount: 'Нет аккаунта? ', register: 'Зарегистрироваться',
    errLoginFailed: 'Ошибка входа',
  },
  en: {
    email: 'Email or login',
    forgotLogin: 'The password for a login is reset by your team manager. Ask them to reset it in Centrio.',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    passwordPlaceholder: 'Enter your password',
    signingIn: 'Signing in...', signIn: 'Sign in',
    noAccount: "Don't have an account? ", register: 'Sign up',
    errLoginFailed: 'Sign-in failed',
  },
} as const

export default function LoginPage() {
  const router = useRouter()
  const { lang } = useLang()
  const s = LOGIN_STR[lang === 'en' ? 'en' : 'ru']
  const { setAuth, user, _hasHydrated } = useAuthStore()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [telegram, setTelegram] = useState(false)
  // a team invitation sends the person here with the invited email and the token: the email is filled in, and after
  // signing in the invitation is taken up again (it accepts itself there)
  const [inviteToken, setInviteToken] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invitedEmail = params.get('email')
    if (invitedEmail) setEmail(invitedEmail)
    setInviteToken(params.get('invite') || '')
  }, [])
  const afterLogin = () => inviteToken
    ? `${lang === 'en' ? '/en/team/invite' : '/team/invite'}?token=${encodeURIComponent(inviteToken)}`
    : (lang === 'en' ? '/en/dashboard' : '/dashboard')

  useEffect(() => {
    if (_hasHydrated && user) router.replace(afterLogin())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, _hasHydrated, router, inviteToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      setAuth(data.user, data.accessToken, data.refreshToken)
      router.push(afterLogin())
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || s.errLoginFailed)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'https://api.centrio.me'}/api/auth/google` }
  const handleYandex = () => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'https://api.centrio.me'}/api/auth/yandex` }

  if (!_hasHydrated || (_hasHydrated && user)) {
    return <AuthLoading />
  }

  return (
    <AuthFrame mode="login">
      <AuthHeading mode="login" />
      <AuthProviders mode="login" onGoogle={handleGoogle} onYandex={handleYandex} onTelegram={() => setTelegram(true)} />
      {telegram && <TelegramLogin onClose={() => setTelegram(false)} />}
      <p className="ca-legal login-consent-note">{lang === 'en' ? 'If you sign in with Google or Yandex for the first time, an account is created and you consent to the processing of your personal data under the ' : 'Если вы входите через Google или Яндекс впервые, создаётся аккаунт, и вы даёте '}<Link href={lang === 'en' ? '/en/privacy' : '/consent'}>{lang === 'en' ? 'Privacy Policy' : 'согласие на обработку персональных данных'}</Link>{lang === 'en' ? '.' : '.'}</p>
      {error && <div className="ca-error" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="ca-form">
        <div className="ca-field">
          <label htmlFor="login-email">{s.email}</label>
          <input id="login-email" name="email" type="text" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" autoCapitalize="off" spellCheck={false} />
        </div>
        <div className="ca-field">
          <div className="ca-field-label-row">
            <label htmlFor="login-password">{s.password}</label>
            <Link href={lang === 'en' ? '/en/auth/forgot-password' : '/auth/forgot-password'} className="ca-forgot-link" onClick={e => { if (email.trim() && !email.includes('@')) { e.preventDefault(); setError(s.forgotLogin) } }}>{s.forgotPassword}</Link>
          </div>
          <div className="ca-password">
            <input id="login-password" name="password" type={showPass ? 'text' : 'password'} placeholder={s.passwordPlaceholder} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            <PasswordToggle shown={showPass} onClick={() => setShowPass(p => !p)} />
          </div>
        </div>
        <AuthSubmit loading={loading}>{loading ? s.signingIn : s.signIn}</AuthSubmit>
      </form>
      <p className="ca-switch">{s.noAccount}<Link href={lang === 'en' ? '/en/auth/register' : '/auth/register'}>{s.register}</Link></p>
    </AuthFrame>
  )
}
