import api from './api'
import { AxiosResponse } from 'axios'

function saveBlobResponse(res: AxiosResponse, fallbackName: string) {
  const disposition: string = res.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : fallbackName

  const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

/** Fetches a file-download endpoint as a blob and triggers a browser save,
 * using the server's Content-Disposition filename when present. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: 'blob' })
  saveBlobResponse(res, fallbackName)
}

/** Same as downloadFile but POSTs - for endpoints that mutate data (e.g. a
 * delete) while returning the resulting file as the response body, so the
 * download and the mutation happen atomically in one request. */
export async function postAndDownloadFile(url: string, fallbackName: string) {
  const res = await api.post(url, null, { responseType: 'blob' })
  saveBlobResponse(res, fallbackName)
}

/** Content types a browser can render natively in a tab, rather than just
 * offering to save. Anything else (Office docs, zips, etc.) has no sane
 * in-browser view, so those should just download instead. */
export function isViewableInBrowser(contentType: string): boolean {
  return (
    contentType.startsWith('image/') ||
    contentType === 'application/pdf' ||
    contentType.startsWith('text/') ||
    contentType === 'audio/mpeg' || contentType.startsWith('audio/') ||
    contentType.startsWith('video/')
  )
}

/** Saves a base64-encoded file that arrived embedded in a JSON response
 * (e.g. a bulk-import's error report riding along with the created/updated
 * counts in the same request) - no separate download request needed. */
export function downloadBase64File(base64: string, filename: string, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const blobUrl = window.URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

/** Fetches a file the same way downloadFile does, but opens it in a new tab
 * instead of forcing a save - the server's Content-Disposition header
 * doesn't matter here since we build the object URL from the fetched blob
 * ourselves rather than navigating the browser directly to the endpoint. */
export async function viewFile(url: string, contentType: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const blob = new Blob([res.data], { type: contentType || res.data.type })
  const blobUrl = window.URL.createObjectURL(blob)
  window.open(blobUrl, '_blank', 'noopener,noreferrer')
  // Revoke well after the new tab has had time to load the resource, rather
  // than immediately - revoking too early can blank out the opened tab.
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
}
