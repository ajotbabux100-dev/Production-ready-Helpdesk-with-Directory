import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-OM', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-OM', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(dateStr))
}

/** Only allow http(s) URLs to be rendered as a clickable <a href> - blocks
 * javascript: (and other executable-scheme) URIs stored in free-text URL
 * fields (vault entries, directory portals) from running in this app's
 * origin when clicked. Returns undefined (renders no href) if unsafe. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url.trim()) ? url : undefined
}
