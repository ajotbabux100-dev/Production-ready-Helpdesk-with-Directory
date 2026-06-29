'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/app/lib/store'
import api from '@/app/lib/api'
import { Ticket, User, STATUS_COLORS, PRIORITY_COLORS } from '@/app/lib/types'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Textarea } from '@/app/components/ui/textarea'
import { formatDate } from '@/app/lib/utils'
import {
  ArrowLeft, Paperclip, Send, AlertTriangle, Clock, User as UserIcon,
  Building2, MapPin, Tag, Lock, MessageSquare, CheckCircle2, RefreshCw,
} from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_user', label: 'Pending User Response' },
  { value: 'pending_vendor', label: 'Pending Vendor' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const PRIORITY_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

function SLAStatus({ ticket }: { ticket: Ticket }) {
  if (!ticket.sla_resolution_due) return null
  const due = new Date(ticket.sla_resolution_due)
  const now = Date.now()
  const diff = due.getTime() - now
  const breached = ticket.is_sla_resolution_breached

  if (breached) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold">SLA Breached</p>
          <p className="text-xs opacity-80">Due: {formatDate(ticket.sla_resolution_due)}</p>
        </div>
      </div>
    )
  }

  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const timeStr = hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m`
  const urgent = mins < 120

  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${urgent ? 'text-orange-600 bg-orange-50 border border-orange-200' : 'text-gray-600 bg-gray-50 border border-gray-200'}`}>
      <Clock className="w-4 h-4 flex-shrink-0" />
      <div>
        <p className="text-xs font-semibold">{urgent ? `Due in ${timeStr}` : 'SLA On Track'}</p>
        <p className="text-xs opacity-70">{formatDate(ticket.sla_resolution_due)}</p>
      </div>
    </div>
  )
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const parts = name.split(' ')
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  const s = size === 'md' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-xs'
  return (
    <div className={`${s} rounded-full bg-blue-900 text-white font-bold flex items-center justify-center flex-shrink-0 uppercase`}>
      {initials}
    </div>
  )
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const [agents, setAgents] = useState<User[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchTicket()
    if (user && user.role !== 'end_user') {
      api.get('/auth/users/agents/').then((r) => setAgents(r.data)).catch(() => {})
    }
  }, [id])

  const fetchTicket = async () => {
    try {
      const res = await api.get<Ticket>(`/tickets/${id}/`)
      setTicket(res.data)
      setSelectedStatus(res.data.status)
    } catch { router.push('/tickets') }
    finally { setLoading(false) }
  }

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setCommentLoading(true)
    try {
      await api.post(`/tickets/${id}/add_comment/`, { body: comment, is_internal: isInternal })
      setComment('')
      fetchTicket()
    } finally { setCommentLoading(false) }
  }

  const updateStatus = async () => {
    if (!selectedStatus || selectedStatus === ticket?.status) return
    setActionLoading(true)
    try {
      await api.patch(`/tickets/${id}/update_status/`, { status: selectedStatus })
      fetchTicket()
    } finally { setActionLoading(false) }
  }

  const assignAgent = async () => {
    if (!selectedAgent) return
    setActionLoading(true)
    try {
      await api.patch(`/tickets/${id}/assign/`, { assigned_to: selectedAgent })
      setSelectedAgent('')
      fetchTicket()
    } finally { setActionLoading(false) }
  }

  const reopenTicket = async () => {
    setActionLoading(true)
    try {
      await api.post(`/tickets/${id}/reopen/`)
      fetchTicket()
    } finally { setActionLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
      </div>
    )
  }
  if (!ticket) return null

  const isAgent = user?.role !== 'end_user'
  const visibleComments = ticket.comments.filter((c) => !c.is_internal || isAgent)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-start gap-3">
        <Link href="/tickets">
          <button className="p-2 mt-1 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-sm font-mono text-gray-400">{ticket.ticket_number}</span>
            <div className={`h-4 w-1 rounded-full ${PRIORITY_BAR[ticket.priority] || 'bg-gray-300'}`} />
            <Badge className={PRIORITY_COLORS[ticket.priority]}>{ticket.priority_display}</Badge>
            <Badge className={STATUS_COLORS[ticket.status]}>{ticket.status_display}</Badge>
            {ticket.is_sla_resolution_breached && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> SLA Breached
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{ticket.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: description + activity ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Description</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>

            {ticket.location && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50 text-sm text-gray-500">
                <MapPin className="w-4 h-4" /> {ticket.location}
              </div>
            )}
          </div>

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Attachments ({ticket.attachments.length})
              </h2>
              <div className="space-y-2">
                {ticket.attachments.map((att) => (
                  <a key={att.id} href={att.file} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
                    <Paperclip className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                    <span className="text-sm text-gray-700 group-hover:text-blue-700 flex-1 truncate">{att.filename}</span>
                    <span className="text-xs text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Activity timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">
              Activity{visibleComments.length > 0 ? ` (${visibleComments.length})` : ''}
            </h2>

            {/* System event: ticket created */}
            <div className="flex gap-3 mb-5">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600">
                  Ticket created by <span className="font-medium">{ticket.requester_detail?.full_name}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(ticket.created_at)}</p>
              </div>
            </div>

            {ticket.assigned_to_detail && (
              <div className="flex gap-3 mb-5">
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UserIcon className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600">
                    Assigned to <span className="font-medium">{ticket.assigned_to_detail.full_name}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Comments */}
            {visibleComments.length > 0 && (
              <div className="space-y-5 border-t border-gray-50 pt-4">
                {visibleComments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={c.author_detail.full_name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-gray-900">{c.author_detail.full_name}</span>
                        <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                        {c.is_internal && (
                          <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
                            <Lock className="w-2.5 h-2.5" /> Internal
                          </span>
                        )}
                      </div>
                      <div className={`rounded-xl p-3.5 text-sm text-gray-700 leading-relaxed ${
                        c.is_internal
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'bg-gray-50 border border-gray-100'
                      }`}>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {visibleComments.length === 0 && (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No comments yet — be the first to reply</p>
              </div>
            )}

            {/* Comment form */}
            <form onSubmit={submitComment} className="mt-5 border-t border-gray-100 pt-5">
              {isAgent && (
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setIsInternal(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      !isInternal ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternal(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isInternal ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" /> Internal Note
                  </button>
                </div>
              )}
              <Textarea
                placeholder={isInternal ? 'Write an internal note (not visible to requester)...' : 'Add a reply or update...'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className={isInternal ? 'border-yellow-300 bg-yellow-50 focus:border-yellow-400' : ''}
              />
              <div className="flex justify-end mt-2">
                <Button type="submit" loading={commentLoading} size="sm" className="gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  {isInternal ? 'Add Note' : 'Post Reply'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Right: details + actions ── */}
        <div className="space-y-4">
          {/* SLA status */}
          {ticket.sla_resolution_due && <SLAStatus ticket={ticket} />}

          {/* Details card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Details</h2>

            <div className="space-y-3">
              {[
                { icon: Tag, label: 'Category', value: ticket.category_display },
                {
                  icon: Building2, label: 'Department',
                  value: ticket.department_detail?.name || '—'
                },
                {
                  icon: UserIcon, label: 'Requester',
                  value: ticket.requester_detail?.full_name
                },
                {
                  icon: UserIcon, label: 'Assigned To',
                  value: ticket.assigned_to_detail?.full_name || 'Unassigned'
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-50 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Priority</span>
                <Badge className={PRIORITY_COLORS[ticket.priority]}>{ticket.priority_display}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Status</span>
                <Badge className={STATUS_COLORS[ticket.status]}>{ticket.status_display}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Created</span>
                <span className="text-xs text-gray-600">{formatDate(ticket.created_at)}</span>
              </div>
              {ticket.resolved_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Resolved</span>
                  <span className="text-xs text-green-600 font-medium">{formatDate(ticket.resolved_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Agent actions */}
          {isAgent && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Actions</h2>

              {/* Status update */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Update Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Button
                  onClick={updateStatus}
                  className="w-full"
                  loading={actionLoading}
                  disabled={selectedStatus === ticket.status}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Apply Status
                </Button>
              </div>

              {/* Assign */}
              <div className="space-y-2 border-t border-gray-50 pt-4">
                <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" /> Reassign To
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}{a.id === ticket.assigned_to ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={assignAgent}
                  variant="outline"
                  className="w-full"
                  loading={actionLoading}
                  disabled={!selectedAgent}
                >
                  Reassign Ticket
                </Button>
              </div>
            </div>
          )}

          {/* Reopen / Unassign — shown when ticket is assigned, resolved, or closed */}
          {(ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'assigned') && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {ticket.status === 'assigned'
                      ? 'Wrong assignment?'
                      : ticket.status === 'resolved'
                      ? 'Issue not resolved?'
                      : 'Need to reopen?'}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {ticket.status === 'assigned'
                      ? 'This will unassign the ticket and set it back to New so it can be re-routed.'
                      : 'Reopening this ticket will set the status to Reopened and notify the team.'}
                  </p>
                </div>
              </div>
              <Button
                onClick={reopenTicket}
                loading={actionLoading}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white border-0"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                {ticket.status === 'assigned' ? 'Unassign & Reset to New' : 'Reopen Ticket'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
