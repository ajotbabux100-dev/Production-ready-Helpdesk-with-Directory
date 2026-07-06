'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/app/lib/api'
import { StaffDirectoryEntry, DirectoryTab, Portal, PortalCategory } from '@/app/lib/types'
import { useHasPerm } from '@/app/lib/store'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select } from '@/app/components/ui/select'
import { Modal } from '@/app/components/ui/modal'
import { BookOpen, Link as LinkIcon, Plus, Edit, Trash2, ExternalLink, Settings2, Upload, Search, X } from 'lucide-react'

export default function DirectoryPage() {
  const isAdmin = useHasPerm('settings', 'view')
  const canEditEntries = useHasPerm('directory_tabs', 'edit')
  const canDeleteEntries = useHasPerm('directory_tabs', 'delete')
  const canEditPortals = useHasPerm('directory_portals', 'edit')
  const canDeletePortals = useHasPerm('directory_portals', 'delete')

  const [tabs, setTabs] = useState<DirectoryTab[]>([])
  const [activeTab, setActiveTab] = useState<number | 'portals' | null>(null)
  const isPortalsView = activeTab === 'portals'
  const canAddEdit = isPortalsView ? canEditPortals : canEditEntries
  const canDelete = isPortalsView ? canDeletePortals : canDeleteEntries
  const [entries, setEntries] = useState<StaffDirectoryEntry[]>([])
  const [portals, setPortals] = useState<Portal[]>([])
  const [categories, setCategories] = useState<PortalCategory[]>([])
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const activeTabObj = typeof activeTab === 'number' ? tabs.find((t) => t.id === activeTab) ?? null : null
  const activeFields = activeTabObj?.custom_fields ?? []

  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<StaffDirectoryEntry | null>(null)
  const [entryValues, setEntryValues] = useState<Record<string, string>>({})

  const [portalModalOpen, setPortalModalOpen] = useState(false)
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null)
  const [portalForm, setPortalForm] = useState({ name: '', url: '', category: '' })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchTabs = async () => {
    const res = await api.get('/directory/tabs/')
    const rows: DirectoryTab[] = res.data.results ?? res.data
    setTabs(rows)
    return rows
  }

  const fetchEntries = async (tabId: number) => {
    const res = await api.get(`/directory/entries/?tab=${tabId}`)
    setEntries(res.data.results ?? res.data)
    setLoading(false)
  }

  const fetchPortals = async () => {
    const res = await api.get('/directory/portals/')
    setPortals(res.data.results ?? res.data)
    setLoading(false)
  }

  const fetchCategories = async () => {
    const res = await api.get('/directory/portal-categories/')
    setCategories(res.data.results ?? res.data)
  }

  // Initial load: fetch tabs, land on the first one (or Portals if none exist).
  useEffect(() => {
    fetchTabs().then((rows) => {
      setActiveTab(rows.length > 0 ? rows[0].id : 'portals')
    })
  }, [])

  useEffect(() => {
    if (activeTab === null) return
    setLoading(true)
    setSearch('')
    if (activeTab === 'portals') {
      fetchPortals()
      fetchCategories()
    } else {
      fetchEntries(activeTab)
    }
  }, [activeTab])

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const searchLower = search.trim().toLowerCase()
  const visiblePortals = (activeCategory === 'all' ? portals : portals.filter((p) => p.category === activeCategory))
    .filter((p) => !searchLower || [p.name, p.url, p.category_name].some((v) => v?.toLowerCase().includes(searchLower)))
  const visibleEntries = entries.filter((e) =>
    !searchLower || activeFields.some((f) => (e.values[String(f.id)] || '').toLowerCase().includes(searchLower))
  )

  const openCreateEntry = () => {
    setEditingEntry(null)
    setEntryValues({})
    setError('')
    setEntryModalOpen(true)
  }

  const openEditEntry = (entry: StaffDirectoryEntry) => {
    setEditingEntry(entry)
    setEntryValues({ ...entry.values })
    setError('')
    setEntryModalOpen(true)
  }

  const handleSaveEntry = async () => {
    if (typeof activeTab !== 'number') return
    setSaving(true)
    try {
      const payload = { tab: activeTab, values: entryValues }
      if (editingEntry) {
        await api.patch(`/directory/entries/${editingEntry.id}/`, payload)
      } else {
        await api.post('/directory/entries/', payload)
      }
      setEntryModalOpen(false)
      fetchEntries(activeTab)
      fetchTabs()
    } catch (e: any) {
      setError(e.response?.data?.values?.[0] || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: number) => {
    if (!confirm('Delete this entry?')) return
    await api.delete(`/directory/entries/${id}/`)
    setEntries((prev) => prev.filter((e) => e.id !== id))
    fetchTabs()
  }

  const openCreatePortal = () => {
    setEditingPortal(null)
    setPortalForm({ name: '', url: '', category: activeCategory === 'all' ? '' : String(activeCategory) })
    setError('')
    setPortalModalOpen(true)
  }

  const openEditPortal = (portal: Portal) => {
    setEditingPortal(portal)
    setPortalForm({ name: portal.name, url: portal.url, category: portal.category ? String(portal.category) : '' })
    setError('')
    setPortalModalOpen(true)
  }

  const handleSavePortal = async () => {
    if (!portalForm.name.trim()) { setError('Name is required'); return }
    if (!/^https?:\/\//.test(portalForm.url)) { setError('URL must start with http:// or https://'); return }
    setSaving(true)
    try {
      const payload = {
        name: portalForm.name,
        url: portalForm.url,
        category: portalForm.category ? Number(portalForm.category) : null,
      }
      if (editingPortal) {
        await api.patch(`/directory/portals/${editingPortal.id}/`, payload)
      } else {
        await api.post('/directory/portals/', payload)
      }
      setPortalModalOpen(false)
      fetchPortals()
    } catch (e: any) {
      setError(e.response?.data?.name?.[0] || e.response?.data?.url?.[0] || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const deletePortal = async (id: number) => {
    if (!confirm('Delete this portal?')) return
    await api.delete(`/directory/portals/${id}/`)
    setPortals((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-900" />
          <h1 className="text-2xl font-bold text-gray-900">Directory</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/settings?tab=masters">
              <Button variant="outline"><Upload className="w-4 h-4 mr-1.5" /> Master Upload</Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/settings?tab=directory">
              <Button variant="outline"><Settings2 className="w-4 h-4 mr-1.5" /> Manage Tabs &amp; Categories</Button>
            </Link>
          )}
          {canAddEdit && activeTab === 'portals' && (
            <Button onClick={openCreatePortal}><Plus className="w-4 h-4 mr-1.5" /> Add Portal</Button>
          )}
          {canAddEdit && typeof activeTab === 'number' && (
            <Button onClick={openCreateEntry}><Plus className="w-4 h-4 mr-1.5" /> Add Entry</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === t.id ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.name}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('portals')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'portals' ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" /> Portals
        </button>
        {tabs.length === 0 && activeTab !== 'portals' && (
          <p className="text-sm text-gray-400 px-1 py-1.5">
            No tabs yet — {isAdmin ? <>use "Manage Tabs &amp; Categories" above to create one.</> : 'ask an admin to create one in Settings.'}
          </p>
        )}
      </div>

      {(activeTab === 'portals' || typeof activeTab === 'number') && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={activeTab === 'portals' ? 'Search portals...' : 'Search entries...'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {activeTab === 'portals' && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium ${activeCategory === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${activeCategory === c.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {c.name} ({c.portal_count})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
        </div>
      ) : activeTab === 'portals' ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</th>
                {canAddEdit && <th className="w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visiblePortals.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{portals.length === 0 ? 'No portals added yet.' : 'No portals match your search.'}</td></tr>
              )}
              {visiblePortals.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <div className="flex items-center gap-2">
                      {p.favicon_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.favicon_url} alt="" className="w-4 h-4 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.category_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{p.category_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1">
                      {p.url} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  {canAddEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEditPortal(p)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        {canDelete && (
                          <button onClick={() => deletePortal(p.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : typeof activeTab === 'number' ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white overflow-x-auto">
          {activeFields.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 border-b border-gray-100">
              This tab has no details defined yet — {isAdmin ? <>manage them from Settings &rarr; Directory.</> : 'ask an admin to add some in Settings.'}
            </p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {activeFields.map((f) => (
                  <th key={f.id} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{f.name}</th>
                ))}
                {canAddEdit && <th className="w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleEntries.length === 0 && (
                <tr><td colSpan={activeFields.length + 1} className="px-4 py-8 text-center text-gray-400">{entries.length === 0 ? 'No entries yet.' : 'No entries match your search.'}</td></tr>
              )}
              {visibleEntries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  {activeFields.map((f, i) => (
                    <td key={f.id} className={`px-4 py-3 ${i === 0 ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{e.values[String(f.id)] || ''}</td>
                  ))}
                  {canAddEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEditEntry(e)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        {canDelete && (
                          <button onClick={() => deleteEntry(e.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 px-1 py-6 text-center">
          {isAdmin ? 'Create a tab in Settings → Directory to start adding entries.' : 'No directory tabs have been set up yet.'}
        </p>
      )}

      {/* Entry Modal */}
      <Modal open={entryModalOpen} onClose={() => setEntryModalOpen(false)} title={editingEntry ? 'Edit Entry' : 'Add Entry'}>
        <div className="p-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
          {activeFields.length === 0 ? (
            <p className="text-xs text-gray-400">This tab has no details defined yet. Close this and add some from Settings &rarr; Directory (e.g. Phone, Email, Location).</p>
          ) : (
            activeFields.map((f) => (
              <Input
                key={f.id}
                label={f.name}
                value={entryValues[String(f.id)] || ''}
                onChange={(ev) => setEntryValues((v) => ({ ...v, [String(f.id)]: ev.target.value }))}
              />
            ))
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setEntryModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEntry} loading={saving}>{editingEntry ? 'Save Changes' : 'Add Entry'}</Button>
          </div>
        </div>
      </Modal>

      {/* Portal Modal */}
      <Modal open={portalModalOpen} onClose={() => setPortalModalOpen(false)} title={editingPortal ? 'Edit Portal' : 'Add Portal'}>
        <div className="p-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
          <Input label="Name *" value={portalForm.name} onChange={(ev) => setPortalForm((f) => ({ ...f, name: ev.target.value }))} />
          <Input label="URL *" placeholder="https://" value={portalForm.url} onChange={(ev) => setPortalForm((f) => ({ ...f, url: ev.target.value }))} />
          <Select
            label="Category"
            placeholder="Uncategorised"
            options={categoryOptions}
            value={portalForm.category}
            onChange={(ev) => setPortalForm((f) => ({ ...f, category: ev.target.value }))}
          />
          <p className="text-xs text-gray-400">The logo is fetched automatically from the site itself — no upload needed.</p>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setPortalModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePortal} loading={saving}>{editingPortal ? 'Save Changes' : 'Add Portal'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
