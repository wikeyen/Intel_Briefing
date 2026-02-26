// ABOUTME: Shared authentication utilities for cron routes and middleware.
// ABOUTME: Provides timing-safe string comparison and cron secret verification.
import { NextRequest, NextResponse } from 'next/server'

/** Constant-time string comparison to prevent timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

/**
 * Verify CRON_SECRET from the Authorization header.
 * Returns a 401 NextResponse if authentication fails, or null if the request is authorized.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return null

  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${cronSecret}`
  if (!authHeader || !timingSafeEqual(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
