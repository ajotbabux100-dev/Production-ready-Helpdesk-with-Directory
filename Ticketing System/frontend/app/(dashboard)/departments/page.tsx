'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { Department, User } from '@/app/lib/types'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select } from '@/app/components/ui/select'
import { Textarea } from '@/app/components/ui/textarea'
import { Modal } from '@/app/components/ui/modal'
import { Building2, Plus, Users, Mail, Edit, PowerOff, Power, UserCheck, Tag, GitBranch, AtSign, Trash2, AlertTriangle } from 'lucide-react'

type DeptForm = {
  name: string
  description: string
  email: string
  manager: string
  auto_assign_to: string
  routing_mode: 'manager' | 'pool'
  mention_scope: 'department' | 'all'
}

const ROUTING_MODE_LABELS: Record<string, string> = {
  manager: 'Manager Assignment',
  pool: 'Department Pool',
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState<DeptForm>({ name: '', description: '', email: '', manager: '', auto_assign_to: '', routing_mode: 'manager', mention_scope: 'all' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const fetchDepts = async () => {
    const res = await api.get('/departments/')
    setDepartments(res.data.results ?? res.data)
    setLoading(false)
  }

  useEffect(() => { fetchDepts() }, [])

  const openCreate = async () => {
    setEditing(null)
    setForm({ name: '', description: '', email: '', manager: '', auto_assign_to: '', routing_mode: 'manager', mention_scope: 'all' })
    setError('')
    await loadAgents()
    setModalOpen(true)
  }

  const openEdit = async (dept: Department) => {
    setEditing(dept)
    setForm({
      name: dept.name,
      description: dept.description,
      email: dept.email,
      manager: dept.manager ? String(dept.manager) : '',
      auto_assign_to: dept.auto_assign_to ? String(dept.auto_assign_to) : '',
      routing_mode: dept.routing_mode ?? 'manager',
      mention_scope: dept.mention_scope ?? 'all',
    })
    setError('')
    await loadAgents()
    setModalOpen(true)
  }

  const loadAgents = async () => {
    if (agents.length > 0) return
    const res = await api.get('/auth/users/?is_active=true')
    const all: User[] = res.data.results ?? res.data
    setAgents(all.filter((u) => ['agent', 'manager', 'admin'].includes(u.role)))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Department name is required'); return }
    setSaving(true)
    try {
      const payload: Record<string, any> = {
        name: form.name,
        description: form.description,
        email: form.email,
        manager: form.manager ? Number(form.manager) : null,
        auto_assign_to: form.auto_assign_to ? Number(form.auto_assign_to) : null,
        routing_mode: form.routing_mode,
        mention_scope: form.mention_scope,
      }
      if (editing) {
        await api.patch(`/departments/${editing.id}/`, payload)
      } else {
        await api.post('/departments/', payload)
      }
      setModalOpen(false)
      fetchDepts()
    } catch (e: any) {
      setError(e.response?.data?.name?.[0] || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (dept: Department) => {
    await api.patch(`/departments/${dept.id}/`, { is_active: !dept.is_active })
    fetchDepts()
  }

  const deleteDept = async (id: number) => {
    await api.delete(`/departments/${id}/`)
    setDepartments((prev) => prev.filter((d) => d.id !== id))
    setDeleteConfirmId(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" /></div>
  }

  const agentOptions = agents.map((u) => ({ value: u.id, label: `${u.full_name} (${u.role})` }))

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500">{departments.length} departments configured</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Add Department</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <Card key={dept.id} className={!dept.is_active ? 'opacity-60' : ''}>
            <CardContent className="p-5">
              {/* Delete confirmation overlay */}
              {deleteConfirmId === dept.id && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      Delete <strong>{dept.name}</strong>? The department will be anonymised as a sequential alias (e.g. <strong>#dept1</strong>) in all ticket records. This cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteDept(dept.id)}
                      className="flex-1 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="flex-1 py-1.5 text-xs font-semibold border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-900" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(dept)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Edit">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(dept)} className={`p-1.5 rounded-md hover:bg-gray-100 ${dept.is_active ? 'text-gray-500' : 'text-green-600'}`} title={dept.is_active ? 'Deactivate' : 'Activate'}>
                    {dept.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setDeleteConfirmId(dept.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete & anonymise">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{dept.name}</h3>
              {dept.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{dept.description}</p>}

              <div className="space-y-1 mb-3">
                <p className={`text-xs flex items-center gap-1 font-medium ${dept.routing_mode === 'pool' ? 'text-violet-600' : 'text-gray-500'}`}>
                  <GitBranch className="w-3.5 h-3.5" />
                  {ROUTING_MODE_LABELS[dept.routing_mode] ?? 'Manager Assignment'}
                </p>
                <p className={`text-xs flex items-center gap-1 font-medium ${dept.mention_scope === 'department' ? 'text-blue-600' : 'text-gray-400'}`}>
                  <AtSign className="w-3.5 h-3.5" />
                  @mention: {dept.mention_scope === 'department' ? 'Department only' : 'All users'}
                </p>
                {dept.manager_name && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Manager: <span className="font-medium text-gray-700">{dept.manager_name}</span>
                  </p>
                )}
                {dept.auto_assign_to_name && dept.routing_mode !== 'pool' && (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> Auto-assign: <span className="font-medium">{dept.auto_assign_to_name}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {dept.member_count} members</span>
                {dept.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5 flex-shrink-0" /> {dept.email}</span>}
              </div>
              {dept.sla_policies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">SLA Policies</p>
                  <div className="grid grid-cols-2 gap-1">
                    {dept.sla_policies.map((sla) => (
                      <div key={sla.id} className="text-xs bg-gray-50 rounded-md px-2 py-1">
                        <span className="font-medium capitalize">{sla.priority}</span>: {sla.resolution_time_display}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dept.categories && dept.categories.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Categories
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dept.categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!dept.is_active && (
                <div className="mt-2 text-xs text-gray-400 font-medium">Inactive</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Department' : 'Add Department'}>
        <div className="p-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
          <Input
            label="Department Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
          />
          <Input
            label="Department Email"
            type="email"
            placeholder="dept@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Select
            label="Manager"
            options={agentOptions}
            placeholder="Select manager..."
            value={form.manager}
            onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
          />
          <div className="space-y-1">
            <Select
              label="Auto-Assign Tickets To"
              options={agentOptions}
              placeholder="None (use manager or round-robin)..."
              value={form.auto_assign_to}
              onChange={(e) => setForm((f) => ({ ...f, auto_assign_to: e.target.value }))}
            />
            <p className="text-xs text-gray-400">New tickets in this department will be assigned to this person automatically.</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Ticket Routing Mode</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'manager', label: 'Manager Assignment', desc: 'Manager assigns each ticket to a specific agent.' },
                { value: 'pool', label: 'Department Pool', desc: 'All members see new tickets. Anyone can claim and resolve.' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, routing_mode: opt.value }))}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    form.routing_mode === opt.value
                      ? 'border-blue-900 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-semibold ${form.routing_mode === opt.value ? 'text-blue-900' : 'text-gray-800'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">@Mention Scope</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'all', label: 'All Users', desc: 'Anyone in the system can be @mentioned in ticket comments.' },
                { value: 'department', label: 'Department Only', desc: 'Only members of this department appear in the @mention picker.' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mention_scope: opt.value }))}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    form.mention_scope === opt.value
                      ? 'border-blue-900 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-semibold ${form.mention_scope === opt.value ? 'text-blue-900' : 'text-gray-800'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editing ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
