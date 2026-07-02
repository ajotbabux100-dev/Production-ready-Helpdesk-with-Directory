'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { useHasPerm } from '@/app/lib/store'
import { VaultEntry } from '@/app/lib/types'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Modal } from '@/app/components/ui/modal'
import {
  KeyRound, Plus, Edit, Trash2, Eye, Copy, ExternalLink,
  Check, AlertTriangle, Lock,
} from 'lucide-react'

const emptyForm = { title: '', username: '', url: '', comment: '', password: '' }

export default function VaultPage() {
  const canAdd = useHasPerm('vault', 'add')
  const canEdit = useHasPerm('vault', 'edit')
  const canDelete = useHasPerm('vault', 'delete')

  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // Reveal/Copy flow: ask for account password, then either show the decrypted
  // value ('show') or copy it straight to the clipboard without ever
  // rendering it on screen ('copy').
  const [revealEntry, setRevealEntry] = useState<VaultEntry | null>(null)
  const [revealMode, setRevealMode] = useState<'show' | 'copy'>('show')
  const [revealPassword, setRevealPassword] = useState('')
  const [revealError, setRevealError] = useState('')
  const [revealLoading, setRevealLoading] = useState(false)
  const [revealedValue, setRevealedValue] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedDirectly, setCopiedDirectly] = useState(false)

  const fetchEntries = async () => {
    setLoadError('')
    try {
      const res = await api.get(`/vault/entries/${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      setEntries(res.data.results ?? res.data)
    } catch (err: any) {
      setLoadError(err.response?.status === 403 ? 'You do not have access to the Password Vault.' : 'Could not load vault entries.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEntries() }, [search])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (entry: VaultEntry) => {
    setEditing(entry)
    setForm({ title: entry.title, username: entry.username, url: entry.url, comment: entry.comment, password: '' })
    setErrors({})
    setModalOpen(true)
  }

  const handleSave = async () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Required'
    if (!form.username.trim()) e.username = 'Required'
    if (!editing && !form.password.trim()) e.password = 'Password is required'
    if (Object.keys(e).length) { setErrors(e); return }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        title: form.title, username: form.username, url: form.url, comment: form.comment,
      }
      if (form.password) payload.password = form.password

      if (editing) {
        await api.patch(`/vault/entries/${editing.id}/`, payload)
      } else {
        await api.post('/vault/entries/', payload)
      }
      setModalOpen(false)
      await fetchEntries()
    } catch (err: any) {
      const data = err.response?.data
      if (data) setErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await api.delete(`/vault/entries/${id}/`)
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setDeleteConfirmId(null)
  }

  const openReveal = (entry: VaultEntry, mode: 'show' | 'copy') => {
    setRevealEntry(entry)
    setRevealMode(mode)
    setRevealPassword('')
    setRevealError('')
    setRevealedValue('')
    setCopied(false)
    setCopiedDirectly(false)
  }

  const closeReveal = () => {
    setRevealEntry(null)
    setRevealPassword('')
    setRevealError('')
    setRevealedValue('')
    setCopied(false)
    setCopiedDirectly(false)
  }

  const handleConfirmReveal = async () => {
    if (!revealEntry) return
    setRevealLoading(true)
    setRevealError('')
    try {
      const res = await api.post(`/vault/entries/${revealEntry.id}/reveal/`, { password: revealPassword })
      if (revealMode === 'copy') {
        // Copy straight to clipboard - never assign the plaintext to state
        // that gets rendered, so it never appears on screen.
        await navigator.clipboard.writeText(res.data.password)
        setCopiedDirectly(true)
        setTimeout(closeReveal, 1200)
      } else {
        setRevealedValue(res.data.password)
      }
    } catch (err: any) {
      setRevealError(err.response?.data?.error || 'Could not reveal password.')
    } finally {
      setRevealLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!revealedValue) return
    await navigator.clipboard.writeText(revealedValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [copiedUsernameId, setCopiedUsernameId] = useState<number | null>(null)
  const handleCopyUsername = async (entry: VaultEntry) => {
    await navigator.clipboard.writeText(entry.username)
    setCopiedUsernameId(entry.id)
    setTimeout(() => setCopiedUsernameId(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-blue-900" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Password Vault</h1>
            <p className="text-sm text-gray-400">Private to your account - nobody else, including admins, can see your saved credentials.</p>
          </div>
        </div>
        {canAdd && (
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Add Credential</Button>
        )}
      </div>

      <Input
        placeholder="Search by title, username, or URL..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loadError ? (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {loadError}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
          <Lock className="w-8 h-8" />
          <p className="text-sm">No saved credentials yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                  {entry.url && (
                    <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-0.5">
                      {entry.url} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && (
                    <button onClick={() => openEdit(entry)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    deleteConfirmId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(entry.id)} className="text-xs font-medium text-red-600 hover:underline px-1">Confirm</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:underline px-1">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirmId(entry.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-20 flex-shrink-0 text-xs font-medium text-gray-400 uppercase tracking-wide">Username</span>
                  <span className="flex-1 text-sm font-mono text-gray-800 truncate">{entry.username}</span>
                  <button onClick={() => handleCopyUsername(entry)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0" title="Copy username">
                    {copiedUsernameId === entry.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 flex-shrink-0 text-xs font-medium text-gray-400 uppercase tracking-wide">Password</span>
                  <span className="flex-1 text-sm font-mono text-gray-400 tracking-widest">••••••••</span>
                  <button onClick={() => openReveal(entry, 'show')} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0" title="Reveal password">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => openReveal(entry, 'copy')} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0" title="Copy password (without showing it)">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {entry.comment && <p className="text-xs text-gray-400 pt-1">{entry.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Credential' : 'Add Credential'}>
        <div className="p-6 space-y-4">
          <Input label="Title *" placeholder="e.g. Office Router" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} error={errors.title} />
          <Input label="Username *" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} error={errors.username} />
          <Input
            label={editing ? 'Password (leave blank to keep current)' : 'Password *'}
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
          <Input label="URL" placeholder="https://..." value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} error={errors.url} />
          <Textarea label="Comment (optional)" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reveal / Copy Modal ── */}
      <Modal
        open={!!revealEntry}
        onClose={closeReveal}
        title={revealEntry ? `${revealMode === 'copy' ? 'Copy' : 'Reveal'}: ${revealEntry.title}` : ''}
        size="sm"
      >
        <div className="p-6 space-y-4">
          {copiedDirectly ? (
            <div className="flex flex-col items-center gap-2 py-4 text-green-600">
              <Check className="w-8 h-8" />
              <p className="text-sm font-medium">Copied to clipboard</p>
            </div>
          ) : !revealedValue ? (
            <>
              <p className="text-sm text-gray-500">
                {revealMode === 'copy'
                  ? 'Confirm your account password to copy this password to your clipboard - it will not be shown on screen.'
                  : 'Confirm your account password to reveal this credential.'}
              </p>
              <Input
                label="Your Account Password"
                type="password"
                autoFocus
                value={revealPassword}
                onChange={(e) => setRevealPassword(e.target.value)}
                error={revealError}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmReveal() }}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeReveal}>Cancel</Button>
                <Button onClick={handleConfirmReveal} loading={revealLoading} disabled={!revealPassword}>
                  {revealMode === 'copy' ? 'Copy' : 'Reveal'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <code className="flex-1 text-sm font-mono text-gray-800 truncate">{revealedValue}</code>
                <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 flex-shrink-0" title="Copy">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">This is only shown once - close this dialog and reveal again if needed.</p>
              <div className="flex justify-end pt-2">
                <Button onClick={closeReveal}>Done</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
