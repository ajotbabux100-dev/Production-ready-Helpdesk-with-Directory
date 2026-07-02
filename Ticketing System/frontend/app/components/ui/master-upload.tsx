'use client'
import { useRef, useState } from 'react'
import api from '@/app/lib/api'
import { downloadFile } from '@/app/lib/download'
import { Button } from '@/app/components/ui/button'
import { Modal } from '@/app/components/ui/modal'
import { Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react'

interface ImportResult {
  created: number
  updated: number
  errors: { row: number; error: string }[]
}

interface MasterUploadProps {
  /** GET endpoint (relative to the API base) that returns the .xlsx template. */
  templateUrl: string
  /** POST endpoint (relative to the API base) that accepts the filled-in .xlsx as multipart "file". */
  importUrl: string
  /** Extra form fields to send alongside the file, e.g. { tab: activeTab } for per-tab directory imports. */
  extraFields?: Record<string, string | number>
  /** Called after a successful import so the caller can refetch its list. */
  onImported?: () => void
  /** Human label used in button text/errors, e.g. "Users", "Portals". */
  label: string
}

export function MasterUpload({ templateUrl, importUrl, extraFields, onImported, label }: MasterUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [error, setError] = useState('')

  const downloadTemplate = async () => {
    setDownloading(true)
    setError('')
    try {
      await downloadFile(templateUrl, `${label.toLowerCase()}_template.xlsx`)
    } catch (e: any) {
      setError(e.response?.data?.error || `Could not download the ${label} template.`)
    } finally {
      setDownloading(false)
    }
  }

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      Object.entries(extraFields ?? {}).forEach(([k, v]) => fd.append(k, String(v)))
      const res = await api.post(importUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      setResultOpen(true)
      onImported?.()
    } catch (e: any) {
      setError(e.response?.data?.error || `Could not import the ${label} file. Make sure it matches the downloaded template.`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={downloadTemplate} loading={downloading} title={`Download a blank ${label} Excel template`}>
        <Download className="w-4 h-4 mr-1.5" /> Template
      </Button>
      <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={uploading} title={`Upload a filled-in ${label} Excel file`}>
        <Upload className="w-4 h-4 mr-1.5" /> Upload
      </Button>
      <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFilePicked} />

      {error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 shadow-lg">
          {error}
        </div>
      )}

      <Modal open={resultOpen} onClose={() => setResultOpen(false)} title={`${label} Import Result`}>
        <div className="p-6 space-y-4">
          {result && (
            <>
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{result.created} created, {result.updated} updated.</span>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {result.errors.length} row{result.errors.length === 1 ? '' : 's'} skipped
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {result.errors.map((err, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">Row {err.row}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setResultOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
