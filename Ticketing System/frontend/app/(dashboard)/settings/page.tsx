'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import api from '@/app/lib/api'
import { downloadFile } from '@/app/lib/download'
import { SystemSettings, TicketFormConfig, TicketCategory, DirectoryTab, DirectoryField, PortalCategory, Role } from '@/app/lib/types'
import { useAuthStore, useHasPerm } from '@/app/lib/store'
import { LOGIN_ICON_MAP, LOGIN_ICON_OPTIONS, DEFAULT_LOGIN_HIGHLIGHTS, DEFAULT_LOGIN_HEADLINE } from '@/app/lib/loginIcons'
import { RolesSection } from './RolesSection'
import { MastersSection } from './MastersSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import {
  Settings, Building2, Building, Ticket, Mail, Layout, Tag,
  CheckCircle2, Circle, Upload, X, Eye, EyeOff, Plus, Pencil, Trash2, GripVertical,
  BookOpen, Columns3, Globe, Users as UsersIcon, Edit, ShieldCheck, Lock, UploadCloud, FileEdit,
  Archive, Download,
} from 'lucide-react'
import { DepartmentsSection } from './DepartmentsSection'
import { EmailTemplatesSection } from './EmailTemplatesSection'

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

const TABS = [
  { id: 'organisation', label: 'Organisation', icon: Building2 },
  { id: 'portal', label: 'Portal', icon: Layout },
  { id: 'ticket_numbering', label: 'Ticket Series', icon: Ticket },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'email_templates', label: 'Email Templates', icon: FileEdit },
  { id: 'form_fields', label: 'Form Fields', icon: Settings },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'departments', label: 'Departments', icon: Building },
  { id: 'directory', label: 'Directory', icon: BookOpen },
  { id: 'masters', label: 'Masters', icon: UploadCloud },
  { id: 'access', label: 'Portal Category Access', icon: ShieldCheck },
  { id: 'roles', label: 'Roles', icon: Lock },
  { id: 'backup', label: 'Backup', icon: Archive },
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
  login_headline: DEFAULT_LOGIN_HEADLINE, login_highlights: DEFAULT_LOGIN_HIGHLIGHTS,
  powered_by_text: '',
  default_idle_timeout_minutes: 15,
  primary_color: '#1e3a5f',
  ticket_prefix: 'TKT', ticket_separator: '-',
  ticket_include_year: true, ticket_year_format: 'YYYY',
  ticket_seq_digits: 5, ticket_reset_yearly: true,
  email_sender_name: '', email_sender_address: '', email_reply_to: '', email_footer: '',
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const canView = useHasPerm('settings', 'view')
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'organisation')
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
  const [saveError, setSaveError] = useState('')
  const [showEmailPwd, setShowEmailPwd] = useState(false)
  const [testEmailRecipient, setTestEmailRecipient] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState('')
  const [testEmailLoading, setTestEmailLoading] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Directory masters (tabs, fields, portal categories) ──
  const [dirTabs, setDirTabs] = useState<DirectoryTab[]>([])
  const [newDirTabName, setNewDirTabName] = useState('')
  const [renamingDirTabId, setRenamingDirTabId] = useState<number | null>(null)
  const [renameDirTabValue, setRenameDirTabValue] = useState('')
  const [expandedDirTabId, setExpandedDirTabId] = useState<number | null>(null)
  const [newFieldName, setNewFieldName] = useState('')
  const [renamingFieldId, setRenamingFieldId] = useState<number | null>(null)
  const [renameFieldValue, setRenameFieldValue] = useState('')
  const [dirSaving, setDirSaving] = useState(false)
  const [dirError, setDirError] = useState('')

  const [portalCategories, setPortalCategories] = useState<PortalCategory[]>([])
  const [newPortalCatName, setNewPortalCatName] = useState('')
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [accessCategoryId, setAccessCategoryId] = useState<number | null>(null)
  const [accessSelectedIds, setAccessSelectedIds] = useState<number[]>([])

  const logoRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user && !canView) { window.location.href = '/dashboard'; return }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canView])

  const fetchDirTabs = async () => {
    const res = await api.get('/directory/tabs/')
    setDirTabs(res.data.results ?? res.data)
  }

  const fetchPortalCategories = async () => {
    const res = await api.get('/directory/portal-categories/')
    setPortalCategories(res.data.results ?? res.data)
  }

  useEffect(() => {
    if (activeTab === 'directory') {
      fetchDirTabs()
    }
    if (activeTab === 'access' || activeTab === 'roles') {
      fetchAllRoles()
    }
    if (activeTab === 'access') {
      fetchPortalCategories()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const fetchAllRoles = async () => {
    const res = await api.get('/auth/roles/')
    setAllRoles(res.data.results ?? res.data)
  }

  const expandedTab = dirTabs.find((t) => t.id === expandedDirTabId) ?? null

  const handleAddDirTab = async () => {
    if (!newDirTabName.trim()) return
    setDirSaving(true)
    try {
      const res = await api.post('/directory/tabs/', { name: newDirTabName.trim(), order: dirTabs.length })
      setNewDirTabName('')
      await fetchDirTabs()
      setExpandedDirTabId(res.data.id)
    } catch (e: any) {
      setDirError(e.response?.data?.name?.[0] || 'Could not add tab')
    } finally {
      setDirSaving(false)
    }
  }

  const startRenameDirTab = (tab: DirectoryTab) => {
    setRenamingDirTabId(tab.id)
    setRenameDirTabValue(tab.name)
  }

  const saveRenameDirTab = async () => {
    if (renamingDirTabId === null || !renameDirTabValue.trim()) { setRenamingDirTabId(null); return }
    await api.patch(`/directory/tabs/${renamingDirTabId}/`, { name: renameDirTabValue.trim() })
    setRenamingDirTabId(null)
    fetchDirTabs()
  }

  const deleteDirTab = async (id: number) => {
    if (!confirm('Delete this tab? Its fields and entries will be deleted too.')) return
    await api.delete(`/directory/tabs/${id}/`)
    if (expandedDirTabId === id) setExpandedDirTabId(null)
    fetchDirTabs()
  }

  const handleAddField = async () => {
    if (!newFieldName.trim() || expandedDirTabId === null) return
    setDirSaving(true)
    try {
      await api.post('/directory/fields/', { tab: expandedDirTabId, name: newFieldName.trim(), order: expandedTab?.custom_fields.length ?? 0 })
      setNewFieldName('')
      fetchDirTabs()
    } catch (e: any) {
      setDirError(e.response?.data?.name?.[0] || 'Could not add detail')
    } finally {
      setDirSaving(false)
    }
  }

  const startRenameField = (field: DirectoryField) => {
    setRenamingFieldId(field.id)
    setRenameFieldValue(field.name)
  }

  const saveRenameField = async () => {
    if (renamingFieldId === null || !renameFieldValue.trim()) { setRenamingFieldId(null); return }
    await api.patch(`/directory/fields/${renamingFieldId}/`, { name: renameFieldValue.trim() })
    setRenamingFieldId(null)
    fetchDirTabs()
  }

  const deleteField = async (id: number) => {
    if (!confirm('Delete this detail? Its values will be removed from every entry in this tab.')) return
    await api.delete(`/directory/fields/${id}/`)
    fetchDirTabs()
  }

  const handleAddPortalCategory = async () => {
    if (!newPortalCatName.trim()) return
    setDirSaving(true)
    try {
      await api.post('/directory/portal-categories/', { name: newPortalCatName.trim(), order: portalCategories.length })
      setNewPortalCatName('')
      fetchPortalCategories()
    } catch (e: any) {
      setDirError(e.response?.data?.name?.[0] || 'Could not add category')
    } finally {
      setDirSaving(false)
    }
  }

  const deletePortalCategory = async (id: number) => {
    if (!confirm('Delete this category? Portals in it will become uncategorised.')) return
    await api.delete(`/directory/portal-categories/${id}/`)
    if (accessCategoryId === id) setAccessCategoryId(null)
    fetchPortalCategories()
  }

  const openAccessEditor = (category: PortalCategory) => {
    setAccessCategoryId(category.id)
    setAccessSelectedIds(category.allowed_roles)
  }

  const toggleAccessRole = (roleId: number) => {
    setAccessSelectedIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]))
  }

  const saveAccess = async () => {
    if (accessCategoryId === null) return
    setDirSaving(true)
    try {
      await api.patch(`/directory/portal-categories/${accessCategoryId}/`, { allowed_roles: accessSelectedIds })
      setAccessCategoryId(null)
      fetchPortalCategories()
    } finally {
      setDirSaving(false)
    }
  }

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

  const handleFullBackup = async () => {
    setBackupLoading(true)
    setBackupError('')
    try {
      await downloadFile('/branding/full-backup/', 'helpdesk_full_backup.zip')
    } catch (err: any) {
      // downloadFile requests responseType 'blob', so an error body also
      // arrives as a Blob rather than parsed JSON - read it back out.
      const data = err.response?.data
      if (data instanceof Blob) {
        try {
          const text = await data.text()
          setBackupError(JSON.parse(text).error || 'Failed to create backup.')
        } catch {
          setBackupError('Failed to create backup.')
        }
      } else {
        setBackupError(data?.error || 'Failed to create backup.')
      }
    } finally {
      setBackupLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      // Save branding settings
      const fd = new FormData()
      // email_host_password is server-side read-only (it returns a masked
      // placeholder on GET) - the actual writable field is
      // email_host_password_write. Sending it under its own key was silently
      // discarded by the serializer, so the SMTP password never saved.
      const skip = new Set(['id', 'company_logo', 'company_logo_url', 'favicon', 'favicon_url', 'ticket_number_preview', 'email_host_password'])
      for (const [k, v] of Object.entries(settings)) {
        if (skip.has(k)) continue
        if (v === null || v === undefined) { fd.append(k, ''); continue }
        // Object/array fields (e.g. login_highlights) must round-trip as JSON -
        // String(v) on an array/object produces "[object Object]" garbage,
        // which the backend then rejects, silently failing the whole save
        // (including any logo file bundled in the same request).
        fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
      }
      fd.append('email_host_password_write', settings.email_host_password || '')
      if (logoFile) fd.append('company_logo', logoFile)
      if (faviconFile) fd.append('favicon', faviconFile)
      const bRes = await api.patch('/branding/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSettings(bRes.data)
      setPreview(bRes.data.ticket_number_preview)
      setLogoFile(null)
      setFaviconFile(null)

      // Save form config
      if (formConfig) await api.patch('/tickets/form-config/', formConfig)

      setSaved(activeTab)
    } catch (err: any) {
      const data = err.response?.data
      const msg = data && typeof data === 'object' ? Object.values(data).flat().join(' ') : 'Save failed.'
      setSaveError(msg)
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Settings className="w-5 h-5 text-blue-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
            <p className="text-sm text-gray-500">Branding, ticket series, email and form configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {saveError && (
            <span className="text-sm text-red-600 font-medium max-w-xs truncate" title={saveError}>{saveError}</span>
          )}
          {saved && !saveError && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
          {activeTab !== 'categories' && activeTab !== 'directory' && activeTab !== 'access' && activeTab !== 'departments' && activeTab !== 'email_templates' && activeTab !== 'backup' && (
            <Button onClick={handleSave} loading={saving}>Save All Changes</Button>
          )}
        </div>
      </div>

      {/* Tab bar - scrolls independently of the page on narrow screens instead
          of forcing the whole layout to overflow horizontally. Edge fades +
          a styled thumb (see .tabs-scroll in globals.css) hint that it scrolls,
          instead of just cutting off at a plain default scrollbar. */}
      <div className="relative">
        <div className="tabs-scroll flex gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap ${
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
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-gray-50 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-gray-50 to-transparent" />
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
                    <p className="text-xs text-gray-400">Recommended: 512×512px, square, transparent background.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Company Name *" value={settings.company_name || ''} onChange={(e) => set({ company_name: e.target.value })} />
                <Input label="Tagline" placeholder="e.g. Your IT partner" value={settings.company_tagline || ''} onChange={(e) => set({ company_tagline: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="flex items-center gap-4 flex-wrap">
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
                  <p className="text-xs text-gray-400 mt-1.5">PNG or ICO — 32×32px or 64×64px, square. Shown as the browser tab icon.</p>
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
            <Input
              label="Powered By Text"
              placeholder="e.g. Powered by GSH & ISH OMAN IT"
              value={settings.powered_by_text ?? ''}
              onChange={(e) => set({ powered_by_text: e.target.value })}
            />
            <p className="text-xs text-gray-400 -mt-2">Shown in the sidebar footer and on the login page. Leave blank to hide.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Security ── */}
      {activeTab === 'portal' && (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Default Idle Timeout (minutes)"
              type="number"
              min={1}
              value={settings.default_idle_timeout_minutes ?? 15}
              onChange={(e) => set({ default_idle_timeout_minutes: Number(e.target.value) })}
            />
            <p className="text-xs text-gray-400 -mt-2">
              Users are automatically logged out after this many minutes of inactivity. Override
              this per user in Users -&gt; Edit User.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Login Page ── */}
      {activeTab === 'portal' && (
        <Card>
          <CardHeader>
            <CardTitle>Login Page</CardTitle>
            <p className="text-xs text-gray-400 mt-1">Customise the hero headline and highlight bullets shown on the login screen.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              label="Headline"
              placeholder={DEFAULT_LOGIN_HEADLINE}
              rows={2}
              value={settings.login_headline ?? ''}
              onChange={(e) => set({ login_headline: e.target.value })}
            />
            <p className="text-xs text-gray-400 -mt-2">Use a line break for a two-line heading.</p>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Highlights</label>
              {(settings.login_highlights?.length ? settings.login_highlights : DEFAULT_LOGIN_HIGHLIGHTS).map((h, i) => {
                const highlights = settings.login_highlights?.length ? settings.login_highlights : DEFAULT_LOGIN_HIGHLIGHTS
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={h.icon}
                      onChange={(e) => {
                        const next = highlights.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x))
                        set({ login_highlights: next })
                      }}
                      className="rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                    >
                      {LOGIN_ICON_OPTIONS.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                    <input
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                      value={h.text}
                      onChange={(e) => {
                        const next = highlights.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                        set({ login_highlights: next })
                      }}
                    />
                    <button
                      onClick={() => set({ login_highlights: highlights.filter((_, j) => j !== i) })}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const highlights = settings.login_highlights?.length ? settings.login_highlights : DEFAULT_LOGIN_HIGHLIGHTS
                  set({ login_highlights: [...highlights, { icon: 'star', text: '' }] })
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Highlight
              </Button>
            </div>

            {/* Live preview */}
            <div className="rounded-xl p-5 text-white" style={{ backgroundColor: settings.primary_color || '#1e3a5f' }}>
              <h3 className="text-lg font-bold leading-tight mb-2">
                {(settings.login_headline || DEFAULT_LOGIN_HEADLINE).split('\n').map((line, i) => (
                  <span key={i}>{line}{i === 0 && <br />}</span>
                ))}
              </h3>
              <div className="space-y-2 mt-3">
                {(settings.login_highlights?.length ? settings.login_highlights : DEFAULT_LOGIN_HIGHLIGHTS).map((h, i) => {
                  const Icon = LOGIN_ICON_MAP[h.icon] || LOGIN_ICON_MAP.star
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-white/80">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {h.text || <span className="italic text-white/40">(empty)</span>}
                    </div>
                  )
                })}
              </div>
            </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="flex flex-wrap gap-6">
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

              <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Test email recipient</p>
                  <p className="text-xs text-gray-400">Leave blank to send to your account email</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {activeTab === 'departments' && <DepartmentsSection />}

      {activeTab === 'email_templates' && <EmailTemplatesSection />}

      {activeTab === 'directory' && (
        <div className="space-y-6">
          {dirError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dirError}</p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Directory Tabs &amp; Details</CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                Create as many tabs as you need, named however makes sense for your organisation. Each tab has its
                own set of details (columns) that you define, add to, or remove — nothing is fixed, including "Name".
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="New tab name (e.g. Head Office)" value={newDirTabName} onChange={(e) => setNewDirTabName(e.target.value)} />
                <Button onClick={handleAddDirTab} loading={dirSaving}>Add Tab</Button>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {dirTabs.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">No tabs yet.</p>}
                {dirTabs.map((t) => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      {renamingDirTabId === t.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input value={renameDirTabValue} onChange={(e) => setRenameDirTabValue(e.target.value)} autoFocus />
                          <Button size="sm" onClick={saveRenameDirTab}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setRenamingDirTabId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setExpandedDirTabId(expandedDirTabId === t.id ? null : t.id)}
                            className="text-sm text-gray-800 hover:text-blue-900 text-left"
                          >
                            {t.name} <span className="text-gray-400">({t.entry_count} entries, {t.custom_fields.length} details)</span>
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setExpandedDirTabId(expandedDirTabId === t.id ? null : t.id)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Manage details">
                              <Columns3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => startRenameDirTab(t)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Rename">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteDirTab(t.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {expandedDirTabId === t.id && (
                      <div className="px-4 pb-4 bg-gray-50">
                        <p className="text-xs text-gray-400 mb-2">Details for "{t.name}":</p>
                        <div className="flex gap-2 mb-2">
                          <Input placeholder="New detail name (e.g. Phone)" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} />
                          <Button size="sm" onClick={handleAddField} loading={dirSaving}>Add</Button>
                        </div>
                        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
                          {t.custom_fields.length === 0 && <p className="px-3 py-4 text-center text-gray-400 text-sm">No details yet for this tab.</p>}
                          {t.custom_fields.map((f) => (
                            <div key={f.id} className="flex items-center justify-between px-3 py-2">
                              {renamingFieldId === f.id ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <Input value={renameFieldValue} onChange={(e) => setRenameFieldValue(e.target.value)} autoFocus />
                                  <Button size="sm" onClick={saveRenameField}>Save</Button>
                                  <Button size="sm" variant="outline" onClick={() => setRenamingFieldId(null)}>Cancel</Button>
                                </div>
                              ) : (
                                <>
                                  <span className="text-sm text-gray-700">{f.name}</span>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => startRenameField(f)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Rename">
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteField(f.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'masters' && <MastersSection />}

      {activeTab === 'access' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Portal Categories Access</CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                Group Portals links into categories, and optionally restrict a category to specific roles. Categories
                themselves are also editable from Settings → Directory. (User role assignment is on the Users page.)
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="New category name" value={newPortalCatName} onChange={(e) => setNewPortalCatName(e.target.value)} />
                <Button onClick={handleAddPortalCategory} loading={dirSaving}>Add</Button>
              </div>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {portalCategories.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">No categories yet.</p>}
                {portalCategories.map((c) => (
                  <div key={c.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-gray-800">{c.name} <span className="text-gray-400">({c.portal_count})</span></span>
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          {c.allowed_roles.length === 0 ? (
                            <><Globe className="w-3 h-3" /> Visible to everyone</>
                          ) : (
                            <><UsersIcon className="w-3 h-3" /> Restricted to {c.allowed_role_names.join(', ')}</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openAccessEditor(c)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Manage access">
                          <UsersIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => deletePortalCategory(c.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {accessCategoryId === c.id && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2">
                        <p className="text-xs text-gray-500">Leave every role unchecked to keep this category visible to all users.</p>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {allRoles.map((r) => (
                            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700 px-1 py-1 hover:bg-gray-100 rounded cursor-pointer capitalize">
                              <input
                                type="checkbox"
                                checked={accessSelectedIds.includes(r.id)}
                                onChange={() => toggleAccessRole(r.id)}
                              />
                              {r.name.replace('_', ' ')}
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => setAccessCategoryId(null)}>Cancel</Button>
                          <Button size="sm" onClick={saveAccess} loading={dirSaving}>Save Access</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'roles' && (
        <RolesSection roles={allRoles} onRolesChange={setAllRoles} currentUserId={user?.id ?? null} />
      )}

      {activeTab === 'backup' && (
        <Card>
          <CardHeader>
            <CardTitle>Full System Backup</CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              Download everything in one file: a consistent database snapshot plus every uploaded
              file (ticket attachments, avatars, branding logo/favicon).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5">
              <p className="text-sm text-gray-700 font-medium">This backup includes:</p>
              <ul className="text-sm text-gray-500 list-disc list-inside space-y-0.5">
                <li>The full database (tickets, users, departments, settings, audit log, everything)</li>
                <li>All uploaded files under <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">media/</code></li>
              </ul>
            </div>
            {backupError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{backupError}</p>
            )}
            <Button onClick={handleFullBackup} loading={backupLoading} className="gap-1.5">
              <Download className="w-4 h-4" /> Download Full Backup
            </Button>
            <p className="text-xs text-gray-400">
              This can take a moment to generate for a large system — the download starts once it's ready.
            </p>
          </CardContent>
        </Card>
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
