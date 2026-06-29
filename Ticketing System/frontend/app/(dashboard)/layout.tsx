'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/app/lib/store'
import { Sidebar } from '@/app/components/layout/Sidebar'
import { Topbar } from '@/app/components/layout/Topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

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
      <Sidebar />
      <Topbar />
      <main className="ml-64 pt-14 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
