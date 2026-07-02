'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/app/lib/utils'
import { useAuthStore, useHasPerm } from '@/app/lib/store'
import api from '@/app/lib/api'
import { SystemSettings } from '@/app/lib/types'
import {
  LayoutDashboard, Ticket, Users, BarChart3,
  Settings, ClipboardList, Shield, LogOut, ChevronRight, BookOpen, KeyRound, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// perm: null means always visible to any authenticated user (no page-level right gates it).
const NAV = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard, perm: null,               staffOnly: false },
  { href: '/tickets',     label: 'My Tickets', icon: Ticket,           perm: 'tickets.view',     staffOnly: false, hideIfStaff: true },
  { href: '/tickets',     label: 'Tickets',    icon: ClipboardList,    perm: 'tickets.view',     staffOnly: true },
  { href: '/directory',   label: 'Directory',  icon: BookOpen,         perm: null,               staffOnly: false },
  { href: '/vault',       label: 'Password Vault', icon: KeyRound,     perm: 'vault.view',       staffOnly: false },
  { href: '/users',       label: 'Users',      icon: Users,             perm: 'users.view',       staffOnly: false },
  { href: '/reports',     label: 'Reports',    icon: BarChart3,         perm: 'reports.view',     staffOnly: false },
  { href: '/audit',       label: 'Audit Log',  icon: Shield,            perm: 'audit.view',       staffOnly: false },
  { href: '/settings',    label: 'Settings',   icon: Settings,          perm: 'settings.view',    staffOnly: false },
] as const

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

interface SidebarProps {
  mobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname  = usePathname()
  const router    = useRouter()
  const { user, clearAuth, refreshToken } = useAuthStore()
  const isStaff   = useHasPerm('tickets', 'claim')
  const [branding, setBranding] = useState<Pick<SystemSettings, 'company_name' | 'portal_name' | 'company_logo_url' | 'primary_color'> | null>(null)

  useEffect(() => {
    api.get('/branding/').then((r) => setBranding(r.data)).catch(() => {})
  }, [])

  const roleDetail = user?.role_detail
  const hasPerm = (perm: string | null) => {
    if (!perm) return true
    if (!roleDetail) return false
    if (roleDetail.is_super) return true
    return roleDetail.permissions.includes(perm)
  }
  const visible = NAV.filter((item) => {
    if ('staffOnly' in item && item.staffOnly && !isStaff) return false
    if ('hideIfStaff' in item && item.hideIfStaff && isStaff) return false
    return hasPerm(item.perm)
  })
  const bgColor  = branding?.primary_color || '#1e3a5f'
  const rgbColor = bgColor.startsWith('#') ? hexToRgb(bgColor) : '30 58 95'

  const handleLogout = async () => {
    try { await api.post('/auth/logout/', { refresh: refreshToken }) } catch {}
    clearAuth()
    router.replace('/login')
  }

  const initials = user
    ? `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()
    : '?'

  return (
    <>
      {/* ── Mobile backdrop ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform duration-200 ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ backgroundColor: bgColor }}
      >
      {/* ── Logo / brand ── */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          {branding?.company_logo_url ? (
            <img
              src={branding.company_logo_url}
              alt="Logo"
              className="w-9 h-9 object-contain rounded-xl bg-white/10 p-1 flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <Ticket className="w-5 h-5" style={{ color: bgColor }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-white leading-tight truncate">
              {branding?.portal_name || 'Helpdesk Portal'}
            </p>
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {branding?.company_name || 'Ticketing System'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {visible.map((item) => {
          const Icon   = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <motion.div
              key={item.href + item.label}
              whileHover={active ? {} : { x: 3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Link
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 flex-shrink-0 transition-colors',
                    active ? 'text-blue-900' : 'text-white/60 group-hover:text-white'
                  )}
                  style={active ? { color: bgColor } : {}}
                />
                <span className="flex-1">{item.label}</span>
                {active && (
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: bgColor }} />
                )}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* ── Version ── */}
      <div className="px-5 pb-2">
        <p className="text-[10px] text-white/25 font-mono">v{process.env.NEXT_PUBLIC_VERSION || '1.0.0'}</p>
      </div>

      {/* ── User profile ── */}
      {user && (
        <div
          className="border-t border-white/10 px-3 py-3"
          style={{ background: `rgba(${rgbColor} / 0.5)` }}
        >
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
              style={{ background: `rgba(255 255 255 / 0.2)` }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate leading-tight">{user.full_name}</p>
              <p className="text-[11px] text-white/50 capitalize">{user.role_detail?.name.replace('_', ' ')}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: -10 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      )}
      </aside>
    </>
  )
}
