'use client'
import { useEffect, useState } from 'react'
import { useAuthStore, useHasPerm } from '@/app/lib/store'
import api from '@/app/lib/api'
import { DashboardSummary, Ticket, STATUS_COLORS } from '@/app/lib/types'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { formatDate } from '@/app/lib/utils'
import {
  Ticket as TicketIcon, Clock, CheckCircle2, AlertCircle,
  Plus, ClipboardCheck, TrendingUp, AlertTriangle, ArrowRight,
  Circle, Inbox, Activity,
} from 'lucide-react'
import { Cell, ResponsiveContainer, PieChart, Pie } from 'recharts'
import { motion, Variants } from 'framer-motion'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, type: 'spring' as const, stiffness: 300, damping: 24 } }),
}

function greeting(name: string) {
  const h = new Date().getHours()
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${g}, ${name}`
}

function SLABadge({ ticket }: { ticket: Ticket }) {
  const CLOSED = ['resolved', 'closed']
  if (CLOSED.includes(ticket.status)) return null
  if (ticket.is_sla_resolution_breached) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
        <AlertTriangle className="w-3 h-3" /> Overdue
      </span>
    )
  }
  if (ticket.sla_resolution_due) {
    const mins = Math.floor((new Date(ticket.sla_resolution_due).getTime() - Date.now()) / 60000)
    if (mins < 120) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
          <Clock className="w-3 h-3" /> {mins}m left
        </span>
      )
    }
  }
  return null
}

const PRIORITY_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const isAgent = useHasPerm('tickets', 'claim')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [myTickets, setMyTickets] = useState<Ticket[]>([])
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const requests = [
      api.get('/reports/dashboard/'),
      api.get('/tickets/?ordering=-created_at&page_size=8'),
    ]
    if (isAgent) {
      requests.push(api.get('/tickets/?ordering=-created_at&page_size=5&assigned_to_me=true&status__in=new,assigned,in_progress,pending_user,pending_vendor,escalated,reopened'))
    }
    Promise.all(requests).then(([sumRes, ticketsRes, myRes]) => {
      setSummary(sumRes.data)
      setRecentTickets(ticketsRes.data.results || ticketsRes.data)
      if (myRes) setMyTickets(myRes.data.results || myRes.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [user, isAgent])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
      </div>
    )
  }

  const s = summary

  // Pie chart data for ticket status distribution
  const pieData = s ? [
    { name: 'Open', value: s.open, fill: '#3b82f6' },
    { name: 'Pending', value: s.pending, fill: '#f59e0b' },
    { name: 'Resolved', value: s.resolved, fill: '#22c55e' },
    { name: 'Closed', value: s.closed, fill: '#6b7280' },
  ].filter(d => d.value > 0) : []

  return (
    <div className="space-y-5">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting(user?.first_name || 'there')}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <a href="/tickets/new">
          <Button className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> New Ticket
          </Button>
        </a>
      </div>

      {/* â”€â”€ Bento Grid â”€â”€ */}
      <div className="grid grid-cols-12 gap-4 auto-rows-auto">

        {/* â”€â”€ Top stat strip â”€â”€ */}
        {isAgent ? (
          <>
            {/* Total */}
            <a href="/tickets" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <motion.div
                custom={0} variants={fadeUp} initial="hidden" animate="show"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center flex-shrink-0">
                  <TicketIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.total ?? 0}</p>
                  <p className="text-sm text-gray-500">Total Tickets</p>
                </div>
              </motion.div>
            </a>

            {/* Open */}
            <a href="/tickets?status__in=assigned,in_progress,escalated" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <motion.div
                custom={1} variants={fadeUp} initial="hidden" animate="show"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Inbox className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.open ?? 0}</p>
                  <p className="text-sm text-gray-500">Open</p>
                </div>
              </motion.div>
            </a>

            {/* Pending */}
            <a href="/tickets?status__in=pending_user,pending_vendor" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <motion.div
                custom={2} variants={fadeUp} initial="hidden" animate="show"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.pending ?? 0}</p>
                  <p className="text-sm text-gray-500">Pending</p>
                </div>
              </motion.div>
            </a>

            {/* SLA Breached */}
            <a href="/tickets?sla_breached=true" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <motion.div
                custom={3} variants={fadeUp} initial="hidden" animate="show"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className={`rounded-2xl border shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full ${(s?.sla_breached ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${(s?.sla_breached ?? 0) > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
                  <AlertCircle className={`w-6 h-6 ${(s?.sla_breached ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className={`text-3xl font-bold ${(s?.sla_breached ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>{s?.sla_breached ?? 0}</p>
                  <p className={`text-sm ${(s?.sla_breached ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>SLA Breached</p>
                </div>
              </motion.div>
            </a>
          </>
        ) : (
          <>
            <a href="/tickets" className="col-span-12 sm:col-span-4">
              <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full">
                <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center flex-shrink-0">
                  <TicketIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.total ?? 0}</p>
                  <p className="text-sm text-gray-500">Total Submitted</p>
                </div>
              </motion.div>
            </a>
            <a href="/tickets?status__in=assigned,in_progress,escalated" className="col-span-12 sm:col-span-4">
              <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Inbox className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.open ?? 0}</p>
                  <p className="text-sm text-gray-500">Open</p>
                </div>
              </motion.div>
            </a>
            <a href="/tickets?status=resolved" className="col-span-12 sm:col-span-4">
              <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer h-full">
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{s?.resolved ?? 0}</p>
                  <p className="text-sm text-gray-500">Resolved</p>
                </div>
              </motion.div>
            </a>
          </>
        )}

        {/* â”€â”€ My Queue (agents) â€” tall left card â”€â”€ */}
        {isAgent && (
          <motion.div
            custom={4} variants={fadeUp} initial="hidden" animate="show"
            className="col-span-12 lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-900" />
                <h2 className="font-semibold text-gray-900">My Queue</h2>
                {myTickets.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">{myTickets.length}</span>
                )}
              </div>
              <a href="/tickets" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            {myTickets.length === 0 ? (
              <div className="px-5 py-14 text-center text-gray-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Queue is clear</p>
                <p className="text-xs mt-1">No open tickets assigned to you</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {myTickets.map((t) => (
                  <a key={t.id} href={`/tickets/${t.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${PRIORITY_BAR[t.priority] ?? 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.ticket_number} Â· {t.department_detail?.name || 'No dept'} Â· {formatDate(t.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <SLABadge ticket={t} />
                      <Badge className={`${STATUS_COLORS[t.status]} text-xs`}>{t.status_display}</Badge>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* â”€â”€ Right column (agents): mini stats + chart â”€â”€ */}
        {isAgent && (
          <motion.div
            custom={5} variants={fadeUp} initial="hidden" animate="show"
            className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-4 content-start">

            {/* Assigned to me */}
            <a href="/tickets?assigned_to_me=true" className="col-span-1">
              <div className="bg-gradient-to-br from-blue-900 to-blue-700 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow cursor-pointer h-full">
                <ClipboardCheck className="w-5 h-5 mb-3 opacity-70" />
                <p className="text-3xl font-bold">{s?.assigned_to_me ?? 0}</p>
                <p className="text-sm text-blue-200 mt-1">Assigned to me</p>
              </div>
            </a>

            {/* New unread */}
            <a href="/tickets?status=new" className="col-span-1">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <Circle className="w-5 h-5 mb-3 text-indigo-400" />
                <p className="text-3xl font-bold text-gray-900">{s?.new ?? 0}</p>
                <p className="text-sm text-gray-500 mt-1">New unread</p>
              </div>
            </a>

            {/* Resolved */}
            <a href="/tickets?status=resolved" className="col-span-1">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <CheckCircle2 className="w-5 h-5 mb-3 text-green-500" />
                <p className="text-3xl font-bold text-gray-900">{s?.resolved ?? 0}</p>
                <p className="text-sm text-gray-500 mt-1">Resolved</p>
              </div>
            </a>

            {/* Closed */}
            <a href="/tickets?status=closed" className="col-span-1">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <TrendingUp className="w-5 h-5 mb-3 text-gray-400" />
                <p className="text-3xl font-bold text-gray-900">{s?.closed ?? 0}</p>
                <p className="text-sm text-gray-500 mt-1">Closed</p>
              </div>
            </a>

            {/* Status breakdown chart */}
            {pieData.length > 0 && (
              <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-900" /> Status Breakdown
                </p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={90} height={90}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                          <span className="text-gray-600">{d.name}</span>
                        </div>
                        <span className="font-semibold text-gray-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* â”€â”€ Latest Activity / Recent Tickets â”€â”€ */}
        <motion.div
          custom={6} variants={fadeUp} initial="hidden" animate="show"
          className="col-span-12 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-900" />
              <h2 className="font-semibold text-gray-900">{isAgent ? 'Latest Activity' : 'Recent Tickets'}</h2>
            </div>
            <a href="/tickets" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </a>
          </div>
          {recentTickets.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <TicketIcon className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400 mb-3">No tickets yet</p>
              <a href="/tickets/new"><Button size="sm">Submit first ticket</Button></a>
            </div>
          ) : (
            <div className={`grid ${isAgent ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-gray-50`}>
              {recentTickets.slice(0, isAgent ? 8 : 8).map((t) => (
                <a key={t.id} href={`/tickets/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group border-b border-gray-50">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_BAR[t.priority] ?? 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.ticket_number} Â· {formatDate(t.created_at)}</p>
                  </div>
                  <Badge className={`${STATUS_COLORS[t.status]} text-xs flex-shrink-0`}>{t.status_display}</Badge>
                </a>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  )
}
