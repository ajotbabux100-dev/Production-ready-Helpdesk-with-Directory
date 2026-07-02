'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/app/lib/store'
import api from '@/app/lib/api'
import { SystemSettings } from '@/app/lib/types'
import { Ticket, Eye, EyeOff, Zap } from 'lucide-react'
import { LOGIN_ICON_MAP, DEFAULT_LOGIN_HIGHLIGHTS as DEFAULT_HIGHLIGHTS, DEFAULT_LOGIN_HEADLINE as DEFAULT_HEADLINE } from '@/app/lib/loginIcons'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [branding, setBranding] = useState<Pick<SystemSettings, 'company_name' | 'portal_name' | 'company_logo_url' | 'primary_color' | 'portal_welcome' | 'support_hours' | 'company_email' | 'login_headline' | 'login_highlights'> | null>(null)

  useEffect(() => {
    api.get('/branding/').then((r) => setBranding(r.data)).catch(() => {})
  }, [])

  // Already logged in with a valid token — skip the login page
  useEffect(() => {
    if (hasHydrated && user && accessToken) router.replace('/dashboard')
  }, [hasHydrated, user, accessToken, router])

  const bg = branding?.primary_color || '#1e3a5f'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login/', { email, password })
      setAuth(res.data.user, res.data.access, res.data.refresh)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Incorrect email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex w-5/12 flex-col justify-between px-12 py-12 text-white"
        style={{ backgroundColor: bg }}
      >
        {/* Logo + name */}
        <div className="flex items-center gap-3">
          {branding?.company_logo_url ? (
            <img src={branding.company_logo_url} alt="Logo" className="w-10 h-10 object-contain rounded-xl bg-white p-1" />
          ) : (
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Ticket className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <p className="font-bold text-sm leading-tight">{branding?.portal_name || 'Helpdesk Portal'}</p>
            <p className="text-white/50 text-xs">{branding?.company_name || 'Ticketing System'}</p>
          </div>
        </div>

        {/* Hero copy */}
        <div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            {(branding?.login_headline || DEFAULT_HEADLINE).split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </h2>
          <p className="text-white/70 text-base leading-relaxed mb-10">
            {branding?.portal_welcome || 'A single portal for all your support needs — submit tickets, track progress, and get resolutions faster.'}
          </p>

          <div className="space-y-4">
            {(branding?.login_highlights?.length ? branding.login_highlights : DEFAULT_HIGHLIGHTS).map(({ icon, text }, i) => {
              const Icon = LOGIN_ICON_MAP[icon] || Zap
              return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm text-white/80">{text}</p>
              </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-white/30 text-xs">
          {branding?.support_hours && `Support hours: ${branding.support_hours}`}
        </p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <p className="font-bold text-gray-900">{branding?.portal_name || 'Helpdesk Portal'}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
            <p className="text-gray-400 text-sm mb-7">Enter your work email and password</p>

            {error && (
              <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-200 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0">!</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ '--tw-ring-color': bg } as any}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl text-white font-semibold text-sm mt-2 transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
                style={{ backgroundColor: bg }}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : 'Sign In'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-400">
              Forgot your password?{' '}
              <Link href="/forgot-password" className="text-blue-600 hover:underline">Reset it</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
