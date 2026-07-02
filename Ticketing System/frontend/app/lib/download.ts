import api from './api'

/** Fetches a file-download endpoint as a blob and triggers a browser save,
 * using the server's Content-Disposition filename when present. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: 'blob' })
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
