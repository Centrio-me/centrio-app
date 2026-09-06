'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { Suspense } from 'react'

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()

  useEffect(() => {
    // API redirects with ?accessToken=...&refreshToken=...
    const accessToken = searchParams.get('accessToken')
    const refreshToken = searchParams.get('refreshToken') || ''

    if (!accessToken) {
      router.push('/auth/login')
      return
    }

    const fetchUser = async () => {
      try {
        // Token is passed explicitly in the header below — no need to
        // pre-write it to localStorage before the store is populated.
        const { data } = await api.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        setAuth(data.user, accessToken, refreshToken)
        router.push('/dashboard')
      } catch {
        router.push('/auth/error')
      }
    }

    fetchUser()
  }, [searchParams, router, setAuth])

  return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', fontSize: 15 }}>Входим в аккаунт...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
