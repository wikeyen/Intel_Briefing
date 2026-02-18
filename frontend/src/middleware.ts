// ABOUTME: Next.js middleware enforcing API key authentication on all /api/* routes.
// ABOUTME: When API_KEY env var is set, requests must include matching X-API-Key header.
import { type NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const requiredKey = process.env.API_KEY
  if (!requiredKey) {
    // Open mode — no key configured
    return NextResponse.next()
  }

  const providedKey = req.headers.get('x-api-key')
  if (providedKey !== requiredKey) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
