// ABOUTME: Next.js configuration for Info Aggregation frontend.
// ABOUTME: Standalone output enables Docker deployment without node_modules.
import type { NextConfig } from 'next'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath,
  assetPrefix: basePath || undefined,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  serverExternalPackages: ['@libsql/client', 'libsql', 'jsdom', '@mozilla/readability', 'turndown', 'apify-client'],
}

export default nextConfig
