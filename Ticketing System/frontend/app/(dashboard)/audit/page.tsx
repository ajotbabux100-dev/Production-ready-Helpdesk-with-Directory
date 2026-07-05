'use client'
import { useEffect, useState } from 'react'
import api from '@/app/lib/api'
import { downloadFile, postAndDownloadFile } from '@/app/lib/download'
import { useHasPerm } from '@/app/lib/store'
import { Card } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { Modal } from '@/app/components/ui/modal'
import { formatDate } from '@/app/lib/utils'
import { Shield, Download, Trash2, AlertTriangle } from 'lucide-react'

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
  const canExport = useHasPerm('audit', 'export')
  const canDelete = useHasPerm('audit', 'delete')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [backupLoading, setBackupLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Shared with fetchLogs so "what's on screen" always matches "what gets
  // backed up / deleted" - excludes login/logout the same way the table does.
  const filterParams = () => {
    const params = new URLSearchParams({ exclude_actions: 'login,logout' })
    if (search) params.set('search', search)
    return params
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = filterParams()
      params.set('page', String(page))
      const res = await api.get(`/audit/?${params}`)
      setLogs(res.data.results ?? res.data)
      setCount(res.data.count ?? 0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [page, search])

  const handleBackup = async () => {
    setBackupLoading(true)
    try {
      await downloadFile(`/audit/export/?${filterParams()}`, 'audit_log_backup.xlsx')
    } finally { setBackupLoading(false) }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await postAndDownloadFile(`/audit/export-and-delete/?${filterParams()}`, 'audit_log_backup_before_delete.xlsx')
      setConfirmOpen(false)
      setPage(1)
      fetchLogs()
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || 'Failed to delete logs.')
    } finally { setDeleteLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-900" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-sm text-gray-500">Complete record of all system actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <Button variant="outline" size="sm" loading={backupLoading} onClick={handleBackup} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Backup
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDeleteError(''); setConfirmOpen(true) }}
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Logs
            </Button>
          )}
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

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete Audit Logs" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              This deletes {search ? 'every log matching your current search' : 'every log currently shown'}
              {' '}(excluding login/logout events). A backup file will download to your computer
              automatically before anything is deleted — this action cannot be undone otherwise.
            </p>
          </div>
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleteLoading}>Cancel</Button>
            <Button
              onClick={handleDelete}
              loading={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Backup &amp; Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
