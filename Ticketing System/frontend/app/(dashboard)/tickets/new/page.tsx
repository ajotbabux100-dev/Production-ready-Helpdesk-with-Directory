'use client'
import { useState, useEffect } from 'react'
import api from '@/app/lib/api'
import { Department, TicketFormConfig, TicketCategory } from '@/app/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select } from '@/app/components/ui/select'
import { Textarea } from '@/app/components/ui/textarea'
import { ArrowLeft, Paperclip, X, Zap } from 'lucide-react'

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const DEFAULT_CONFIG: TicketFormConfig = {
  category_required: true,
  priority_required: false,
  department_required: true,
  location_required: false,
}

function req(label: string, required: boolean) {
  return required ? `${label} *` : label
}

export default function NewTicketPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [config, setConfig] = useState<TicketFormConfig>(DEFAULT_CONFIG)
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [form, setForm] = useState({
    title: '', description: '', category: '', priority: 'medium',
    department: '', location: '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/departments/?is_active=true'),
      api.get('/tickets/form-config/'),
      api.get('/tickets/categories/?active_only=true'),
    ]).then(([deptRes, cfgRes, catRes]) => {
      setDepartments(deptRes.data.results ?? deptRes.data)
      setConfig(cfgRes.data)
      setCategories(catRes.data.results ?? catRes.data)
    })
  }, [])

  // Re-fetch categories filtered by selected department
  useEffect(() => {
    const deptId = form.department
    const url = deptId
      ? `/tickets/categories/?active_only=true&department=${deptId}`
      : '/tickets/categories/?active_only=true'
    api.get(url).then((res) => {
      setCategories(res.data.results ?? res.data)
      // clear selected category if it's no longer in the list
      setForm((prev) => {
        const still = (res.data.results ?? res.data).some((c: TicketCategory) => c.slug === prev.category)
        return still ? prev : { ...prev, category: '' }
      })
    })
  }, [form.department])

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const e = { ...prev }; delete e[field]; return e })
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Title is required'
    if (!form.description.trim()) e.description = 'Description is required'
    if (config.category_required && !form.category) e.category = 'Category is required'
    if (config.priority_required && !form.priority) e.priority = 'Priority is required'
    if (config.department_required && !form.department) e.department = 'Department is required'
    if (config.location_required && !form.location.trim()) e.location = 'Location is required'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      const payload: Record<string, any> = {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        location: form.location,
      }
      if (form.department) payload.department = Number(form.department)

      const res = await api.post('/tickets/', payload)
      const ticketId = res.data.id

      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tickets/${ticketId}/add_attachment/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      window.location.href = `/tickets/${ticketId}`
    } catch (err: any) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        setErrors(Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])
        ))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/tickets">
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </a>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submit New Ticket</h1>
          <p className="text-sm text-gray-500">Fill in the details to submit a support request</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Ticket Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Title *"
              placeholder="Brief summary of the issue"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              error={errors.title}
            />
            <Textarea
              label="Description *"
              placeholder="Provide a detailed description of the issue, including steps to reproduce, error messages, etc."
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              error={errors.description}
              rows={6}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={req('Category', config.category_required)}
                options={categories.map((c) => ({ value: c.slug, label: c.name }))}
                placeholder="Select category..."
                value={form.category}
                onChange={(e) => {
                  const slug = e.target.value
                  handleChange('category', slug)
                  if (slug) {
                    const cat = categories.find((c) => c.slug === slug)
                    if (cat && cat.department_ids?.length === 1) {
                      const deptId = String(cat.department_ids[0])
                      if (form.department !== deptId) {
                        handleChange('department', deptId)
                        const dept = departments.find((d) => String(d.id) === deptId) || null
                        setSelectedDept(dept)
                      }
                    }
                  }
                }}
                error={errors.category}
              />
              <Select
                label={req('Priority', config.priority_required)}
                options={PRIORITIES}
                value={form.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                error={errors.priority}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Select
                  label={req('Department', config.department_required)}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  placeholder="Select department..."
                  value={form.department}
                  onChange={(e) => {
                    handleChange('department', e.target.value)
                    const dept = departments.find((d) => String(d.id) === e.target.value) || null
                    setSelectedDept(dept)
                  }}
                  error={errors.department}
                />
                {selectedDept && (selectedDept.auto_assign_to_name || selectedDept.manager_name) && (
                  <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                    Will be auto-assigned to{' '}
                    <span className="font-semibold">
                      {selectedDept.auto_assign_to_name || selectedDept.manager_name}
                    </span>
                  </div>
                )}
              </div>
              <Input
                label={req('Location', config.location_required)}
                placeholder="Room / Floor / Building"
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                error={errors.location}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => {
                  const newFiles = Array.from(e.target.files || [])
                  setFiles((prev) => [...prev, ...newFiles])
                }}
              />
              <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Paperclip className="w-4 h-4" /> Attach files
              </div>
            </label>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                    <span className="text-gray-700 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">Max 10MB per file. Supported: images, PDF, Word, Excel, text.</p>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <a href="/tickets">
            <Button variant="outline" type="button">Cancel</Button>
          </a>
          <Button type="submit" loading={loading}>Submit Ticket</Button>
        </div>
      </form>
    </div>
  )
}
