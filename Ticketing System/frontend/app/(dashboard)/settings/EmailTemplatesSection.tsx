'use client'
import { useEffect, useRef, useState } from 'react'
import api from '@/app/lib/api'
import { EmailTemplate } from '@/app/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { RotateCcw, CheckCircle2 } from 'lucide-react'

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-900' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function TemplateCard({ template, onSaved }: { template: EmailTemplate; onSaved: (t: EmailTemplate) => void }) {
  const [isCustom, setIsCustom] = useState(template.is_custom)
  const [subject, setSubject] = useState(template.subject || template.default_subject)
  const [body, setBody] = useState(template.body || template.default_body)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastFocused = useRef<'subject' | 'body'>('body')

  const handleToggleCustom = (next: boolean) => {
    // Turning Custom on always starts from real, editable text - the saved
    // custom version if there is one, otherwise the built-in default (never
    // a blank box the admin has to rewrite from scratch).
    if (next) {
      if (!subject) setSubject(template.default_subject)
      if (!body) setBody(template.default_body)
    }
    setIsCustom(next)
  }

  const insertPlaceholder = (token: string) => {
    const text = `{${token}}`
    if (lastFocused.current === 'subject') {
      const pos = subjectRef.current?.selectionStart ?? subject.length
      setSubject(subject.slice(0, pos) + text + subject.slice(pos))
    } else {
      const pos = bodyRef.current?.selectionStart ?? body.length
      setBody(body.slice(0, pos) + text + body.slice(pos))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await api.patch(`/notifications/email-templates/${template.notification_type}/`, {
        is_custom: isCustom, subject, body,
      })
      onSaved(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      const data = err.response?.data
      setError(data && typeof data === 'object' ? Object.values(data).flat().join(' ') : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setSubject(template.default_subject)
    setBody(template.default_body)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{template.label}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{isCustom ? 'Custom' : 'Default'}</span>
          <Toggle value={isCustom} onChange={handleToggleCustom} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isCustom && (
          <p className="text-xs text-gray-400 -mt-1">
            Showing the built-in default text below. Turn "Custom" on to edit it directly -
            no need to write a new one from scratch.
          </p>
        )}
        <Input
          ref={subjectRef}
          label="Subject"
          value={subject}
          disabled={!isCustom}
          onFocus={() => { lastFocused.current = 'subject' }}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          ref={bodyRef}
          label="Body"
          rows={6}
          value={body}
          disabled={!isCustom}
          onFocus={() => { lastFocused.current = 'body' }}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400">Click a placeholder to insert it at the cursor:</p>
          <div className="flex flex-wrap gap-1.5">
            {template.placeholders.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!isCustom}
                onClick={() => insertPlaceholder(p)}
                className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50"
              >
                {'{' + p + '}'}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isCustom}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset to default text
          </button>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EmailTemplatesSection() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/notifications/email-templates/')
      .then((r) => setTemplates(r.data.results ?? r.data))
      .finally(() => setLoading(false))
  }, [])

  const handleSaved = (updated: EmailTemplate) => {
    setTemplates((prev) => prev.map((t) => t.notification_type === updated.notification_type ? updated : t))
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-10 text-center">Loading email templates...</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Customize the subject and wording of each system email. Turn &quot;Custom&quot; on for a
        template to override the built-in default text below — placeholders like{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{'{ticket_number}'}</code> are
        filled in automatically when the email is sent.
      </p>
      {templates.map((t) => (
        <TemplateCard key={t.notification_type} template={t} onSaved={handleSaved} />
      ))}
    </div>
  )
}
