// ABOUTME: Tests for the Next.js middleware that enforces cache-busting headers on API routes.
// ABOUTME: Verifies no-cache headers are set for authenticated, open-mode, and 401 responses.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/cron-auth', () => ({
  timingSafeEqual: (a: string, b: string) => a === b,
}))

// Import middleware once — env changes are read at call time, not import time
import { middleware } from '../middleware'

function assertNoCacheHeaders(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
}

describe('middleware cache-busting headers', () => {
  const savedApiKey = process.env.API_KEY

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.API_KEY = savedApiKey
    } else {
      delete process.env.API_KEY
    }
  })

  it('sets no-cache headers in open mode (no API_KEY configured)', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost:8000/api/intel/latest')
    const res = middleware(req)
    assertNoCacheHeaders(res)
  })

  it('sets no-cache headers for authenticated requests', () => {
    process.env.API_KEY = 'test-secret-key'
    const req = new NextRequest('http://localhost:8000/api/intel/latest', {
      headers: { 'x-api-key': 'test-secret-key' },
    })
    const res = middleware(req)
    assertNoCacheHeaders(res)
  })

  it('sets no-cache headers on 401 responses (bad key)', () => {
    process.env.API_KEY = 'test-secret-key'
    const req = new NextRequest('http://localhost:8000/api/intel/latest', {
      headers: { 'x-api-key': 'wrong-key' },
    })
    const res = middleware(req)
    expect(res.status).toBe(401)
    assertNoCacheHeaders(res)
  })

  it('sets no-cache headers on 401 responses (no key provided)', () => {
    process.env.API_KEY = 'test-secret-key'
    const req = new NextRequest('http://localhost:8000/api/config')
    const res = middleware(req)
    expect(res.status).toBe(401)
    assertNoCacheHeaders(res)
  })

  it('sets no-cache headers on cron routes', () => {
    delete process.env.API_KEY
    const req = new NextRequest('http://localhost:8000/api/cron/fetch')
    const res = middleware(req)
    assertNoCacheHeaders(res)
  })

  it('passes through authenticated requests with 200 status', () => {
    process.env.API_KEY = 'my-api-key'
    const req = new NextRequest('http://localhost:8000/api/health', {
      headers: { 'x-api-key': 'my-api-key' },
    })
    const res = middleware(req)
    expect(res.status).toBe(200)
    assertNoCacheHeaders(res)
  })
})
