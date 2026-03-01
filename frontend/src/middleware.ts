// ABOUTME: Next.js middleware enforcing API key auth and cache-busting on /api/* routes.
// ABOUTME: Adds no-cache headers to prevent browsers/proxies from serving stale API data.
import { type NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from '@/lib/cron-auth'

/** Set cache-busting headers on a response to prevent stale API data. */
function setNoCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}

export function middleware(req: NextRequest) {
  // Cron routes handle their own auth via CRON_SECRET
  if (req.nextUrl.pathname.startsWith('/api/cron/')) {
    return setNoCacheHeaders(NextResponse.next())
  }

  const requiredKey = process.env.API_KEY
  if (!requiredKey) {
    // Open mode — no key configured
    return setNoCacheHeaders(NextResponse.next())
  }

  const providedKey = req.headers.get('x-api-key')
  if (!providedKey || !timingSafeEqual(providedKey, requiredKey)) {
    return setNoCacheHeaders(new NextResponse('Unauthorized', { status: 401 }))
  }

  return setNoCacheHeaders(NextResponse.next())
}

export const config = {
  matcher: '/api/:path*',
}
