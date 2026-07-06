'use client'
import { useEffect } from 'react'
import api from '@/app/lib/api'

/** Applies the admin-uploaded favicon (Settings -> Appearance) as the actual
 * browser tab icon. Next.js's static app/favicon.ico is baked in at build
 * time and otherwise always wins, so without this the upload only ever
 * showed up in the Settings preview - never on the real page. Fetches the
 * public branding endpoint (same one the login page uses, works logged out
 * too) and swaps the <link rel="icon"> href client-side. */
export function FaviconSetter() {
  useEffect(() => {
    api.get('/branding/').then((res) => {
      const url = res.data?.favicon_url
      if (!url) return
      const existing = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
      existing.forEach((el) => el.remove())
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = url
      document.head.appendChild(link)
    }).catch(() => {})
  }, [])

  return null
}
