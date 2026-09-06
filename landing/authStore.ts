'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Корпоративная версия (TEAM) — Phase 1. null/undefined for users who aren't
// in an organization (see getOrgSummaryForUser in landing/lib/org.js, the
// server-side source of this shape).
interface OrgSummary {
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER'
  orgTier: 'START' | 'BUSINESS'
  orgSeatLimit: number
  orgSeatsUsed: number
  // Optional: added after the initial Phase 1 shape (see landing/lib/org.js
  // getOrgSummaryForUser) — optional here so already-persisted localStorage
  // state from before this change still satisfies the type.
  orgSeatsExpiresAt?: string | null
  orgAutoRenewSeats?: boolean
  orgIsOwner?: boolean
}

interface User {
  id: string
  email: string
  name?: string
  avatar?: string
  plan?: string
  planExpiresAt?: string | null
  emailVerified?: boolean
  orgSummary?: OrgSummary | null
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'centrio-auth',
      // SECURITY: refreshToken is intentionally excluded from persisted storage.
      // It's a long-lived credential — persisting it to localStorage means any XSS
      // (past or present) can read it indefinitely from disk. It stays in-memory
      // only (part of Zustand state, just not written to the persisted subset),
      // so a full page reload requires the (short-lived) accessToken to still be
      // valid, or the user re-authenticates. A true httpOnly-cookie refresh flow
      // needs the token-issuing backend (deployed separately, not in this repo)
      // to set Set-Cookie instead of returning refreshToken in the response body —
      // out of scope here. See also: the desktop app's OAuth deep-link flow
      // (centrio://auth?accessToken=&refreshToken=) can't use cookies at all,
      // since custom protocol handlers don't carry them.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
