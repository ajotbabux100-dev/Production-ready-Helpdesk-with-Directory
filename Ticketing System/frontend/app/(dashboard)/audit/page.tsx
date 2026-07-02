'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { Card } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { formatDate } from '@/app/lib/utils'
import { Shield, Search } from 'lucide-react'

interface AuditLog {
  id: number
  user_name: string
  action: string
  action_display: string
  ticket_number: string | null
  description: string
  old_value: string
  new_value: string
  ip_address: string | null
  timestamp: string
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), exclude_actions: 'login,logout' })
      if (search) params.set('search', search)
      const res = await api.get(`/audit/?${params}`)
      setLogs(res.data.results ?? res.data)
      setCount(res.data.count ?? 0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [page, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-900" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500">Complete record of all system actions</p>
        </div>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Timestamp', 'User', 'Action', 'Ticket', 'Description', 'IP'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No logs found.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(log.timestamp)}</td>
                  <td className="px-4 py-3 text-gray-700">{log.user_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {log.action_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ticket_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.description}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{log.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {count > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} of {Math.ceil(count / 20)}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(count / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
