import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from './types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  setAuth: (user: User, access: string, refresh: string) => void
  clearAuth: () => void
  setUser: (user: User) => void
}

/** Checks "module.action" against the current user's role. Super roles
 * (the old "admin" bypass) implicitly pass every check. */
export function useHasPerm(module: string, action: string): boolean {
  return useAuthStore((s) => {
    const role = s.user?.role_detail
    if (!role) return false
    if (role.is_super) return true
    return role.permissions.includes(`${module}.${action}`)
  })
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken })
      },
      clearAuth: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null })
      },
      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
