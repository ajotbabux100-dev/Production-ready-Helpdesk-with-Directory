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
}

export default nextConfig
