'use client'
import { useState, useRef } from 'react'
import { useAuthStore } from '@/app/lib/store'
import api from '@/app/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { User as UserIcon, Lock, Camera, CheckCircle2, Shield, RefreshCw, X } from 'lucide-react'

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [switchingRoleId, setSwitchingRoleId] = useState<number | null>(null)
  const [roleError, setRoleError] = useState('')

  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    phone: user?.phone ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  if (!user) return null

  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setErrors({})
    try {
      const res = await api.patch('/auth/users/me/', form)
      setUser(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      const data = err.response?.data
      if (data) setErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
    } finally {
      setSaving(false)
    }
  }

  const [avatarLoading, setAvatarLoading] = useState(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const res = await api.patch('/auth/users/me/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUser(res.data)
    } catch {}
    finally {
      setAvatarLoading(false)
      e.target.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarLoading(true)
    try {
      const res = await api.patch('/auth/users/me/', { avatar: null })
      setUser(res.data)
    } catch {}
    finally { setAvatarLoading(false) }
  }

  const handleSwitchRole = async (roleId: number) => {
    if (!user || roleId === user.role) return
    setSwitchingRoleId(roleId)
    setRoleError('')
    try {
      const res = await api.post('/auth/users/switch-role/', { role: roleId })
      setUser(res.data)
    } catch (err: any) {
      setRoleError(err.response?.data?.error || 'Could not switch role.')
    } finally {
      setSwitchingRoleId(null)
    }
  }

  const handleChangePassword = async () => {
    setPwSaving(true)
    setPwSaved(false)
    setPwErrors({})
    if (pwForm.new_password !== pwForm.confirm) {
      setPwErrors({ confirm: 'Passwords do not match' })
      setPwSaving(false)
      return
    }
    try {
      await api.post('/auth/users/change_password/', {
        old_password: pwForm.old_password,
        new_password: pwForm.new_password,
      })
      setPwForm({ old_password: '', new_password: '', confirm: '' })
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2500)
    } catch (err: any) {
      const data = err.response?.data
      if (data) setPwErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <UserIcon className="w-6 h-6 text-blue-900" />
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <div className="relative">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-900 text-white text-lg font-bold flex items-center justify-center uppercase">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarLoading}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-blue-900 disabled:opacity-60"
              title="Change photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            {user.avatar && (
              <button
                onClick={handleRemoveAvatar}
                disabled={avatarLoading}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-red-600 disabled:opacity-60"
                title="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">{user.full_name}</p>
            <p className="text-sm text-gray-400">{user.email}</p>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 capitalize">
              {user.role_detail?.name.replace('_', ' ')}
            </span>
          </div>
        </CardContent>
      </Card>

      {user.assignable_roles_detail?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-4 h-4" /> Active Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-400">
              You've been granted more than one role. Switch your active role below — it changes what you can see and do until you switch back.
            </p>
            {roleError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{roleError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {[
                user.role_detail,
                // Whichever assignable role is currently active shows up as
                // `role_detail` above - exclude it here so it isn't rendered
                // (and keyed) twice, which breaks React's reconciliation and
                // leaves stale duplicate buttons on screen after switching.
                ...user.assignable_roles_detail.filter((r) => r.id !== user.role),
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSwitchRole(r.id)}
                  disabled={switchingRoleId !== null}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors capitalize disabled:opacity-60 ${
                    r.id === user.role
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {switchingRoleId === r.id
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : r.id === user.role && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {r.name.replace('_', ' ')}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              error={errors.first_name}
            />
            <Input
              label="Last Name"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              error={errors.last_name}
            />
          </div>
          <Input label="Email" value={user.email} disabled />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            error={errors.phone}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={pwForm.old_password}
            onChange={(e) => setPwForm((f) => ({ ...f, old_password: e.target.value }))}
            error={pwErrors.old_password}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="New Password"
              type="password"
              value={pwForm.new_password}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
              error={pwErrors.new_password}
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              error={pwErrors.confirm}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleChangePassword}
              loading={pwSaving}
              disabled={!pwForm.old_password || !pwForm.new_password}
            >
              Update Password
            </Button>
            {pwSaved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Password updated
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
