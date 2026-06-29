'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { User, Department } from '@/app/lib/types'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select } from '@/app/components/ui/select'
import { Modal } from '@/app/components/ui/modal'
import { Badge } from '@/app/components/ui/badge'
import { Plus, Edit, UserX, UserCheck } from 'lucide-react'
import { formatDateShort } from '@/app/lib/utils'

const ROLES = [
  { value: 'end_user', label: 'End User' },
  { value: 'agent', label: 'Agent' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrator' },
]

const ROLE_COLORS: Record<string, string> = {
  end_user: 'bg-gray-100 text-gray-700 border-gray-200',
  agent: 'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-red-100 text-red-700 border-red-200',
}

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', role: 'end_user', department: '', password: '' }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')

  const fetchAll = async () => {
    const [usersRes, deptsRes] = await Promise.all([
      api.get(`/auth/users/${search ? `?search=${search}` : ''}`),
      api.get('/departments/?is_active=true'),
    ])
    setUsers(usersRes.data.results ?? usersRes.data)
    setDepartments(deptsRes.data.results ?? deptsRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [search])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (user: User) => {
    setEditing(user)
    setForm({
      first_name: user.first_name, last_name: user.last_name,
      email: user.email, phone: user.phone, role: user.role,
      department: String(user.department ?? ''), password: '',
    })
    setErrors({})
    setModalOpen(true)
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
        email: form.email, phone: form.phone, role: form.role,
        department: form.department ? Number(form.department) : null,
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

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{users.length} users</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Add User</Button>
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
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center">
                        {user.first_name[0]}{user.last_name[0]}
                      </div>
                      <span className="font-medium text-gray-900">{user.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge className={ROLE_COLORS[user.role]}>{user.role.replace('_', ' ')}</Badge>
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
                      <button onClick={() => openEdit(user)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActive(user)} className={`p-1.5 rounded hover:bg-gray-100 ${user.is_active ? 'text-gray-500' : 'text-green-600'}`}>
                        {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name *" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} error={errors.first_name} />
            <Input label="Last Name *" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} error={errors.last_name} />
          </div>
          <Input label="Email *" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Role" options={ROLES} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
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
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Create User'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
