// ABOUTME: Compatibility route for deployed clients requesting GET /api/pipeline/status.
// ABOUTME: Mirrors the canonical /api/fetch/status pipeline status response.
export const dynamic = 'force-dynamic'
export { GET } from '@/app/api/fetch/status/route'
