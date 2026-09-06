import axios from 'axios'
import { useAuthStore } from './authStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ── Token helpers ──────────────────────────────────────────────────────────
// SECURITY: single source of truth is the Zustand store (useAuthStore.getState()),
// not manual localStorage parsing. refreshToken is intentionally in-memory only
// (see authStore.ts partialize) — never duplicated into a plain localStorage key.

function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken
}

function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken
}

function clearStore() {
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
}

function updateStoreToken(newAccessToken: string) {
  useAuthStore.setState({ accessToken: newAccessToken })
}

// ── Axios instance ─────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Добавляем токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Refresh-lock: один refresh на всех ────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function enqueueRefresh(cb: (token: string) => void) {
  refreshQueue.push(cb)
}

function flushQueue(token: string) {
  refreshQueue.forEach(cb => cb(token))
  refreshQueue = []
}

function abortQueue() {
  refreshQueue = []
}

// Обновляем токен если истёк, не перезагружаем страницу бесконечно
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Если refresh уже идёт — ставим в очередь
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        enqueueRefresh((newToken: string) => {
          original.headers.Authorization = `Bearer ${newToken}`
          resolve(api(original))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) throw new Error('no_refresh_token')

      const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
      const newToken: string = data.accessToken

      // Обновляем только Zustand-стор (не прямые ключи)
      updateStoreToken(newToken)
      isRefreshing = false
      flushQueue(newToken)

      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch {
      isRefreshing = false
      abortQueue()

      // Очищаем стор полностью чтобы Zustand тоже видел logout
      clearStore()

      // Небольшая задержка чтобы дать Zustand прочитать обновлённый стор
      // перед редиректом (иначе dashboard снова думает что мы залогинены)
      setTimeout(() => {
        window.location.href = '/auth/login'
      }, 100)

      return Promise.reject(error)
    }
  }
)
