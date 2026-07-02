'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { Role, PermissionCatalogModule } from '@/app/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Plus, Trash2, ShieldAlert, Crown, Users as UsersIcon, ChevronDown, ChevronRight } from 'lucide-react'

interface RolesSectionProps {
  roles: Role[]
  onRolesChange: (roles: Role[]) => void
  currentUserId: number | null
}

export function RolesSection({ roles, onRolesChange }: RolesSectionProps) {
  const [catalog, setCatalog] = useState<PermissionCatalogModule[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Record<number, string>>({})

  useEffect(() => {
    api.get('/auth/permissions/').then((r) => setCatalog(r.data))
  }, [])

  const refetchRoles = async () => {
    const res = await api.get('/auth/roles/')
    onRolesChange(res.data.results ?? res.data)
  }

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return
    setCreating(true)
    try {
      await api.post('/auth/roles/', { name: newRoleName.trim(), is_super: false, permissions: [] })
      setNewRoleName('')
      await refetchRoles()
    } catch (e: any) {
      alert(e.response?.data?.name?.[0] || e.response?.data?.[0] || 'Could not create role.')
    } finally {
      setCreating(false)
    }
  }

  const setRoleError = (roleId: number, msg: string) => setError((p) => ({ ...p, [roleId]: msg }))
  const clearRoleError = (roleId: number) => setError((p) => { const e = { ...p }; delete e[roleId]; return e })

  const updateRole = async (role: Role, patch: Partial<Role>) => {
    setSaving(true)
    clearRoleError(role.id)
    try {
      const res = await api.patch(`/auth/roles/${role.id}/`, patch)
      onRolesChange(roles.map((r) => (r.id === role.id ? res.data : r)))
    } catch (e: any) {
      const msg = e.response?.data?.non_field_errors?.[0] || e.response?.data?.permissions?.[0] || 'Could not save changes.'
      setRoleError(role.id, msg)
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (role: Role, key: string) => {
    const has = role.permissions.includes(key)
    const next = has ? role.permissions.filter((p) => p !== key) : [...role.permissions, key]
    updateRole(role, { permissions: next })
  }

  const toggleModuleView = (role: Role, mod: PermissionCatalogModule) => {
    // convenience: toggling the module label checks/unchecks every action in that row
    const keys = mod.actions.map((a) => a.key)
    const allOn = keys.every((k) => role.permissions.includes(k))
    const next = allOn
      ? role.permissions.filter((p) => !keys.includes(p))
      : Array.from(new Set([...role.permissions, ...keys]))
    updateRole(role, { permissions: next })
  }

  const deleteRole = async (role: Role) => {
    if (!confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return
    try {
      await api.delete(`/auth/roles/${role.id}/`)
      await refetchRoles()
    } catch (e: any) {
      alert(e.response?.data?.[0] || e.response?.data?.detail || 'Could not delete this role.')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Roles &amp; Permissions</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Define exactly what each role can see and do, per page. Built-in roles (end_user, agent, manager,
            admin) are regular rows here - rename, edit, or delete them freely. A role marked{' '}
            <span className="font-semibold">Super</span> bypasses every check below and always sees/does
            everything - at least one role must remain Super so nobody can lock themselves out of Settings.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="New role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            <Button onClick={handleAddRole} loading={creating}>
              <Plus className="w-4 h-4 mr-1" /> Add Role
            </Button>
          </div>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {roles.map((role) => {
              const expanded = expandedId === role.id
              return (
                <div key={role.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : role.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <input
                        className="text-sm font-medium text-gray-800 bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1 -mx-1 capitalize"
                        value={role.name}
                        onChange={(e) => onRolesChange(roles.map((r) => (r.id === role.id ? { ...r, name: e.target.value } : r)))}
                        onBlur={(e) => updateRole(role, { name: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <UsersIcon className="w-3.5 h-3.5" /> {role.user_count}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={role.is_super}
                        onChange={(e) => updateRole(role, { is_super: e.target.checked })}
                      />
                      <Crown className="w-3.5 h-3.5 text-amber-500" /> Super
                    </label>
                    <button
                      onClick={() => deleteRole(role)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                      title="Delete role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {error[role.id] && (
                    <div className="mx-4 mb-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" /> {error[role.id]}
                    </div>
                  )}

                  {expanded && (
                    <div className="px-4 pb-4">
                      {role.is_super ? (
                        <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                          This role is Super - it already has full access to every page and action, so individual
                          rights below are not used.
                        </p>
                      ) : (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-100">
                              {catalog.map((mod) => (
                                <tr key={mod.module} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 w-48">
                                    <button
                                      className="text-gray-700 font-medium text-left hover:underline"
                                      onClick={() => toggleModuleView(role, mod)}
                                      title="Toggle all"
                                    >
                                      {mod.module_label}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                      {mod.actions.map((a) => (
                                        <label key={a.key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={role.permissions.includes(a.key)}
                                            onChange={() => togglePermission(role, a.key)}
                                          />
                                          {a.label}
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {roles.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">No roles yet.</p>}
          </div>
          {saving && <p className="text-xs text-gray-400">Saving…</p>}
        </CardContent>
      </Card>
    </div>
  )
}
