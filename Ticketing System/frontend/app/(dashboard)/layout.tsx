'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/app/lib/store'
import { Sidebar } from '@/app/components/layout/Sidebar'
import { Topbar } from '@/app/components/layout/Topbar'
import api from '@/app/lib/api'

const DEFAULT_IDLE_TIMEOUT_MINUTES = 15
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
// How often real activity pings the server (see users/authentication.py's
// IdleAwareJWTAuthentication) - much less frequent than activity itself,
// since this only needs to keep the server-side clock roughly in sync with
// the client-side one, not be perfectly real-time.
const HEARTBEAT_INTERVAL_MS = 60 * 1000

// Module-level (not state) so the idle-timeout effect and the generic
// "user is gone, redirect to /login" effect below agree on the same target
// URL no matter which one's router.replace() actually lands last - without
// this, the generic effect's plain '/login' redirect can win the race and
// silently strip the '?reason=idle' the idle timer set.
let pendingLogoutReason: 'idle' | null = null

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Close the mobile drawer on route changes (e.g. after a client-side
  // navigation that isn't caught by the Sidebar link's own onClick, such as
  // browser back/forward).
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  // Log out after N minutes with no mouse/keyboard/touch/scroll activity.
  // Without this, the axios interceptor's silent token refresh (api.ts) keeps
  // the session alive indefinitely as long as anything polls the API - it has
  // no notion of real user activity, so an idle tab never logs out on its own.
  //
  // This client-side timer is the primary UX (instant redirect, no round
  // trip), but it can't be trusted alone - a frozen/backgrounded tab,
  // disabled JS, or a tampered client would never log out. So real activity
  // also pings /auth/heartbeat/ (throttled), which the server checks on
  // every authenticated request (IdleAwareJWTAuthentication) - if this
  // client-side timer somehow fails to fire, the next API call still gets
  // rejected and forces a logout (see api.ts's 'idle_timeout' handling).
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHeartbeatRef = useRef(0)
  useEffect(() => {
    if (!user) return
    const timeoutMs = (user.effective_idle_timeout_minutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000

    const logout = async () => {
      try { await api.post('/auth/logout/', { refresh: refreshToken }) } catch {}
      pendingLogoutReason = 'idle'
      clearAuth()
      router.replace('/login?reason=idle')
    }

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(logout, timeoutMs)

      const now = Date.now()
      if (now - lastHeartbeatRef.current > HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatRef.current = now
        api.post('/auth/heartbeat/').catch(() => {})
      }
    }

    resetTimer()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetTimer))
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [user, refreshToken, clearAuth, router])

  useEffect(() => {
    // Only redirect once Zustand has finished rehydrating from localStorage.
    // Without this guard, a page refresh briefly shows user=null before
    // the persisted session is restored, causing a spurious logout redirect.
    if (hasHydrated && !user) {
      router.replace(pendingLogoutReason === 'idle' ? '/login?reason=idle' : '/login')
      pendingLogoutReason = null
    }
  }, [hasHydrated, user, router])

  // While the store is rehydrating, render nothing to avoid a flash.
  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="print:hidden">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <Topbar onMenuClick={() => setMobileNavOpen((o) => !o)} />
      </div>
      <main className="lg:ml-64 pt-14 min-h-screen print:ml-0 print:pt-0 overflow-x-hidden">
        <div className="p-4 sm:p-6 print:p-0 max-w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
