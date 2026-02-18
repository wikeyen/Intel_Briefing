// ABOUTME: Catch-all API gateway route — forwards all /api/* requests to the Python backend.
// ABOUTME: Strips the /api prefix and streams the response back unchanged.
import { type NextRequest } from 'next/server'
import { backendFetch } from '@/lib/backend'

async function handler(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params
  const backendPath = '/' + proxy.join('/')
  const search = req.nextUrl.search ?? ''

  const backendRes = await backendFetch(backendPath + search, {
    method: req.method,
    headers: Object.fromEntries(req.headers),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    // @ts-expect-error — Node fetch supports duplex for streaming
    duplex: 'half',
  })

  return new Response(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: backendRes.headers,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
