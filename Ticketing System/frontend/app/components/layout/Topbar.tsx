'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, LogOut, User, ChevronDown, Menu } from 'lucide-react'
import { useAuthStore } from '@/app/lib/store'
import api from '@/app/lib/api'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tickets': 'Tickets',
  '/tickets/new': 'New Ticket',
  '/users': 'Users',
  '/reports': 'Reports',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
  '/profile': 'My Profile',
  '/vault': 'Password Vault',
}

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const { user, clearAuth, refreshToken } = useAuthStore()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  // Deliberately NOT keyed on `pathname` - this used to refetch on every
  // single navigation, which meant an async setState from the fetch's
  // .then() could land while Next's router transition for that same
  // navigation was still being committed. A normal-priority update
  // stepping on a low-priority transition like that is exactly what caused
  // this app's earlier hydration bug (see DashboardLayout's history): the
  // new page's content would silently fail to paint until some later
  // higher-priority event (another click) forced React to flush it. The
  // periodic interval already keeps this fresh without that risk.
  useEffect(() => {
    const refresh = () =>
      api.get('/notifications/unread_count/').then((r) => setUnread(r.data.count)).catch(() => {})
    refresh()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [])

  const handleLogout = async () => {
    try { await api.post('/auth/logout/', { refresh: refreshToken }) } catch {}
    clearAuth()
    // Hard navigation (not router.push) - guarantees a full, clean reload
    // of the login page rather than relying on Next's client-side transition.
    window.location.href = '/login'
  }

  // Resolve current page title
  const title = PAGE_TITLES[pathname] ||
    (pathname.startsWith('/tickets/') ? 'Ticket Detail' : '')

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 z-30 h-14 bg-white/80 backdrop-blur-sm border-b border-gray-100 flex items-center px-4 sm:px-6 gap-3 sm:gap-4">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden -ml-1 p-2 rounded-xl hover:bg-gray-100 text-gray-500"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title */}
      <p className="text-sm font-semibold text-gray-700 flex-1 truncate">{title}</p>

      {/* Bell - hard navigation (not router.push), see Sidebar for why */}
      <button
        onClick={() => { window.location.href = '/notifications' }}
        className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2.5 py-1.5 px-3 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center uppercase">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold text-gray-800 leading-tight">{user?.full_name}</p>
            <p className="text-xs text-gray-400 capitalize leading-tight">{user?.role_detail?.name.replace('_', ' ')}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-lg z-20 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-900">{user?.full_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); window.location.href = '/profile' }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4 text-gray-400" /> My Profile
              </button>
              <div className="border-t border-gray-100 mx-3" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
