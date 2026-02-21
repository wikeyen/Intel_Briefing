// ABOUTME: Next.js middleware enforcing API key authentication on all /api/* routes.
// ABOUTME: When API_KEY env var is set, requests must include matching X-API-Key header.
import { type NextRequest, NextResponse } from 'next/server'

/** Constant-time string comparison to prevent timing attacks on API keys. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  // Use bitwise OR to accumulate differences without short-circuiting
  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

export function middleware(req: NextRequest) {
  // Cron routes handle their own auth via CRON_SECRET
  if (req.nextUrl.pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  const requiredKey = process.env.API_KEY
  if (!requiredKey) {
    // Open mode — no key configured
    return NextResponse.next()
  }

  const providedKey = req.headers.get('x-api-key')
  if (!providedKey || !timingSafeEqual(providedKey, requiredKey)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
