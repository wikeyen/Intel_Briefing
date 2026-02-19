// ABOUTME: Mastodon platform adapter — REST API client for mastodon.social.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { SensorConfigError } from '../sensors/errors'
import type { IntelItem } from '../models'

const MASTODON_BASE = 'https://mastodon.social'

/** Strip HTML tags from Mastodon status content. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/** Format engagement metrics from a Mastodon status. */
export function formatMastodonHeat(favourites: number, reblogs: number): string | null {
  const parts: string[] = []
  if (favourites > 0) parts.push(`${favourites} favourites`)
  if (reblogs > 0) parts.push(`${reblogs} boosts`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Authenticated GET request to Mastodon API. */
export async function mastodonGet<T>(path: string, token: string): Promise<T> {
  if (!token) throw new SensorConfigError('Mastodon token not configured')
  const resp = await fetch(`${MASTODON_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Mastodon API ${resp.status}: ${body}`)
  }
  return resp.json() as Promise<T>
}

/** Unauthenticated GET request to Mastodon API (for public endpoints like trends/hashtags). */
export async function mastodonPublicGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${MASTODON_BASE}${path}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Mastodon API ${resp.status}: ${body}`)
  }
  return resp.json() as Promise<T>
}

/** Convert a Mastodon status JSON object into an IntelItem. */
export function mastodonStatusToItem(
  status: Record<string, unknown>,
  sensorPrefix: string,
): IntelItem | null {
  const account = status.account as Record<string, unknown> | undefined
  if (!account) return null

  const content = stripHtml(String(status.content ?? ''))
  if (!content) return null

  return {
    id: `mastodon-${sensorPrefix}-${status.id}`,
    source: 'mastodon',
    title: content,
    url: String(status.url ?? ''),
    heat: formatMastodonHeat(
      Number(status.favourites_count ?? 0),
      Number(status.reblogs_count ?? 0),
    ),
    published_at: String(status.created_at ?? '') || null,
    account: String(account.display_name ?? account.acct ?? ''),
    handle: String(account.acct ?? '') || null,
  }
}
