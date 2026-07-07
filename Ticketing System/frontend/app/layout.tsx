import type { Metadata } from 'next'
import './globals.css'
import { FaviconSetter } from '@/app/components/FaviconSetter'

export const metadata: Metadata = {
  title: 'Helpdesk & Ticketing System',
  description: 'Unified support portal',
}

// This is an authenticated app where every page's content depends on the
// logged-in user, not something that benefits from Next's static Full
// Route Cache. Worse, that cache was the actual cause of "URL changes but
// the screen doesn't update" after a redeploy: a client could be served a
// cached HTML shell referencing a previous build's JS chunk files, which
// get deleted from disk on every fresh `next build` - the click updates
// the URL, but the fetch for that cached page's assets silently fails.
// Forcing every route to render fresh removes that entire class of bug.
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body suppressHydrationWarning className="h-full bg-gray-50 antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <FaviconSetter />
        {children}
      </body>
    </html>
  )
}
