'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore, useHasPerm } from '@/app/lib/store'
import api from '@/app/lib/api'
import { downloadFile, viewFile, isViewableInBrowser } from '@/app/lib/download'
import { Ticket, User, Attachment, STATUS_COLORS, PRIORITY_COLORS, MentionUser } from '@/app/lib/types'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Textarea } from '@/app/components/ui/textarea'
import { formatDate } from '@/app/lib/utils'
import {
  ArrowLeft, Paperclip, Send, AlertTriangle, Clock, User as UserIcon,
  Building2, MapPin, Tag, Lock, MessageSquare, CheckCircle2, RefreshCw, UserPlus,
  TrendingUp, ChevronDown, ChevronUp, AtSign, X, Users, LogOut, Printer, History, Eye, Download,
} from 'lucide-react'

function AttachmentRow({ att, dense }: { att: Attachment; dense?: boolean }) {
  const viewable = isViewableInBrowser(att.content_type)
  return (
    <div className={`w-full flex items-center gap-2 ${dense ? 'py-1.5 px-2.5' : 'p-3'} rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group`}>
      <Paperclip className={`${dense ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-gray-400 group-hover:text-blue-600 flex-shrink-0`} />
      <span className={`${dense ? 'text-xs' : 'text-sm'} text-gray-700 group-hover:text-blue-700 flex-1 truncate text-left`}>{att.filename}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{(att.file_size / 1024).toFixed(1)} KB</span>
      {viewable && (
        <button
          type="button"
          title="View in browser"
          onClick={() => viewFile(att.download_url, att.content_type)}
          className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100"
        >
          <Eye className={dense ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
      )}
      <button
        type="button"
        title="Download"
        onClick={() => downloadFile(att.download_url, att.filename)}
        className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100"
      >
        <Download className={dense ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </button>
    </div>
  )
}

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

/** Returns { atIndex, query } if cursor is immediately after a word-starting @, else null. */
function getMentionContext(text: string, cursorPos: number): { atIndex: number; query: string } | null {
  const before = text.slice(0, cursorPos)
  // Only trigger when @ is at position 0 or preceded by whitespace
  const match = before.match(/(^|\s)@(\S*)$/)
  if (!match) return null
  const atIndex = before.lastIndexOf('@')
  return { atIndex, query: match[2] }
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isStaff = useHasPerm('tickets', 'claim')
  const canEscalate = useHasPerm('tickets', 'escalate')
  const canManageEscalated = useHasPerm('tickets', 'manage_escalated')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [statusFiles, setStatusFiles] = useState<File[]>([])
  const [statusNote, setStatusNote] = useState('')
  const [agents, setAgents] = useState<User[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [escalateReason, setEscalateReason] = useState('')
  const [escalateError, setEscalateError] = useState('')

  // @mention state
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUsers, setMentionUsers] = useState<{ dept_users: MentionUser[]; other_users: MentionUser[] }>({ dept_users: [], other_users: [] })
  const [pendingMentions, setPendingMentions] = useState<MentionUser[]>([])
  const [participantLoading, setParticipantLoading] = useState(false)

  useEffect(() => {
    fetchTicket()
    if (user && isStaff) {
      api.get('/auth/users/agents/').then((r) => setAgents(r.data)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Replies are locked on a resolved/closed ticket - default staff into
  // Internal Note mode so the toggle isn't left on a disabled "Reply".
  useEffect(() => {
    if (ticket && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      setIsInternal(true)
    }
  }, [ticket?.status])

  const fetchTicket = async () => {
    try {
      const res = await api.get<Ticket>(`/tickets/${id}/`)
      setTicket(res.data)
      setSelectedStatus(res.data.status)
      // Fetch mentionable users based on ticket department
      const dept = res.data.department
      const excludeIds: number[] = [res.data.requester]
      if (res.data.assigned_to) excludeIds.push(res.data.assigned_to)
      const params = new URLSearchParams()
      if (dept) params.set('department', String(dept))
      excludeIds.forEach((eid) => params.append('exclude', String(eid)))
      api.get(`/auth/users/mentionable/?${params}`).then((r) => setMentionUsers(r.data)).catch(() => {})
    } catch { router.push('/tickets') }
    finally { setLoading(false) }
  }

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setComment(val)
    const cursor = e.target.selectionStart ?? val.length
    const ctx = getMentionContext(val, cursor)
    if (ctx) {
      setMentionQuery(ctx.query)
      setMentionOpen(true)
    } else {
      setMentionOpen(false)
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && e.key === 'Escape') {
      setMentionOpen(false)
    }
  }

  const handleMentionSelect = (mentionUser: MentionUser) => {
    if (!textareaRef.current) return
    const textarea = textareaRef.current
    const cursor = textarea.selectionStart ?? comment.length
    const ctx = getMentionContext(comment, cursor)
    if (!ctx) return

    // Replace @<query> with @FullName and a trailing space
    const before = comment.slice(0, ctx.atIndex)
    const after = comment.slice(cursor)
    const inserted = `@${mentionUser.full_name} `
    const newComment = before + inserted + after
    setComment(newComment)
    setMentionOpen(false)

    // Add to pending mentions if not already there
    setPendingMentions((prev) =>
      prev.find((p) => p.id === mentionUser.id) ? prev : [...prev, mentionUser]
    )

    // Restore focus and move cursor after inserted text
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + inserted.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  const removePendingMention = (userId: number) => {
    setPendingMentions((prev) => prev.filter((p) => p.id !== userId))
  }

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setCommentLoading(true)
    setCommentError('')
    try {
      const fd = new FormData()
      fd.append('body', comment)
      fd.append('is_internal', String(isInternal))
      commentFiles.forEach((f) => fd.append('files', f))
      await api.post(`/tickets/${id}/add_comment/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      // Invite any @mentioned users who aren't already ACTIVE participants -
      // someone who exited or already contributed should be re-invited (and
      // re-notified), not silently skipped.
      const activeParticipantIds = (ticket?.participants ?? []).filter((p) => p.status === 'active').map((p) => p.user)
      const toInvite = pendingMentions.filter((m) => !activeParticipantIds.includes(m.id))
      await Promise.allSettled(toInvite.map((m) => api.post(`/tickets/${id}/invite/`, { user_id: m.id })))
      setComment('')
      setCommentFiles([])
      setPendingMentions([])
      fetchTicket()
    } catch (err: any) {
      setCommentError(err.response?.data?.error || 'Failed to post.')
    } finally { setCommentLoading(false) }
  }

  const isResolveOrClose = (status: string) => status === 'resolved' || status === 'closed'

  const applyStatus = async (status: string) => {
    setActionLoading(true)
    setStatusError('')
    try {
      await api.patch(`/tickets/${id}/update_status/`, {
        status,
        ...(isResolveOrClose(status) ? { resolution_note: statusNote } : {}),
      })
      for (const file of statusFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await api.post(`/tickets/${id}/add_attachment/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setStatusFiles([])
      setStatusNote('')
      fetchTicket()
    } catch (err: any) {
      setStatusError(err.response?.data?.error || 'Failed to update status.')
    } finally { setActionLoading(false) }
  }

  const updateStatus = () => {
    if (!selectedStatus || selectedStatus === ticket?.status) return
    if (isResolveOrClose(selectedStatus) && !statusNote.trim()) return
    applyStatus(selectedStatus)
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
    setStatusError('')
    try {
      await api.post(`/tickets/${id}/reopen/`)
      fetchTicket()
    } catch (err: any) {
      setStatusError(err.response?.data?.error || 'Failed to reopen ticket.')
    } finally { setActionLoading(false) }
  }

  const claimTicket = async () => {
    setActionLoading(true)
    try {
      await api.post(`/tickets/${id}/claim/`)
      fetchTicket()
    } finally { setActionLoading(false) }
  }

  const escalateTicket = async () => {
    setEscalateError('')
    setActionLoading(true)
    try {
      await api.post(`/tickets/${id}/escalate/`, { reason: escalateReason })
      setEscalateOpen(false)
      setEscalateReason('')
      fetchTicket()
    } catch (err: any) {
      setEscalateError(err.response?.data?.error || 'Escalation failed. Make sure the department has a manager assigned.')
    } finally { setActionLoading(false) }
  }

  const markContributed = async () => {
    setParticipantLoading(true)
    try {
      await api.post(`/tickets/${id}/mark_contributed/`)
      fetchTicket()
    } finally { setParticipantLoading(false) }
  }

  const exitParticipation = async () => {
    setParticipantLoading(true)
    try {
      await api.post(`/tickets/${id}/exit_participation/`)
      fetchTicket()
    } finally { setParticipantLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
      </div>
    )
  }
  if (!ticket) return null

  const visibleComments = ticket.comments.filter((c) => !c.is_internal || isStaff)
  const isTicketLocked = ticket.status === 'resolved' || ticket.status === 'closed'
  const activeParticipants = (ticket.participants ?? []).filter((p) => p.status !== 'exited')
  const myParticipation = (ticket.participants ?? []).find((p) => p.user === user?.id && p.status !== 'exited')

  // filtered mention list — respect the department's mention_scope setting
  const q = mentionQuery.toLowerCase()
  const deptMentionScope = ticket.department_detail?.mention_scope ?? 'all'
  const filterUsers = (list: MentionUser[]) =>
    list.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    )
  const filteredDeptUsers = filterUsers(mentionUsers.dept_users)
  const filteredOtherUsers = deptMentionScope === 'department' ? [] : filterUsers(mentionUsers.other_users)
  const hasMentionResults = filteredDeptUsers.length > 0 || filteredOtherUsers.length > 0

  return (
    <>
    <div className="space-y-4 print:hidden">
      {/* Top bar */}
      <div className="flex items-start gap-3">
        <Link href="/tickets" className="print:hidden">
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
            {myParticipation && (
              <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                <AtSign className="w-3 h-3" /> Invited contributor
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{ticket.title}</h1>
        </div>
        <Button variant="outline" className="print:hidden mt-1" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1.5" /> Print
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: description + activity ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:break-inside-avoid">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Description</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>

            {ticket.location && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50 text-sm text-gray-500">
                <MapPin className="w-4 h-4" /> {ticket.location}
              </div>
            )}
          </div>

          {/* Resolution / Cancellation note */}
          {ticket.resolution_note && (ticket.status === 'resolved' || ticket.status === 'closed') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:break-inside-avoid">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {ticket.status === 'resolved' ? 'Resolution Note' : 'Cancellation Note'}
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.resolution_note}</p>
            </div>
          )}

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:break-inside-avoid">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Attachments ({ticket.attachments.length})
              </h2>
              <div className="space-y-2">
                {ticket.attachments.map((att) => (
                  <AttachmentRow key={att.id} att={att} />
                ))}
              </div>
            </div>
          )}

          {/* Status Journey - full chronological trail for the printed report:
              creation, (re)assignment and every status transition, sourced
              from the audit log so it doesn't drift from what actually
              happened. */}
          {ticket.status_history.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:break-inside-avoid">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5 flex items-center gap-2">
                <History className="w-4 h-4" /> Status Journey
              </h2>
              <div className="space-y-4">
                {ticket.status_history.map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <History className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        {h.description}
                        {h.old_value && h.new_value && (
                          <span className="text-gray-400"> ({h.old_value_display} → {h.new_value_display})</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{h.user_name} • {formatDate(h.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:break-inside-avoid">
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
                      {c.attachments.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {c.attachments.map((att) => (
                            <AttachmentRow key={att.id} att={att} dense />
                          ))}
                        </div>
                      )}
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
            {isTicketLocked && !isStaff ? (
              <div className="mt-5 border-t border-gray-100 pt-5 print:hidden">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs text-gray-500">
                    This ticket is {ticket.status}. Reopen it to add a reply.
                  </p>
                </div>
              </div>
            ) : (
            <form onSubmit={submitComment} className="mt-5 border-t border-gray-100 pt-5 print:hidden">
              {isStaff && (
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => !isTicketLocked && setIsInternal(false)}
                    disabled={isTicketLocked}
                    title={isTicketLocked ? `This ticket is ${ticket.status}. Reopen it to add a reply.` : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isTicketLocked ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed'
                      : !isInternal ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
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

              {/* Textarea with @mention dropdown */}
              <div className="relative">
                {mentionOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                    style={{ maxHeight: '240px', overflowY: 'auto' }}
                    // Prevent blur from closing before click registers
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filteredDeptUsers.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
                          Department
                        </div>
                        {filteredDeptUsers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleMentionSelect(u)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                              {u.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                            <span className="ml-auto text-xs text-gray-300 capitalize shrink-0">{u.role.replace('_', ' ')}</span>
                          </button>
                        ))}
                      </>
                    )}
                    {filteredOtherUsers.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
                          All Users
                        </div>
                        {filteredOtherUsers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleMentionSelect(u)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-gray-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                              {u.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {u.department_name ? `${u.department_name} · ` : ''}{u.email}
                              </p>
                            </div>
                            <span className="ml-auto text-xs text-gray-300 capitalize shrink-0">{u.role.replace('_', ' ')}</span>
                          </button>
                        ))}
                      </>
                    )}
                    {!hasMentionResults && (
                      <div className="px-3 py-4 text-sm text-gray-400 text-center">
                        No users found for &quot;{mentionQuery}&quot;
                      </div>
                    )}
                  </div>
                )}

                <Textarea
                  ref={textareaRef}
                  placeholder={
                    isInternal
                      ? 'Write an internal note (not visible to requester)... Type @ to mention a user'
                      : 'Add a reply or update... Type @ to mention a user'
                  }
                  value={comment}
                  onChange={handleCommentChange}
                  onKeyDown={handleTextareaKeyDown}
                  onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                  onFocus={(e) => {
                    const ctx = getMentionContext(e.target.value, e.target.selectionStart ?? 0)
                    if (ctx) { setMentionQuery(ctx.query); setMentionOpen(true) }
                  }}
                  rows={3}
                  className={isInternal ? 'border-yellow-300 bg-yellow-50 focus:border-yellow-400' : ''}
                />
              </div>

              {/* Attach files */}
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.log,.zip"
                    onChange={(e) => {
                      const newFiles = Array.from(e.target.files || [])
                      setCommentFiles((prev) => [...prev, ...newFiles])
                      e.target.value = ''
                    }}
                  />
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200">
                    <Paperclip className="w-3.5 h-3.5" /> Attach files
                  </div>
                </label>
                {commentFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {commentFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 rounded-lg text-xs">
                        <span className="text-gray-600 truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setCommentFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="ml-2 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending @mention pills */}
              {pendingMentions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs text-gray-400 self-center">Will invite:</span>
                  {pendingMentions.map((m) => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full"
                    >
                      <AtSign className="w-2.5 h-2.5" />
                      {m.full_name}
                      <button
                        type="button"
                        onClick={() => removePendingMention(m.id)}
                        className="text-blue-500 hover:text-blue-700 ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {commentError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-2">{commentError}</p>
              )}

              <div className="flex justify-end mt-2">
                <Button type="submit" loading={commentLoading} size="sm" className="gap-1.5" disabled={isTicketLocked && !isInternal}>
                  <Send className="w-3.5 h-3.5" />
                  {isInternal ? 'Add Note' : 'Post Reply'}
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>

        {/* ── Right: details + actions ── */}
        <div className="space-y-4">
          {/* SLA status */}
          {ticket.sla_resolution_due && <SLAStatus ticket={ticket} />}

          {/* Details card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 print:break-inside-avoid">
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
                ...(ticket.location ? [{ icon: MapPin, label: 'Location', value: ticket.location }] : []),
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

          {/* Contributors panel */}
          {(activeParticipants.length > 0 || myParticipation) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Contributors ({activeParticipants.length})
                </h2>
              </div>

              <div className="space-y-2">
                {activeParticipants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                      {p.user_detail.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.user_detail.full_name}
                        {p.user === user?.id && <span className="text-gray-400 font-normal"> (you)</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        Invited by {p.invited_by_detail?.full_name ?? 'system'} · {formatDate(p.invited_at)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      p.status === 'contributed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.status_display}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action buttons for the current user's participation */}
              {myParticipation && (
                <div className="border-t border-gray-100 pt-3 flex gap-2 print:hidden">
                  {myParticipation.status !== 'contributed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
                      loading={participantLoading}
                      onClick={markContributed}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Contributed
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-gray-600 border-gray-200 hover:bg-gray-50"
                    loading={participantLoading}
                    onClick={exitParticipation}
                  >
                    <LogOut className="w-3.5 h-3.5 mr-1" /> Exit
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Agent actions */}
          {isStaff && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 print:hidden">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Actions</h2>

              {/* Escalation lock — agents cannot act while ticket is escalated */}
              {ticket.status === 'escalated' && !canManageEscalated ? (
                <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <TrendingUp className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-900">Awaiting manager action</p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      This ticket is escalated. Only the manager can update its status, reassign it, or close it.
                      You can still add comments.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Status update */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Update Status
                    </label>

                    {(ticket.status === 'resolved' || ticket.status === 'closed') ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500">
                          This ticket is {ticket.status}. Use the &quot;Reopen Ticket&quot; action below before changing the status further.
                        </p>
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {isResolveOrClose(selectedStatus) && (
                          <div className="space-y-1">
                            <Textarea
                              label={`${selectedStatus === 'resolved' ? 'Resolution' : 'Cancellation'} Note *`}
                              placeholder={selectedStatus === 'resolved'
                                ? 'Explain how this ticket was resolved...'
                                : 'Explain why this ticket is being closed/cancelled...'}
                              rows={3}
                              value={statusNote}
                              onChange={(e) => setStatusNote(e.target.value)}
                            />
                            <p className="text-xs text-gray-400">Required to {selectedStatus === 'resolved' ? 'resolve' : 'close'} this ticket.</p>
                          </div>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer w-fit">
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.log,.zip"
                            onChange={(e) => {
                              const newFiles = Array.from(e.target.files || [])
                              setStatusFiles((prev) => [...prev, ...newFiles])
                              e.target.value = ''
                            }}
                          />
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200">
                            <Paperclip className="w-3.5 h-3.5" /> Attach resolution files
                          </div>
                        </label>
                        {statusFiles.length > 0 && (
                          <div className="space-y-1.5">
                            {statusFiles.map((file, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 rounded-lg text-xs">
                                <span className="text-gray-600 truncate">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setStatusFiles((prev) => prev.filter((_, j) => j !== i))}
                                  className="ml-2 text-gray-400 hover:text-red-500"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {statusError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{statusError}</p>
                        )}
                        <Button
                          onClick={updateStatus}
                          className="w-full"
                          loading={actionLoading}
                          disabled={selectedStatus === ticket.status || (isResolveOrClose(selectedStatus) && !statusNote.trim())}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Apply Status
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Assign */}
                  <div className="space-y-2 border-t border-gray-50 pt-4">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" /> Reassign To
                    </label>
                    {isTicketLocked ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500">
                          This ticket is {ticket.status}. Use the &quot;Reopen Ticket&quot; action below before reassigning.
                        </p>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>

                  {/* Escalate to Manager — agents only, ticket not already escalated */}
                  {canEscalate && (
                    <div className="border-t border-gray-50 pt-4 space-y-2">
                      <button
                        type="button"
                        onClick={() => { setEscalateOpen((o) => !o); setEscalateError('') }}
                        className="w-full flex items-center justify-between text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <span className="flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" /> Escalate to Manager
                        </span>
                        {escalateOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {escalateOpen && (
                        <div className="space-y-2 bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs text-red-700">
                            This will assign the ticket to the department manager and set status to <strong>Escalated</strong>.
                          </p>
                          <Textarea
                            placeholder="Reason for escalation (optional)..."
                            value={escalateReason}
                            onChange={(e) => setEscalateReason(e.target.value)}
                            rows={3}
                            className="text-sm"
                          />
                          {escalateError && (
                            <p className="text-xs text-red-600">{escalateError}</p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => { setEscalateOpen(false); setEscalateReason(''); setEscalateError('') }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                              loading={actionLoading}
                              onClick={escalateTicket}
                            >
                              <TrendingUp className="w-3.5 h-3.5 mr-1" /> Escalate
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Pool-mode claim banner */}
          {isStaff && ticket.department_detail?.routing_mode === 'pool' && !ticket.assigned_to && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3 print:hidden">
              <div className="flex items-start gap-3">
                <UserPlus className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-900">Department Pool Ticket</p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    This ticket is open to all department members. Claim it to take ownership and start working on it.
                  </p>
                </div>
              </div>
              <Button
                onClick={claimTicket}
                loading={actionLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white border-0"
              >
                <UserPlus className="w-4 h-4 mr-1.5" /> Claim This Ticket
              </Button>
            </div>
          )}

          {/* Reopen / Unassign */}
          {(ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'assigned') && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3 print:hidden">
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
              {statusError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{statusError}</p>
              )}
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

    {/* Plain data report - shown only when printing. Deliberately not a
        shrunk-down copy of the on-screen UI (no cards/badges/colors/icons) -
        just a flat document: ticket fields, description, status journey and
        chat history as simple tables/lists. */}
    <div className="hidden print:block text-black text-[13px] leading-normal">
      <div className="text-center mb-4 pb-3 border-b-2 border-black">
        <h1 className="text-lg font-bold">Ticket Report</h1>
        <p className="text-xs">Generated {formatDate(new Date().toISOString())}</p>
      </div>

      <table className="w-full border-collapse mb-4">
        <tbody>
          {([
            ['Ticket Number', ticket.ticket_number],
            ['Title', ticket.title],
            ['Category', ticket.category_display],
            ['Priority', ticket.priority_display],
            ['Status', ticket.status_display],
            ['Department', ticket.department_detail?.name || '—'],
            ['Requester', ticket.requester_detail?.full_name || '—'],
            ['Assigned To', ticket.assigned_to_detail?.full_name || 'Unassigned'],
            ['Location', ticket.location || '—'],
            ['Created', formatDate(ticket.created_at)],
            ...(ticket.resolved_at ? [['Resolved At', formatDate(ticket.resolved_at)]] : []),
            ...(ticket.closed_at ? [['Closed At', formatDate(ticket.closed_at)]] : []),
            ...(ticket.sla_response_due ? [['Response Due', formatDate(ticket.sla_response_due)]] : []),
            ...(ticket.sla_resolution_due ? [['Resolution Due', formatDate(ticket.sla_resolution_due)]] : []),
          ] as [string, string][]).map(([label, value]) => (
            <tr key={label} className="border-b border-gray-300">
              <td className="py-1 pr-4 font-semibold align-top w-40">{label}</td>
              <td className="py-1">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-4">
        <h2 className="text-sm font-bold border-b border-black mb-1">Description</h2>
        <p className="whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {ticket.resolution_note && (
        <div className="mb-4">
          <h2 className="text-sm font-bold border-b border-black mb-1">
            {ticket.status === 'resolved' ? 'Resolution Note' : 'Cancellation Note'}
          </h2>
          <p className="whitespace-pre-wrap">{ticket.resolution_note}</p>
        </div>
      )}

      {ticket.attachments.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-bold border-b border-black mb-1">Attachments</h2>
          <ul className="list-disc pl-5">
            {ticket.attachments.map((a) => <li key={a.id}>{a.filename}</li>)}
          </ul>
        </div>
      )}

      {ticket.status_history.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-bold border-b border-black mb-1">Status Journey</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Date/Time</th>
                <th className="py-1 pr-2">Event</th>
                <th className="py-1 pr-2">Change</th>
                <th className="py-1">By</th>
              </tr>
            </thead>
            <tbody>
              {ticket.status_history.map((h, i) => (
                <tr key={i} className="border-b border-gray-300">
                  <td className="py-1 pr-2 align-top whitespace-nowrap">{formatDate(h.timestamp)}</td>
                  <td className="py-1 pr-2 align-top">{h.description}</td>
                  <td className="py-1 pr-2 align-top whitespace-nowrap">
                    {h.old_value && h.new_value ? `${h.old_value_display} -> ${h.new_value_display}` : '—'}
                  </td>
                  <td className="py-1 align-top">{h.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visibleComments.length > 0 && (
        <div>
          <h2 className="text-sm font-bold border-b border-black mb-1">Chat / Comments</h2>
          {visibleComments.map((c) => (
            <div key={c.id} className="mb-2 pb-2 border-b border-gray-200">
              <p className="font-semibold">
                {c.author_detail.full_name}{' '}
                <span className="font-normal text-gray-600">
                  — {formatDate(c.created_at)}{c.is_internal ? ' (Internal)' : ''}
                </span>
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
              {c.attachments.length > 0 && (
                <p className="text-xs text-gray-600">Attachments: {c.attachments.map((a) => a.filename).join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  )
}
