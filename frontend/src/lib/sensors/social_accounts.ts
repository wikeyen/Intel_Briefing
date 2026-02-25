// ABOUTME: Social accounts sensor — monitors specific accounts across Bluesky and Mastodon.
// ABOUTME: Aggregates posts from configured watch lists into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { createBlueskyAgent, blueskyPostToItem, getBlueskyFollowing } from '../platforms/bluesky'
import { mastodonGet, mastodonStatusToItem, getMastodonFollowing } from '../platforms/mastodon'

async function fetchBlueskyAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)

  // Merge manual accounts with following list when toggle is on (dedup by handle)
  const disabled = new Set(config.social_accounts_disabled ?? [])
  const actors = config.social_accounts_bluesky.filter(h => !disabled.has(h))
  if (config.social_following_bluesky) {
    const following = await getBlueskyFollowing(agent)
    const seen = new Set(actors.map(h => h.toLowerCase()))
    for (const handle of following) {
      if (!seen.has(handle.toLowerCase())) {
        actors.push(handle)
        seen.add(handle.toLowerCase())
      }
    }
  }
  if (actors.length === 0) return []

  const items: IntelItem[] = []
  for (const actor of actors) {
    if (items.length >= limit) break
    try {
      const { data } = await agent.getAuthorFeed({ actor, limit: Math.min(10, limit * 2) })

      // Stitch first self-reply text into parent post before converting
      stitchBlueskyReplies(data.feed as unknown as BlueskyFeedItem[])

      for (const feedItem of data.feed) {
        if (items.length >= limit) break
        // Skip replies (self-replies already stitched into parents)
        const reply = (feedItem as unknown as BlueskyFeedItem).reply
        if (reply) continue
        const item = blueskyPostToItem(feedItem.post as unknown as Record<string, unknown>, 'accounts')
        if (item) items.push(item)
      }
    } catch (err) {
      console.warn(`[social_accounts] Bluesky fetch failed for ${actor}:`, (err as Error).message)
    }
  }
  return items
}

interface BlueskyFeedItem {
  post: { uri: string; author: { handle: string }; record: { text?: string } }
  reply?: { parent: { uri: string; author: { handle: string }; record: { text?: string } } }
}

/** Stitch first self-reply text into parent Bluesky post (mutates array). */
function stitchBlueskyReplies(feed: BlueskyFeedItem[]): void {
  const byUri = new Map<string, BlueskyFeedItem>()
  for (const item of feed) {
    byUri.set(item.post.uri, item)
  }
  const stitched = new Set<string>()
  for (const item of feed) {
    if (!item.reply?.parent) continue
    const parentUri = item.reply.parent.uri
    const parent = byUri.get(parentUri)
    if (!parent) continue
    if (parent.post.author.handle !== item.post.author.handle) continue
    if (stitched.has(parentUri)) continue // only stitch one reply per parent
    const parentText = parent.post.record.text ?? ''
    const replyText = item.post.record.text ?? ''
    parent.post.record.text = parentText + '\n\n' + replyText
    stitched.add(item.post.uri)
  }
}

async function fetchMastodonAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.mastodon_token) return []

  // Merge manual accounts with following list when toggle is on (dedup by acct)
  const disabled = new Set(config.social_accounts_disabled ?? [])
  const accts = config.social_accounts_mastodon.filter(h => !disabled.has(h))
  if (config.social_following_mastodon) {
    const following = await getMastodonFollowing(config.mastodon_token)
    const seen = new Set(accts.map(a => a.toLowerCase()))
    for (const acct of following) {
      if (!seen.has(acct.toLowerCase())) {
        accts.push(acct)
        seen.add(acct.toLowerCase())
      }
    }
  }
  if (accts.length === 0) return []

  const items: IntelItem[] = []
  for (const acct of accts) {
    if (items.length >= limit) break
    try {
      const lookup = await mastodonGet<Record<string, unknown>>(
        `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, config.mastodon_token,
      ).catch(() => null)
      if (!lookup) continue
      const accountId = String(lookup.id ?? '')
      if (!accountId) continue
      const statuses = await mastodonGet<Array<Record<string, unknown>>>(
        `/api/v1/accounts/${accountId}/statuses?limit=10`, config.mastodon_token,
      )

      // Identify self-replies for thread stitching
      const selfReplyMap = buildMastodonSelfReplyMap(statuses)

      for (const status of statuses) {
        if (items.length >= limit) break
        if (selfReplyMap.stitchedIds.has(String(status.id))) continue // skip stitched reply
        if (status.in_reply_to_id) continue // skip other replies
        const item = mastodonStatusToItem(status, 'accounts')
        if (!item) continue
        // Append self-reply text if one was found
        const replyStatus = selfReplyMap.parentToReply.get(String(status.id))
        if (replyStatus) {
          const replyItem = mastodonStatusToItem(replyStatus, 'accounts')
          if (replyItem) item.title = item.title + '\n\n' + replyItem.title
        }
        items.push(item)
      }
    } catch (err) {
      console.warn(`[social_accounts] Mastodon fetch failed for ${acct}:`, (err as Error).message)
    }
  }
  return items
}

/** Find first self-reply for each parent status. Returns maps for stitching. */
function buildMastodonSelfReplyMap(statuses: Array<Record<string, unknown>>): {
  parentToReply: Map<string, Record<string, unknown>>
  stitchedIds: Set<string>
} {
  const byId = new Map<string, Record<string, unknown>>()
  for (const s of statuses) byId.set(String(s.id), s)

  const parentToReply = new Map<string, Record<string, unknown>>()
  const stitchedIds = new Set<string>()
  for (const status of statuses) {
    const parentId = status.in_reply_to_id
    if (!parentId) continue
    const parent = byId.get(String(parentId))
    if (!parent) continue
    const statusAccount = status.account as Record<string, unknown> | undefined
    const parentAccount = parent.account as Record<string, unknown> | undefined
    if (!statusAccount || !parentAccount) continue
    if (String(statusAccount.id) !== String(parentAccount.id)) continue
    if (parentToReply.has(String(parentId))) continue // only first reply
    parentToReply.set(String(parentId), status)
    stitchedIds.add(String(status.id))
  }
  return { parentToReply, stitchedIds }
}

export async function fetchSocialAccounts(
  config: ConfigSettings,
  limit: number,
  platform?: 'bluesky' | 'mastodon',
): Promise<IntelItem[]> {
  const checkBsky = !platform || platform === 'bluesky'
  const checkMasto = !platform || platform === 'mastodon'

  const hasBsky = checkBsky && config.bluesky_handle && config.bluesky_app_password &&
    (config.social_accounts_bluesky.length > 0 || config.social_following_bluesky)
  const hasMasto = checkMasto && config.mastodon_token &&
    (config.social_accounts_mastodon.length > 0 || config.social_following_mastodon)

  if (!hasBsky && !hasMasto) {
    const target = platform ?? 'Bluesky or Mastodon'
    throw new SensorConfigError(`No social accounts configured on ${target}`)
  }

  const fetches: Promise<IntelItem[]>[] = []
  if (checkBsky) fetches.push(fetchBlueskyAccounts(config, limit))
  if (checkMasto) fetches.push(fetchMastodonAccounts(config, limit))

  const results = await Promise.allSettled(fetches)

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
