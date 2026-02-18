// ABOUTME: Server-side backend client for proxying requests to the Python FastAPI backend.
// ABOUTME: Adds the X-Dev-Proxy header so the backend dev guard accepts the request.

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8001'
const DEV_PROXY_SECRET = process.env.DEV_PROXY_SECRET ?? ''

export function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BACKEND_URL}${path}`
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(DEV_PROXY_SECRET ? { 'X-Dev-Proxy': DEV_PROXY_SECRET } : {}),
    },
  })
}
