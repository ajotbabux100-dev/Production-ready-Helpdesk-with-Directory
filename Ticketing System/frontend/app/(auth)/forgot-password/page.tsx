'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/app/lib/api'
import { SystemSettings } from '@/app/lib/types'
import { Ticket, Eye, EyeOff, ArrowLeft, CheckCircle2, Mail } from 'lucide-react'

type Step = 'email' | 'code'

export default function ForgotPasswordPage() {
  const [branding, setBranding] = useState<Pick<SystemSettings, 'company_name' | 'portal_name' | 'company_logo_url' | 'primary_color'> | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get('/branding/').then((r) => setBranding(r.data)).catch(() => {})
  }, [])

  const bg = branding?.primary_color || '#1e3a5f'

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password/', { email })
      setNotice(res.data.detail)
      setStep('code')
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.email?.[0] || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password/', { email, code, new_password: newPassword })
      setDone(true)
    } catch (err: any) {
      const data = err.response?.data
      setError(data?.error || data?.new_password?.[0] || data?.code?.[0] || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          {branding?.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.company_logo_url} alt="Logo" className="w-9 h-9 object-contain rounded-xl bg-white p-1 border border-gray-100" />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
              <Ticket className="w-5 h-5 text-white" />
            </div>
          )}
          <p className="font-bold text-gray-900">{branding?.portal_name || 'Helpdesk Portal'}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-1">Password reset</h2>
              <p className="text-sm text-gray-500 mb-6">Your password has been changed. You can now sign in with your new password.</p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full h-11 rounded-xl text-white font-semibold text-sm"
                style={{ backgroundColor: bg }}
              >
                Back to Sign In
              </Link>
            </div>
          ) : step === 'email' ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Forgot password</h2>
              <p className="text-gray-400 text-sm mb-7">Enter your work email and we'll send you a reset code.</p>

              {error && (
                <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-red-200 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0">!</span>
                  {error}
                </div>
              )}

              <form onSubmit={requestCode} className="space-y-4">
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
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl text-white font-semibold text-sm mt-2 transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
                  style={{ backgroundColor: bg }}
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Send Reset Code'}
                </button>
              </form>

              <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Enter reset code</h2>
              <p className="text-gray-400 text-sm mb-2 flex items-start gap-1.5">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>We've sent a 6-digit code to <strong className="text-gray-600">{email}</strong>. It expires in 10 minutes.</span>
              </p>

              {notice && !error && (
                <div className="mb-5 mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  {notice}
                </div>
              )}
              {error && (
                <div className="mb-5 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-red-200 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0">!</span>
                  {error}
                </div>
              )}

              <form onSubmit={submitReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">6-Digit Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Enter a new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Re-enter the new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl text-white font-semibold text-sm mt-2 transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
                  style={{ backgroundColor: bg }}
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Reset Password'}
                </button>
              </form>

              <button
                onClick={() => { setStep('email'); setCode(''); setError(''); setNotice('') }}
                className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 w-full"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Use a different email
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
