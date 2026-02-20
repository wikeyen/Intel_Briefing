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
  const actors = [...config.social_accounts_bluesky]
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
    const { data } = await agent.getAuthorFeed({ actor, limit: Math.min(5, limit) })
    for (const feedItem of data.feed) {
      if (items.length >= limit) break
      const item = blueskyPostToItem(feedItem.post as unknown as Record<string, unknown>, 'accounts')
      if (item) items.push(item)
    }
  }
  return items
}

async function fetchMastodonAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.mastodon_token) return []

  // Merge manual accounts with following list when toggle is on (dedup by acct)
  const accts = [...config.social_accounts_mastodon]
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
    const lookup = await mastodonGet<Record<string, unknown>>(
      `/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, config.mastodon_token,
    ).catch(() => null)
    if (!lookup) continue
    const accountId = String(lookup.id ?? '')
    if (!accountId) continue
    const statuses = await mastodonGet<Array<Record<string, unknown>>>(
      `/api/v1/accounts/${accountId}/statuses?limit=5`, config.mastodon_token,
    )
    for (const status of statuses) {
      if (items.length >= limit) break
      const item = mastodonStatusToItem(status, 'accounts')
      if (item) items.push(item)
    }
  }
  return items
}

export async function fetchSocialAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const hasBsky = config.bluesky_handle && config.bluesky_app_password &&
    (config.social_accounts_bluesky.length > 0 || config.social_following_bluesky)
  const hasMasto = config.mastodon_token &&
    (config.social_accounts_mastodon.length > 0 || config.social_following_mastodon)

  if (!hasBsky && !hasMasto) {
    throw new SensorConfigError('No social accounts configured on Bluesky or Mastodon')
  }

  const results = await Promise.allSettled([
    fetchBlueskyAccounts(config, limit),
    fetchMastodonAccounts(config, limit),
  ])

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
