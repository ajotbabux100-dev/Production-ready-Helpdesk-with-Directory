import type { NextConfig } from 'next'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from version.json at build time
let appVersion = '1.0.0'
try {
  const versionFile = resolve(__dirname, '../version.json')
  const { version } = JSON.parse(readFileSync(versionFile, 'utf-8'))
  appVersion = version
} catch {}

// Derive the API origin for connect-src so fetch/axios calls to the Django
// backend aren't blocked by the CSP. Falls back to localhost for dev.
let apiOrigin = 'http://localhost:8000'
try {
  apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || apiOrigin).origin
} catch {}

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      `connect-src 'self' ${apiOrigin}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    NEXT_PUBLIC_VERSION: appVersion,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
