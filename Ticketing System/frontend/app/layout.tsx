import type { Metadata } from 'next'
import './globals.css'
import { FaviconSetter } from '@/app/components/FaviconSetter'

export const metadata: Metadata = {
  title: 'Helpdesk & Ticketing System',
  description: 'Unified support portal',
}

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
