'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/app/lib/api'
import { Notification } from '@/app/lib/types'
import { Bell, Check, CheckCheck, Ticket, MessageSquare, AlertTriangle, UserCheck, Clock, X, Volume2, VolumeX } from 'lucide-react'
import { isNotificationSoundEnabled, setNotificationSoundEnabled, playNotificationSound } from '@/app/lib/notificationSound'

const TYPE_ICON: Record<string, React.ReactNode> = {
  ticket_created:   <Ticket className="w-4 h-4" />,
  ticket_assigned:  <UserCheck className="w-4 h-4" />,
  status_updated:   <Clock className="w-4 h-4" />,
  comment_added:    <MessageSquare className="w-4 h-4" />,
  ticket_resolved:  <Check className="w-4 h-4" />,
  ticket_closed:    <X className="w-4 h-4" />,
  sla_breach:       <AlertTriangle className="w-4 h-4" />,
  ticket_escalated: <AlertTriangle className="w-4 h-4" />,
}

const TYPE_COLOR: Record<string, string> = {
  ticket_created:   'bg-blue-50 text-blue-600',
  ticket_assigned:  'bg-purple-50 text-purple-600',
  status_updated:   'bg-indigo-50 text-indigo-600',
  comment_added:    'bg-teal-50 text-teal-600',
  ticket_resolved:  'bg-green-50 text-green-600',
  ticket_closed:    'bg-gray-100 text-gray-500',
  sla_breach:       'bg-red-50 text-red-600',
  ticket_escalated: 'bg-orange-50 text-orange-600',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString()
}

type Filter = 'all' | 'unread'

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [markingAll, setMarkingAll] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => { setSoundEnabled(isNotificationSoundEnabled()) }, [])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    setNotificationSoundEnabled(next)
    if (next) playNotificationSound()
  }

  const fetchNotifications = async () => {
    const res = await api.get('/notifications/')
    setNotifications(res.data.results ?? res.data)
    setLoading(false)
  }

  useEffect(() => { fetchNotifications() }, [])

  const markRead = async (id: number) => {
    await api.patch(`/notifications/${id}/mark_read/`)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    await api.post('/notifications/mark_all_read/')
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setMarkingAll(false)
  }

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id)
    if (n.ticket) router.push(`/tickets/${n.ticket}`)
  }

  const shown = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications
  const unreadCount = notifications.filter((n) => !n.is_read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Turn off notification sound' : 'Turn on notification sound'}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">Sound {soundEnabled ? 'on' : 'off'}</span>
          </button>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['all', 'unread'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              filter === f
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
            {f === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {filter === 'unread' ? 'Switch to "All" to see past notifications' : 'You\'ll be notified when something happens on your tickets'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {shown.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex gap-4 px-5 py-4 transition-colors cursor-pointer ${
                n.ticket ? 'hover:bg-gray-50' : 'cursor-default'
              } ${!n.is_read ? 'bg-blue-50/40' : ''}`}
            >
              {/* Icon */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ${TYPE_COLOR[n.notification_type] ?? 'bg-gray-100 text-gray-500'}`}>
                {TYPE_ICON[n.notification_type] ?? <Bell className="w-4 h-4" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {n.title}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                {n.ticket_number && (
                  <span className="inline-block mt-1.5 text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    {n.ticket_number}
                  </span>
                )}
              </div>

              {/* Unread dot */}
              {!n.is_read && (
                <div className="flex-shrink-0 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
