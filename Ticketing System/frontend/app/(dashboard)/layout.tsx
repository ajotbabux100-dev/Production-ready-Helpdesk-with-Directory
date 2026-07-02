'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/app/lib/store'
import { Sidebar } from '@/app/components/layout/Sidebar'
import { Topbar } from '@/app/components/layout/Topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Close the mobile drawer on route changes (e.g. after a client-side
  // navigation that isn't caught by the Sidebar link's own onClick, such as
  // browser back/forward).
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

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
