'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Ticket, MessageSquare, AlertTriangle, UserCheck, Clock, Check, X } from 'lucide-react'
import api from '@/app/lib/api'
import { Notification } from '@/app/lib/types'
import { playNotificationSound } from '@/app/lib/notificationSound'

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

const POLL_INTERVAL_MS = 20 * 1000
const AUTO_DISMISS_MS = 8 * 1000
const LAST_SEEN_KEY = 'notif_last_seen_id'
const MAX_VISIBLE_TOASTS = 4

export function NotificationToasts() {
  const [toasts, setToasts] = useState<Notification[]>([])
  const lastSeenIdRef = useRef<number>(
    typeof window === 'undefined' ? 0 : Number(window.localStorage.getItem(LAST_SEEN_KEY) || 0)
  )
  const initializedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await api.get('/notifications/', { params: { ordering: '-created_at' } })
        const list: Notification[] = res.data.results ?? res.data
        if (cancelled || !list.length) return

        // First poll after a fresh login/page load just establishes the
        // baseline - otherwise every unread notification from before this
        // session would replay as a toast the moment the dashboard opens.
        if (!initializedRef.current) {
          initializedRef.current = true
          if (lastSeenIdRef.current === 0) {
            lastSeenIdRef.current = list[0].id
            window.localStorage.setItem(LAST_SEEN_KEY, String(list[0].id))
          }
          return
        }

        const fresh = list.filter((n) => n.id > lastSeenIdRef.current).reverse()
        if (!fresh.length) return

        lastSeenIdRef.current = list[0].id
        window.localStorage.setItem(LAST_SEEN_KEY, String(list[0].id))

        setToasts((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE_TOASTS))
        playNotificationSound()
        fresh.forEach((n) => {
          setTimeout(() => dismiss(n.id), AUTO_DISMISS_MS)
        })
      } catch {
        // Transient network/auth hiccup - just try again next interval.
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const handleClick = async (n: Notification) => {
    dismiss(n.id)
    try { await api.patch(`/notifications/${n.id}/mark_read/`) } catch {}
    if (n.ticket) window.location.href = `/tickets/${n.ticket}`
  }

  return (
    <div className="fixed top-16 right-3 sm:right-6 z-[60] flex flex-col gap-2 w-[calc(100%-1.5rem)] sm:w-96 pointer-events-none">
      <AnimatePresence>
        {toasts.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden cursor-pointer"
            onClick={() => handleClick(n)}
          >
            <div className="flex gap-3 p-4">
              <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${TYPE_COLOR[n.notification_type] ?? 'bg-gray-100 text-gray-500'}`}>
                {TYPE_ICON[n.notification_type] ?? <Bell className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                className="flex-shrink-0 p-1 -m-1 h-fit rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
