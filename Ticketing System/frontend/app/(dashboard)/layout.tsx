'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/app/lib/store'
import { Sidebar } from '@/app/components/layout/Sidebar'
import { Topbar } from '@/app/components/layout/Topbar'
import api from '@/app/lib/api'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

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

  // Log out after 15 minutes with no mouse/keyboard/touch/scroll activity.
  // Without this, the axios interceptor's silent token refresh (api.ts) keeps
  // the session alive indefinitely as long as anything polls the API - it has
  // no notion of real user activity, so an idle tab never logs out on its own.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!user) return

    const logout = async () => {
      try { await api.post('/auth/logout/', { refresh: refreshToken }) } catch {}
      clearAuth()
      router.replace('/login')
    }

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS)
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
    if (hasHydrated && !user) router.replace('/login')
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
      <main className="lg:ml-64 pt-14 min-h-screen print:ml-0 print:pt-0">
        <div className="p-4 sm:p-6 print:p-0">
          {children}
        </div>
      </main>
    </div>
  )
}
