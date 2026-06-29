'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/app/lib/api'
import { SystemSettings, TicketFormConfig, TicketCategory } from '@/app/lib/types'
import { useAuthStore } from '@/app/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import {
  Settings, Building2, Ticket, Mail, Layout, Tag,
  CheckCircle2, Circle, Upload, X, Eye, EyeOff, Plus, Pencil, Trash2, GripVertical,
} from 'lucide-react'

// ─── tiny local Toggle ───────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-blue-900' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )
}

// ─── tiny local Select ───────────────────────────────────────────────────────
function SSelect({ label, value, onChange, options }: {
  label: string; value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

const TABS = [
  { id: 'organisation', label: 'Organisation', icon: Building2 },
  { id: 'portal', label: 'Portal', icon: Layout },
  { id: 'ticket_numbering', label: 'Ticket Series', icon: Ticket },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'form_fields', label: 'Form Fields', icon: Settings },
  { id: 'categories', label: 'Categories', icon: Tag },
]

const FORM_FIELDS = [
  { key: 'category_required' as keyof TicketFormConfig, label: 'Category', desc: 'Type of request (IT Support, Maintenance, HR…)' },
  { key: 'priority_required' as keyof TicketFormConfig, label: 'Priority', desc: 'Urgency level. Defaults to Medium when optional.' },
  { key: 'department_required' as keyof TicketFormConfig, label: 'Department', desc: 'Required for auto-assignment to work correctly.' },
  { key: 'location_required' as keyof TicketFormConfig, label: 'Location', desc: 'Room, floor or building where the issue is.' },
]

const DEFAULT_SETTINGS: Partial<SystemSettings> = {
  company_name: '', company_tagline: '', company_email: '',
  company_phone: '', company_website: '', company_address: '',
  portal_name: '', portal_welcome: '', support_hours: '',
  primary_color: '#1e3a5f',
  ticket_prefix: 'TKT', ticket_separator: '-',
  ticket_include_year: true, ticket_year_format: 'YYYY',
  ticket_seq_digits: 5, ticket_reset_yearly: true,
  email_sender_name: '', email_sender_address: '', email_reply_to: '', email_footer: '',
}

export default function SettingsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState('organisation')
  const [settings, setSettings] = useState<Partial<SystemSettings>>(DEFAULT_SETTINGS)
  const [formConfig, setFormConfig] = useState<TicketFormConfig | null>(null)
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [catModal, setCatModal] = useState(false)
  const [catEditing, setCatEditing] = useState<TicketCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', slug: '', description: '', color: '#6b7280', is_active: true, department_ids: [] as number[] })
  const [allDepartments, setAllDepartments] = useState<{ id: number; name: string }[]>([])
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')
  const [preview, setPreview] = useState('TKT-2026-00001')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [showEmailPwd, setShowEmailPwd] = useState(false)
  const [testEmailRecipient, setTestEmailRecipient] = useState('')
  const [testEmailLoading, setTestEmailLoading] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const logoRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user && user.role !== 'admin') { router.push('/dashboard'); return }
    Promise.all([
      api.get('/branding/'),
      api.get('/tickets/form-config/'),
      api.get('/tickets/categories/'),
      api.get('/departments/?is_active=true'),
    ]).then(([bRes, fRes, cRes, dRes]) => {
      const s: SystemSettings = bRes.data
      setSettings(s)
      setPreview(s.ticket_number_preview || 'TKT-2026-00001')
      if (s.company_logo_url) setLogoPreview(s.company_logo_url)
      if (s.favicon_url) setFaviconPreview(s.favicon_url)
      setFormConfig(fRes.data)
      setCategories(cRes.data.results ?? cRes.data)
      setAllDepartments(dRes.data.results ?? dRes.data)
      setLoading(false)
    })
  }, [user, router])

  // Live-preview ticket number as user types
  useEffect(() => {
    if (!settings.ticket_prefix) return
    const sep = settings.ticket_separator || '-'
    const seq = '1'.padStart(settings.ticket_seq_digits || 5, '0')
    const nowYear = new Date().getFullYear()
    const year = settings.ticket_year_format === 'YY' ? String(nowYear).slice(-2) : String(nowYear)
    const parts = [settings.ticket_prefix]
    if (settings.ticket_include_year) parts.push(year)
    parts.push(seq)
    setPreview(parts.join(sep))
  }, [settings.ticket_prefix, settings.ticket_separator, settings.ticket_include_year, settings.ticket_year_format, settings.ticket_seq_digits])

  const set = (patch: Partial<SystemSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setSaved(null)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setSaved(null)
  }

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFaviconFile(file)
    setFaviconPreview(URL.createObjectURL(file))
    setSaved(null)
  }

  const handleTestEmail = async () => {
    setTestEmailLoading(true)
    setTestEmailResult(null)
    try {
      const res = await api.post('/branding/test-email/', { recipient: testEmailRecipient || undefined })
      setTestEmailResult({ success: true, message: res.data.message })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setTestEmailResult({ success: false, error: err.response?.data?.error || 'Failed to send test email.' })
    } finally {
      setTestEmailLoading(false)
    }
  }

  const openCatModal = (cat?: TicketCategory) => {
    if (cat) {
      setCatEditing(cat)
      setCatForm({ name: cat.name, slug: cat.slug, description: cat.description, color: cat.color, is_active: cat.is_active, department_ids: cat.department_ids ?? [] })
    } else {
      setCatEditing(null)
      setCatForm({ name: '', slug: '', description: '', color: '#6b7280', is_active: true, department_ids: [] })
    }
    setCatError('')
    setCatModal(true)
  }

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const handleCatSave = async () => {
    if (!catForm.name.trim()) { setCatError('Name is required.'); return }
    if (!catForm.slug.trim()) { setCatError('Slug is required.'); return }
    setCatSaving(true); setCatError('')
    try {
      if (catEditing) {
        const res = await api.patch(`/tickets/categories/${catEditing.id}/`, catForm)
        setCategories((prev) => prev.map((c) => c.id === catEditing.id ? res.data : c))
      } else {
        const res = await api.post('/tickets/categories/', { ...catForm, order: categories.length })
        setCategories((prev) => [...prev, res.data])
      }
      setCatModal(false)
    } catch (e: unknown) {
      const err = e as { response?: { data?: Record<string, string[]> } }
      const msg = err.response?.data ? Object.values(err.response.data).flat().join(' ') : 'Save failed.'
      setCatError(msg)
    } finally {
      setCatSaving(false)
    }
  }

  const handleCatDelete = async (cat: TicketCategory) => {
    if (!confirm(`Delete category "${cat.name}"? Existing tickets will still show the slug.`)) return
    await api.delete(`/tickets/categories/${cat.id}/`)
    setCategories((prev) => prev.filter((c) => c.id !== cat.id))
  }

  const handleCatToggle = async (cat: TicketCategory) => {
    const res = await api.patch(`/tickets/categories/${cat.id}/`, { is_active: !cat.is_active })
    setCategories((prev) => prev.map((c) => c.id === cat.id ? res.data : c))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save branding settings
      const fd = new FormData()
      const skip = new Set(['id', 'company_logo', 'company_logo_url', 'favicon', 'favicon_url', 'ticket_number_preview'])
      for (const [k, v] of Object.entries(settings)) {
        if (skip.has(k)) continue
        fd.append(k, v === null || v === undefined ? '' : String(v))
      }
      if (logoFile) fd.append('company_logo', logoFile)
      if (faviconFile) fd.append('favicon', faviconFile)
      const bRes = await api.patch('/branding/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSettings(bRes.data)
      setPreview(bRes.data.ticket_number_preview)

      // Save form config
      if (formConfig) await api.patch('/tickets/form-config/', formConfig)

      setSaved(activeTab)
    } finally {
      setSaving(false)
    }
  }

  const toggleField = (key: keyof TicketFormConfig) => {
    if (!formConfig) return
    setFormConfig({ ...formConfig, [key]: !formConfig[key] })
    setSaved(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
            <p className="text-sm text-gray-500">Branding, ticket series, email and form configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
          {activeTab !== 'categories' && (
            <Button onClick={handleSave} loading={saving}>Save All Changes</Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-900 text-blue-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Organisation ── */}
      {activeTab === 'organisation' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Company Identity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Logo upload */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Company Logo</p>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                    {logoPreview
                      ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                      : <Building2 className="w-8 h-8 text-gray-300" />
                    }
                  </div>
                  <div className="space-y-2">
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    <Button variant="outline" onClick={() => logoRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1.5" /> Upload Logo
                    </Button>
                    {logoPreview && (
                      <button
                        onClick={() => { setLogoPreview(null); setLogoFile(null); set({ company_logo: null } as any) }}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                    <p className="text-xs text-gray-400">PNG, JPG, SVG — max 2 MB. Shown in sidebar and emails.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Company Name *" value={settings.company_name || ''} onChange={(e) => set({ company_name: e.target.value })} />
                <Input label="Tagline" placeholder="e.g. Your IT partner" value={settings.company_tagline || ''} onChange={(e) => set({ company_tagline: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Support Email" type="email" value={settings.company_email || ''} onChange={(e) => set({ company_email: e.target.value })} />
                <Input label="Phone" value={settings.company_phone || ''} onChange={(e) => set({ company_phone: e.target.value })} />
              </div>
              <Input label="Website" type="url" placeholder="https://..." value={settings.company_website || ''} onChange={(e) => set({ company_website: e.target.value })} />
              <Textarea label="Address" rows={2} value={settings.company_address || ''} onChange={(e) => set({ company_address: e.target.value })} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.primary_color || '#1e3a5f'}
                      onChange={(e) => set({ primary_color: e.target.value })}
                      className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                    />
                    <Input
                      label=""
                      value={settings.primary_color || '#1e3a5f'}
                      onChange={(e) => set({ primary_color: e.target.value })}
                      placeholder="#1e3a5f"
                      className="w-32"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Favicon</label>
                  <div className="flex items-center gap-3">
                    {faviconPreview
                      ? <img src={faviconPreview} alt="Favicon" className="w-8 h-8 object-contain rounded border" />
                      : <div className="w-8 h-8 rounded border border-dashed border-gray-300 flex items-center justify-center bg-gray-50"><Eye className="w-4 h-4 text-gray-300" /></div>
                    }
                    <input ref={faviconRef} type="file" accept="image/*" className="hidden" onChange={handleFaviconChange} />
                    <Button variant="outline" onClick={() => faviconRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1.5" /> Upload
                    </Button>
                    {faviconPreview && (
                      <button onClick={() => { setFaviconPreview(null); setFaviconFile(null) }} className="text-xs text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Portal ── */}
      {activeTab === 'portal' && (
        <Card>
          <CardHeader><CardTitle>Portal Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Portal Name"
              placeholder="e.g. GSH Helpdesk"
              value={settings.portal_name || ''}
              onChange={(e) => set({ portal_name: e.target.value })}
            />
            <Textarea
              label="Welcome Message"
              placeholder="Shown on the login page and dashboard"
              rows={3}
              value={settings.portal_welcome || ''}
              onChange={(e) => set({ portal_welcome: e.target.value })}
            />
            <Input
              label="Support Hours"
              placeholder="e.g. Sunday – Thursday, 8 AM – 5 PM"
              value={settings.support_hours || ''}
              onChange={(e) => set({ support_hours: e.target.value })}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Ticket Series ── */}
      {activeTab === 'ticket_numbering' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ticket Number Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Live preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4">
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Preview</p>
                  <p className="text-2xl font-mono font-bold text-blue-900">{preview}</p>
                </div>
                <p className="text-sm text-blue-600 ml-2">This is what your next ticket number will look like</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Prefix"
                  placeholder="TKT"
                  value={settings.ticket_prefix || ''}
                  onChange={(e) => set({ ticket_prefix: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Separator"
                  placeholder="-"
                  value={settings.ticket_separator || ''}
                  onChange={(e) => set({ ticket_separator: e.target.value })}
                />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Sequence Digits</label>
                  <select
                    value={settings.ticket_seq_digits || 5}
                    onChange={(e) => set({ ticket_seq_digits: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    {[3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>{n} digits ({Array(n).fill('0').join('')}1)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Include year in number</p>
                    <p className="text-sm text-gray-500">e.g. TKT-2026-00001 vs TKT-00001</p>
                  </div>
                  <Toggle value={!!settings.ticket_include_year} onChange={(v) => set({ ticket_include_year: v })} />
                </div>

                {settings.ticket_include_year && (
                  <div className="flex items-center justify-between pl-4 border-l-2 border-blue-100">
                    <div>
                      <p className="font-medium text-gray-900">Year format</p>
                      <p className="text-sm text-gray-500">Full (2026) or short (26)</p>
                    </div>
                    <div className="flex gap-2">
                      {(['YYYY', 'YY'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => set({ ticket_year_format: fmt })}
                          className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
                            settings.ticket_year_format === fmt
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {fmt === 'YYYY' ? '2026' : '26'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Reset sequence each year</p>
                    <p className="text-sm text-gray-500">Restart from 00001 on 1 January</p>
                  </div>
                  <Toggle value={!!settings.ticket_reset_yearly} onChange={(v) => set({ ticket_reset_yearly: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pattern Examples</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'Default', prefix: 'TKT', sep: '-', year: true, digits: 5, fmt: 'YYYY' },
                  { name: 'Incident', prefix: 'INC', sep: '-', year: false, digits: 6, fmt: 'YYYY' },
                  { name: 'Short year', prefix: 'HLP', sep: '/', year: true, digits: 4, fmt: 'YY' },
                ].map((ex) => {
                  const seq = '1'.padStart(ex.digits, '0')
                  const y = ex.fmt === 'YYYY' ? '2026' : '26'
                  const parts = [ex.prefix]; if (ex.year) parts.push(y); parts.push(seq)
                  const num = parts.join(ex.sep)
                  return (
                    <button
                      key={ex.name}
                      onClick={() => set({ ticket_prefix: ex.prefix, ticket_separator: ex.sep, ticket_include_year: ex.year, ticket_seq_digits: ex.digits, ticket_year_format: ex.fmt as 'YYYY' | 'YY' })}
                      className="text-left p-3 border rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <p className="text-xs text-gray-500 mb-1">{ex.name}</p>
                      <p className="font-mono font-bold text-gray-900">{num}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Email ── */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          {/* SMTP Server */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>SMTP Server</CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{settings.email_enabled ? 'Email enabled' : 'Email disabled'}</span>
                  <Toggle value={!!settings.email_enabled} onChange={(v) => set({ email_enabled: v })} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="SMTP Host"
                  placeholder="smtp.office365.com"
                  value={settings.email_host || ''}
                  onChange={(e) => set({ email_host: e.target.value })}
                />
                <Input
                  label="SMTP Port"
                  type="number"
                  placeholder="587"
                  value={String(settings.email_port || 587)}
                  onChange={(e) => set({ email_port: Number(e.target.value) })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Username / Login Email"
                  type="email"
                  placeholder="helpdesk@yourdomain.com"
                  value={settings.email_host_user || ''}
                  onChange={(e) => set({ email_host_user: e.target.value })}
                />
                <div className="relative">
                  <Input
                    label="Password / App Password"
                    type={showEmailPwd ? 'text' : 'password'}
                    placeholder={settings.email_host_password ? '••••••••' : 'Enter password'}
                    value={settings.email_host_password || ''}
                    onChange={(e) => set({ email_host_password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailPwd((p) => !p)}
                    className="absolute right-3 bottom-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showEmailPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_security"
                    checked={!!settings.email_use_tls && !settings.email_use_ssl}
                    onChange={() => set({ email_use_tls: true, email_use_ssl: false })}
                    className="text-blue-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">STARTTLS</p>
                    <p className="text-xs text-gray-500">Port 587 — most common (Office 365, Gmail)</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_security"
                    checked={!!settings.email_use_ssl && !settings.email_use_tls}
                    onChange={() => set({ email_use_tls: false, email_use_ssl: true })}
                    className="text-blue-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">SSL/TLS</p>
                    <p className="text-xs text-gray-500">Port 465 — older servers</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_security"
                    checked={!settings.email_use_tls && !settings.email_use_ssl}
                    onChange={() => set({ email_use_tls: false, email_use_ssl: false })}
                    className="text-blue-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">None</p>
                    <p className="text-xs text-gray-500">Port 25 — internal/dev only</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">Test email recipient</p>
                  <p className="text-xs text-gray-400">Leave blank to send to your account email</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={user?.email || 'you@example.com'}
                    value={testEmailRecipient}
                    onChange={(e) => setTestEmailRecipient(e.target.value)}
                  />
                  <button
                    onClick={handleTestEmail}
                    disabled={testEmailLoading}
                    className="px-4 py-1.5 bg-blue-900 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                  >
                    {testEmailLoading ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Test
                  </button>
                </div>
              </div>
              {testEmailResult && (
                <div className={`text-sm rounded-lg px-4 py-3 ${testEmailResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {testEmailResult.success ? '✓ ' : '✗ '}{testEmailResult.message || testEmailResult.error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sender identity */}
          <Card>
            <CardHeader><CardTitle>Sender Identity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Sender Name"
                  placeholder="Helpdesk"
                  value={settings.email_sender_name || ''}
                  onChange={(e) => set({ email_sender_name: e.target.value })}
                />
                <Input
                  label="From Email Address"
                  type="email"
                  placeholder="helpdesk@yourdomain.com"
                  value={settings.email_sender_address || ''}
                  onChange={(e) => set({ email_sender_address: e.target.value })}
                />
              </div>
              <Input
                label="Reply-To Address"
                type="email"
                placeholder="support@yourdomain.com (optional)"
                value={settings.email_reply_to || ''}
                onChange={(e) => set({ email_reply_to: e.target.value })}
              />
              <Textarea
                label="Email Footer"
                placeholder="This is an automated message from our helpdesk system."
                rows={2}
                value={settings.email_footer || ''}
                onChange={(e) => set({ email_footer: e.target.value })}
              />
            </CardContent>
          </Card>

          {/* Notification events */}
          <Card>
            <CardHeader><CardTitle>Email Notification Events</CardTitle></CardHeader>
            <CardContent className="divide-y divide-gray-100">
              {[
                { key: 'notify_on_ticket_created', label: 'Ticket Created', desc: 'Notify requester when their ticket is received; notify department email' },
                { key: 'notify_on_ticket_assigned', label: 'Ticket Assigned', desc: 'Notify the assigned agent when a ticket is assigned to them' },
                { key: 'notify_on_status_updated', label: 'Status Changed', desc: 'Notify requester whenever the ticket status changes' },
                { key: 'notify_on_comment_added', label: 'Comment / Reply Added', desc: 'Notify requester when an agent adds a public reply' },
                { key: 'notify_on_ticket_resolved', label: 'Ticket Resolved', desc: 'Notify requester when their ticket is marked resolved' },
                { key: 'notify_on_sla_breach', label: 'SLA Breach', desc: 'Alert assigned agent and department when an SLA deadline is missed' },
              ].map((ev) => (
                <div key={ev.key} className="flex items-center justify-between py-4">
                  <div className="flex-1 pr-6">
                    <p className="font-medium text-gray-900">{ev.label}</p>
                    <p className="text-sm text-gray-500">{ev.desc}</p>
                  </div>
                  <Toggle
                    value={!!(settings as Record<string, unknown>)[ev.key]}
                    onChange={(v) => set({ [ev.key]: v } as Partial<SystemSettings>)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-400">
                Common SMTP presets — Office 365: <code>smtp.office365.com:587 STARTTLS</code> &nbsp;|&nbsp;
                Gmail: <code>smtp.gmail.com:587 STARTTLS</code> (use App Password) &nbsp;|&nbsp;
                Outlook.com: <code>smtp-mail.outlook.com:587 STARTTLS</code>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Form Fields ── */}
      {activeTab === 'form_fields' && formConfig && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Required Fields on Ticket Submission</CardTitle></CardHeader>
            <CardContent className="divide-y divide-gray-100">
              {/* Always required */}
              {['Title', 'Description'].map((label) => (
                <div key={label} className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-sm text-gray-500">Always required — cannot be changed</p>
                  </div>
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="w-5 h-5" /> Required
                  </div>
                </div>
              ))}

              {FORM_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between py-4">
                  <div className="flex-1 pr-6">
                    <p className="font-medium text-gray-900">{f.label}</p>
                    <p className="text-sm text-gray-500">{f.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleField(f.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      formConfig[f.key]
                        ? 'bg-blue-900 text-white hover:bg-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {formConfig[f.key]
                      ? <><CheckCircle2 className="w-4 h-4" /> Required</>
                      : <><Circle className="w-4 h-4" /> Optional</>
                    }
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Auto-Assignment Priority</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">When a ticket is created, it is assigned in this order:</p>
              <ol className="space-y-3">
                {[
                  { n: 1, title: 'Configured auto-assignee', desc: 'The specific person set on the department (configure in Departments)' },
                  { n: 2, title: 'Department manager', desc: 'The manager field on the department' },
                  { n: 3, title: 'Least-busy agent', desc: 'Active agent in the department with fewest open tickets' },
                ].map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {s.n}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.title}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Categories ── */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ticket Categories</CardTitle>
                <Button onClick={() => openCatModal()} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Category
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No categories yet. Click "Add Category" to create one.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center gap-4 py-3">
                      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${cat.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {cat.name}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{cat.slug}</p>
                        {cat.description && <p className="text-xs text-gray-500 truncate">{cat.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cat.department_names && cat.department_names.length > 0
                            ? cat.department_names.map((d) => (
                                <span key={d.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">
                                  {d.name}
                                </span>
                              ))
                            : <span className="text-xs text-gray-400 italic">All departments (global)</span>
                          }
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCatToggle(cat)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            cat.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => openCatModal(cat)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleCatDelete(cat)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-500">
                Categories appear in the ticket creation form. Deactivating a category hides it from new tickets
                but keeps the label on existing ones.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Category Modal ── */}
      {catModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {catEditing ? 'Edit Category' : 'New Category'}
              </h2>
              <button onClick={() => setCatModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {catError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{catError}</p>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={catForm.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setCatForm((p) => ({ ...p, name, slug: catEditing ? p.slug : autoSlug(name) }))
                  }}
                  placeholder="e.g. IT Support"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug * <span className="text-xs text-gray-400 font-normal">(URL-safe key, stored on tickets)</span></label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={catForm.slug}
                  onChange={(e) => setCatForm((p) => ({ ...p, slug: e.target.value.replace(/[^a-z0-9_]/g, '') }))}
                  placeholder="it_support"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={catForm.description}
                  onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Badge Colour</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                    value={catForm.color}
                    onChange={(e) => setCatForm((p) => ({ ...p, color: e.target.value }))}
                  />
                  <span className="text-sm font-mono text-gray-600">{catForm.color}</span>
                  <span className="ml-auto inline-flex items-center px-3 py-1 rounded-full text-white text-xs font-medium" style={{ backgroundColor: catForm.color }}>
                    {catForm.name || 'Preview'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Departments
                  <span className="text-xs font-normal text-gray-400 ml-1">(leave empty = visible for all departments)</span>
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {allDepartments.map((d) => {
                    const checked = catForm.department_ids.includes(d.id)
                    return (
                      <label key={d.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCatForm((p) => ({
                              ...p,
                              department_ids: checked
                                ? p.department_ids.filter((id) => id !== d.id)
                                : [...p.department_ids, d.id],
                            }))
                          }
                          className="rounded border-gray-300 text-blue-900"
                        />
                        <span className="text-sm text-gray-700">{d.name}</span>
                      </label>
                    )
                  })}
                  {allDepartments.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-3">No departments found.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <label className="text-sm font-medium text-gray-700">Active</label>
                <button
                  type="button"
                  onClick={() => setCatForm((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${catForm.is_active ? 'bg-blue-900' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${catForm.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCatModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCatSave}
                disabled={catSaving}
                className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {catSaving ? 'Saving…' : 'Save Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
