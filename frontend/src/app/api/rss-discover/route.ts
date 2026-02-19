// ABOUTME: API route for RSS feed auto-discovery — checks if a URL is a feed or discovers one from HTML.
// ABOUTME: GET /api/rss-discover?url=<url> delegates to discoverFeed() and returns the result as JSON.
import { NextRequest, NextResponse } from 'next/server'
import { discoverFeed } from '@/lib/rss-discovery'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const result = await discoverFeed(url)
  return NextResponse.json(result)
}
