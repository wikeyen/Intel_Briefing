// ABOUTME: Next.js configuration for Intel Briefing frontend.
// ABOUTME: Standalone output enables Docker deployment without node_modules.
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@libsql/client', 'libsql', 'jsdom', '@mozilla/readability'],
}

export default nextConfig
