// ABOUTME: Bluesky platform adapter — AT Protocol API client for feed/search operations.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { BskyAgent } from '@atproto/api'
import { SensorConfigError } from '../sensors/errors'
import type { IntelItem } from '../models'

/** Create and authenticate a Bluesky agent. */
export async function createBlueskyAgent(handle: string, appPassword: string): Promise<BskyAgent> {
  if (!handle || !appPassword) throw new SensorConfigError('Bluesky credentials not configured')
  const agent = new BskyAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password: appPassword })
  return agent
}

/** Extract the post rkey from an AT URI (at://did:plc:.../app.bsky.feed.post/RKEY). */
export function extractPostId(uri: string): string {
  return uri.split('/').pop() ?? uri
}

/** Build a bsky.app post URL from author handle and post rkey. */
export function buildPostUrl(authorHandle: string, rkey: string): string {
  return `https://bsky.app/profile/${authorHandle}/post/${rkey}`
}

/** Format engagement metrics from a Bluesky post view. */
export function formatBlueskyHeat(likeCount: number, repostCount: number): string | null {
  const parts: string[] = []
  if (likeCount > 0) parts.push(`${likeCount} likes`)
  if (repostCount > 0) parts.push(`${repostCount} reposts`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Convert a Bluesky post view object into an IntelItem. */
export function blueskyPostToItem(
  post: Record<string, unknown>,
  sensorPrefix: string,
): IntelItem | null {
  const author = post.author as Record<string, unknown> | undefined
  const record = post.record as Record<string, unknown> | undefined
  if (!author || !record) return null

  const text = String(record.text ?? '').trim()
  if (!text) return null

  const uri = String(post.uri ?? '')
  const rkey = extractPostId(uri)
  const handle = String(author.handle ?? '')

  return {
    id: `bluesky-${sensorPrefix}-${rkey}`,
    source: 'bluesky',
    title: text,
    url: buildPostUrl(handle, rkey),
    heat: formatBlueskyHeat(
      Number(post.likeCount ?? 0),
      Number(post.repostCount ?? 0),
    ),
    published_at: String(record.createdAt ?? '') || null,
    account: String(author.displayName ?? handle),
    handle: handle || null,
  }
}
