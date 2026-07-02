'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore, useHasPerm } from '@/app/lib/store'
import api from '@/app/lib/api'
import { Ticket, PaginatedResponse, STATUS_COLORS, PRIORITY_COLORS } from '@/app/lib/types'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { formatDate } from '@/app/lib/utils'
import { Plus, Search, AlertTriangle, Clock, ChevronLeft, ChevronRight, Ticket as TicketIcon, CheckCircle2, Archive, AtSign, Send, Filter, X, Globe } from 'lucide-react'

// Params a stat tile can deep-link with; when any are present in the URL,
// they take over from the normal tab-driven query entirely.
const QUICK_FILTER_KEYS = ['status', 'status__in', 'assigned_to_me', 'sla_breached'] as const

// Active = anything not resolved/closed
const ACTIVE_STATUSES = ['new', 'assigned', 'in_progress', 'pending_user', 'pending_vendor', 'escalated', 'reopened']
const RESOLVED_STATUSES = ['resolved', 'closed']

const ACTIVE_STATUS_OPTIONS = [
  { value: '', label: 'All Active' },
  { value: 'new', label: 'New' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_user', label: 'Pending User' },
  { value: 'pending_vendor', label: 'Pending Vendor' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'reopened', label: 'Reopened' },
]

const RESOLVED_STATUS_OPTIONS = [
  { value: '', label: 'All Resolved/Closed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const ALL_STATUS_OPTIONS = [
  { value: '', label: 'Every Status' },
  ...ACTIVE_STATUS_OPTIONS.slice(1),
  ...RESOLVED_STATUS_OPTIONS.slice(1),
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

function SLACell({ ticket }: { ticket: Ticket }) {
  if (ticket.is_sla_resolution_breached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> Breached
      </span>
    )
  }
  if (ticket.sla_resolution_due) {
    const mins = Math.floor((new Date(ticket.sla_resolution_due).getTime() - Date.now()) / 60000)
    if (mins > 0 && mins < 120) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3" /> {mins}m
        </span>
      )
    }
  }
  return <span className="text-gray-300 text-xs">—</span>
}

const PAGE_SIZE = 20
type TabType = 'active' | 'resolved' | 'invited' | 'submitted' | 'all'

const QUICK_FILTER_LABELS: Record<string, string> = {
  'status:new': 'New tickets',
  'status:resolved': 'Resolved tickets',
  'status:closed': 'Closed tickets',
  'status__in:assigned,in_progress,escalated': 'Open tickets',
  'status__in:pending_user,pending_vendor': 'Pending tickets',
  'assigned_to_me:true': 'Assigned to me',
  'sla_breached:true': 'SLA breached tickets',
}

export default function TicketsPage() {
  const user = useAuthStore((s) => s.user)
  const isStaff = useHasPerm('tickets', 'claim')
  const canViewAll = useHasPerm('tickets', 'view_all')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabType>('active')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [count, setCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [resolvedCount, setResolvedCount] = useState(0)
  const [invitedCount, setInvitedCount] = useState(0)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [allCount, setAllCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')

  // A dashboard tile can deep-link here with e.g. ?status=new or
  // ?assigned_to_me=true - when present, it fully overrides the tab logic.
  const quickFilterEntries = QUICK_FILTER_KEYS
    .filter((k) => searchParams.get(k) !== null)
    .map((k) => [k, searchParams.get(k) as string] as const)
  const quickFilterActive = quickFilterEntries.length > 0
  const quickFilterLabel = quickFilterEntries
    .map(([k, v]) => QUICK_FILTER_LABELS[`${k}:${v}`] || `${k}=${v}`)
    .join(', ')

  const clearQuickFilter = () => router.push('/tickets')

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ordering: '-created_at' })
      if (search) params.set('search', search)
      if (priority) params.set('priority', priority)

      if (quickFilterActive) {
        quickFilterEntries.forEach(([k, v]) => params.set(k, v))
      } else if (tab === 'invited') {
        params.set('invited_only', 'true')
      } else if (tab === 'submitted') {
        if (user) params.set('requester', String(user.id))
      } else if (tab === 'all') {
        if (status) params.set('status', status)
      } else if (status) {
        params.set('status', status)
      } else {
        const statuses = tab === 'active' ? ACTIVE_STATUSES : RESOLVED_STATUSES
        params.set('status__in', statuses.join(','))
      }

      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets/?${params}`)
      setTickets(res.data.results)
      setCount(res.data.count)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status, priority, tab, user, searchParams.toString()])

  // Fetch tab counts
  useEffect(() => {
    if (!user) return
    const p1 = new URLSearchParams({ page_size: '1', status__in: ACTIVE_STATUSES.join(',') })
    const p2 = new URLSearchParams({ page_size: '1', status__in: RESOLVED_STATUSES.join(',') })
    const p3 = new URLSearchParams({ page_size: '1', invited_only: 'true' })
    const requests = [
      api.get<PaginatedResponse<Ticket>>(`/tickets/?${p1}`),
      api.get<PaginatedResponse<Ticket>>(`/tickets/?${p2}`),
      api.get<PaginatedResponse<Ticket>>(`/tickets/?${p3}`),
    ]
    if (isStaff) {
      const p4 = new URLSearchParams({ page_size: '1', requester: String(user.id) })
      requests.push(api.get<PaginatedResponse<Ticket>>(`/tickets/?${p4}`))
    }
    if (canViewAll) {
      const p5 = new URLSearchParams({ page_size: '1' })
      requests.push(api.get<PaginatedResponse<Ticket>>(`/tickets/?${p5}`))
    }
    Promise.all(requests).then((results) => {
      const [a, r, inv, ...rest] = results
      setActiveCount(a.data.count)
      setResolvedCount(r.data.count)
      setInvitedCount(inv.data.count)
      let idx = 0
      if (isStaff) setSubmittedCount(rest[idx++].data.count)
      if (canViewAll) setAllCount(rest[idx++].data.count)
    }).catch(() => {})
  }, [user, isStaff, canViewAll])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const switchTab = (t: TabType) => {
    if (quickFilterActive) router.replace('/tickets')
    setTab(t)
    setStatus('')
    setSearch('')
    setSearchInput('')
    setPage(1)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const totalPages = Math.ceil(count / PAGE_SIZE)
  const statusOptions = tab === 'active' ? ACTIVE_STATUS_OPTIONS : tab === 'all' ? ALL_STATUS_OPTIONS : RESOLVED_STATUS_OPTIONS
  const showStatusFilter = tab !== 'invited' && tab !== 'submitted' && !quickFilterActive

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-400">
            {quickFilterActive
              ? `${count} ${quickFilterLabel.toLowerCase()}`
              : <>{count} {tab === 'active' ? 'active' : tab === 'resolved' ? 'resolved/closed' : tab}
                  {search || status || priority ? ' · filtered' : ''}</>
            }
          </p>
        </div>
        <Link href="/tickets/new">
          <Button className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> New Ticket
          </Button>
        </Link>
      </div>

      {quickFilterActive && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-xl px-4 py-2.5">
          <Filter className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Showing: <span className="font-semibold">{quickFilterLabel}</span></span>
          <button onClick={clearQuickFilter} className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium flex-shrink-0">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={`flex gap-1 border-b border-gray-200 ${quickFilterActive ? 'opacity-40 pointer-events-none' : ''}`}>
        <button
          onClick={() => switchTab('active')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'active' ? 'border-blue-900 text-blue-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <TicketIcon className="w-4 h-4" />
          Active Tickets
          {activeCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'active' ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab('resolved')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'resolved' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Resolved &amp; Closed
          {resolvedCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'resolved' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {resolvedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab('invited')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'invited' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AtSign className="w-4 h-4" />
          Invited
          {invitedCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'invited' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {invitedCount}
            </span>
          )}
        </button>
        {isStaff && (
          <button
            onClick={() => switchTab('submitted')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'submitted' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Send className="w-4 h-4" />
            Submitted by Me
            {submittedCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'submitted' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {submittedCount}
              </span>
            )}
          </button>
        )}
        {canViewAll && (
          <button
            onClick={() => switchTab('all')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'all' ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Globe className="w-4 h-4" />
            All Tickets
            {allCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {allCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-56 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="Search by title or ticket number..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all"
            />
          </div>
          {showStatusFilter && (
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="h-10 px-3 pr-8 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 bg-white text-gray-700"
            >
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1) }}
            className="h-10 px-3 pr-8 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 bg-white text-gray-700"
          >
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button type="submit" variant="outline" className="h-10 px-5">Search</Button>
          {(search || status || priority) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setStatus(''); setPriority(''); setPage(1) }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ticket</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                {isStaff && (
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Requester</th>
                )}
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Department</th>
                {isStaff && (
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned</th>
                )}
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {tab === 'resolved' ? 'Resolved' : 'Created'}
                </th>
                {tab === 'active' && (
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">SLA</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-blue-900 rounded-full animate-spin" />
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    {tab === 'resolved'
                      ? <><Archive className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p className="text-gray-400">No resolved or closed tickets</p></>
                      : tab === 'invited'
                      ? <><AtSign className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p className="text-gray-400">No tickets where you have been invited as a contributor</p></>
                      : tab === 'all'
                      ? <><Globe className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p className="text-gray-400">No tickets found</p></>
                      : <><TicketIcon className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p className="text-gray-400">No active tickets</p></>
                    }
                  </td>
                </tr>
              ) : tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={`hover:bg-gray-50 transition-colors group ${ticket.is_sla_resolution_breached && tab === 'active' ? 'border-l-2 border-l-red-400' : ''}`}
                >
                  <td className="px-5 py-4">
                    <Link href={`/tickets/${ticket.id}`} className="block">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[ticket.priority] || 'bg-gray-300'}`} />
                        <div>
                          <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors leading-tight">{ticket.title}</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{ticket.ticket_number}</p>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-4">
                    <Badge className={PRIORITY_COLORS[ticket.priority]}>{ticket.priority_display}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge className={STATUS_COLORS[ticket.status]}>{ticket.status_display}</Badge>
                  </td>
                  {isStaff && (
                    <td className="px-4 py-4 text-gray-600 text-sm">{ticket.requester_detail?.full_name || '—'}</td>
                  )}
                  <td className="px-4 py-4 text-gray-600 text-sm">{ticket.department_detail?.name || '—'}</td>
                  {isStaff && (
                    <td className="px-4 py-4 text-gray-600 text-sm">
                      {ticket.assigned_to_detail?.full_name || <span className="text-gray-300">Unassigned</span>}
                    </td>
                  )}
                  <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">
                    {tab === 'resolved' && ticket.resolved_at
                      ? <span className="text-green-600">{formatDate(ticket.resolved_at)}</span>
                      : formatDate(ticket.created_at)
                    }
                  </td>
                  {tab === 'active' && (
                    <td className="px-4 py-4"><SLACell ticket={ticket} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <p className="text-sm text-gray-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2
                if (p < 1 || p > totalPages) return null
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-blue-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
