'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/app/lib/api'
import { User, Department, Role } from '@/app/lib/types'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select } from '@/app/components/ui/select'
import { Modal } from '@/app/components/ui/modal'
import { Badge } from '@/app/components/ui/badge'
import { useHasPerm } from '@/app/lib/store'
import { Plus, Edit, UserX, UserCheck, Trash2, AlertTriangle, History, LogIn, LogOut, Upload } from 'lucide-react'
import { formatDateShort, formatDate } from '@/app/lib/utils'

interface LoginLog {
  id: number
  action: string
  action_display: string
  ip_address: string | null
  timestamp: string
}

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', role: '', department: '', password: '', assignable_roles: [] as number[] }

export default function UsersPage() {
  const canAdd = useHasPerm('users', 'add')
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // Login history modal
  const [historyUser, setHistoryUser] = useState<User | null>(null)
  const [historyLogs, setHistoryLogs] = useState<LoginLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const fetchAll = async () => {
    const [usersRes, deptsRes, rolesRes] = await Promise.all([
      api.get(`/auth/users/${search ? `?search=${search}` : ''}`),
      api.get('/departments/?is_active=true'),
      api.get('/auth/roles/'),
    ])
    setUsers(usersRes.data.results ?? usersRes.data)
    setDepartments(deptsRes.data.results ?? deptsRes.data)
    setRoles(rolesRes.data.results ?? rolesRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [search])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, role: roles[0] ? String(roles[0].id) : '' })
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (user: User) => {
    setEditing(user)
    setForm({
      first_name: user.first_name, last_name: user.last_name,
      email: user.email, phone: user.phone, role: String(user.role),
      department: String(user.department ?? ''), password: '',
      assignable_roles: user.assignable_roles ?? [],
    })
    setErrors({})
    setModalOpen(true)
  }

  const toggleAssignableRole = (roleId: number) => {
    setForm((f) => ({
      ...f,
      assignable_roles: f.assignable_roles.includes(roleId)
        ? f.assignable_roles.filter((id) => id !== roleId)
        : [...f.assignable_roles, roleId],
    }))
  }

  const handleSave = async () => {
    const e: Record<string, string> = {}
    if (!form.first_name.trim()) e.first_name = 'Required'
    if (!form.last_name.trim()) e.last_name = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    if (!form.department) e.department = 'Department is required'
    if (!editing && !form.password.trim()) e.password = 'Password required for new users'
    if (Object.keys(e).length) { setErrors(e); return }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        first_name: form.first_name, last_name: form.last_name,
        email: form.email, phone: form.phone, role: Number(form.role),
        department: form.department ? Number(form.department) : null,
        assignable_roles: form.assignable_roles.filter((id) => id !== Number(form.role)),
      }
      if (form.password) payload.password = form.password

      if (editing) {
        const res = await api.patch(`/auth/users/${editing.id}/`, payload)
        setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, ...res.data } : u)))
      } else {
        await api.post('/auth/users/', payload)
        await fetchAll()
      }
      setModalOpen(false)
    } catch (err: any) {
      const data = err.response?.data
      if (data) setErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user: User) => {
    const res = await api.patch(`/auth/users/${user.id}/`, { is_active: !user.is_active })
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...res.data } : u)))
  }

  const deleteUser = async (id: number) => {
    await api.delete(`/auth/users/${id}/`)
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setDeleteConfirmId(null)
  }

  const openHistory = async (user: User) => {
    setHistoryUser(user)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await api.get(`/audit/?user=${user.id}&action=login&ordering=-timestamp&page_size=50`)
      const loginLogs = res.data.results ?? res.data
      const res2 = await api.get(`/audit/?user=${user.id}&action=logout&ordering=-timestamp&page_size=50`)
      const logoutLogs = res2.data.results ?? res2.data
      const combined = [...loginLogs, ...logoutLogs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      setHistoryLogs(combined)
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{users.length} users</p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <Link href="/settings?tab=masters">
              <Button variant="outline"><Upload className="w-4 h-4 mr-1.5" /> Master Upload</Button>
            </Link>
          )}
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Add User</Button>
        </div>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Name', 'Email', 'Role', 'Department', 'Status', 'Joined', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : users.map((user) => (
                deleteConfirmId === user.id ? (
                  <tr key={user.id} className="border-b border-red-100 bg-red-50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-sm text-red-700 flex-1">
                          Delete <strong>{user.full_name}</strong>? Their name will be anonymised as a sequential alias (e.g. <strong>#name1</strong>) in all records. This cannot be undone.
                        </span>
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center">
                        {(user.first_name[0] ?? '?').toUpperCase()}{(user.last_name[0] ?? '').toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{user.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className="bg-gray-100 text-gray-700 border-gray-200 capitalize">{user.role_detail?.name.replace('_', ' ')}</Badge>
                      {user.assignable_roles_detail?.length > 0 && (
                        <span className="text-xs text-gray-400" title={user.assignable_roles_detail.map((r) => r.name).join(', ')}>
                          +{user.assignable_roles_detail.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.department_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDateShort(user.date_joined)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openHistory(user)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-700" title="Login History">
                        <History className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(user)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActive(user)} className={`p-1.5 rounded hover:bg-gray-100 ${user.is_active ? 'text-gray-500' : 'text-green-600'}`} title={user.is_active ? 'Deactivate' : 'Activate'}>
                        {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setDeleteConfirmId(user.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete & anonymise">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Login History Modal ── */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Login History — ${historyUser?.full_name ?? ''}`} size="lg">
        <div className="p-6">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-900" />
            </div>
          ) : historyLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No login history found for this user.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date & Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          log.action === 'login'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          {log.action === 'login'
                            ? <LogIn className="w-3 h-3" />
                            : <LogOut className="w-3 h-3" />}
                          {log.action_display}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(log.timestamp)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name *" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} error={errors.first_name} />
            <Input label="Last Name *" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} error={errors.last_name} />
          </div>
          <Input label="Email *" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Role"
              options={roles.map((r) => ({ value: r.id, label: r.name.replace('_', ' ') }))}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <Select
              label="Department *"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Select department..."
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              error={errors.department}
            />
          </div>
          <Input
            label={editing ? 'New Password (leave blank to keep)' : 'Password *'}
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Roles (switchable)</label>
            <p className="text-xs text-gray-400 mb-2">
              The user can switch between "Role" above and any of these from their profile — useful for staff who wear more than one hat.
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.filter((r) => String(r.id) !== form.role).map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => toggleAssignableRole(r.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                    form.assignable_roles.includes(r.id)
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {r.name.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Create User'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
