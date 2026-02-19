// ABOUTME: Social accounts sensor — monitors specific accounts across X, Bluesky, and Mastodon.
// ABOUTME: Aggregates posts from configured watch lists into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { queryGrok } from '../platforms/x'
import { createBlueskyAgent, blueskyPostToItem, getBlueskyFollowing } from '../platforms/bluesky'
import { mastodonGet, mastodonStatusToItem, getMastodonFollowing } from '../platforms/mastodon'

const X_SYSTEM_PROMPT =
  'You are a social media intelligence analyst monitoring specific accounts. ' +
  'Return ONLY a valid JSON array with no markdown fences and no extra text. ' +
  'Each element must be a JSON object with exactly these keys: ' +
  '{"handle": "<@handle>", "account": "<Display Name>", "title": "<post text, max 280 chars>", ' +
  '"url": "<direct post URL or empty string>", "published_at": "<ISO date YYYY-MM-DD or empty string>"}. ' +
  'Only include REAL posts from the last 48 hours. Return 0–20 items total across all handles.'

function buildXPrompt(handles: string[], today: string): string {
  return (
    `Today is ${today}. Search X for recent posts from these accounts: ${handles.join(', ')}. ` +
    'For each account, find their 1–3 most significant posts from the last 48 hours. ' +
    'Return a JSON array. No markdown, no prose — JSON only.'
  )
}

async function fetchXAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key || config.social_accounts_x.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const raw = await queryGrok({
    apiKey: config.xai_api_key, baseUrl: config.xai_base_url, model: config.xai_model,
    systemPrompt: X_SYSTEM_PROMPT, userPrompt: buildXPrompt(config.social_accounts_x, today),
  })
  const items: IntelItem[] = []
  for (let idx = 0; idx < Math.min(raw.length, limit); idx++) {
    const r = raw[idx]
    if (typeof r !== 'object') continue
    const title = String(r.title ?? '').trim()
    if (!title) continue
    const handle = String(r.handle ?? '').trim().replace(/^@/, '')
    items.push({
      id: `x-accounts-${today}-${idx}`,
      source: 'x',
      title, url: String(r.url ?? ''),
      account: String(r.account ?? handle), handle: handle || null,
      published_at: String(r.published_at ?? today) || null,
    })
  }
  return items
}

async function fetchBlueskyAccounts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)

  // Merge manual accounts with following list when toggle is on (dedup by handle)
  let actors = [...config.social_accounts_bluesky]
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
  let accts = [...config.social_accounts_mastodon]
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
  const hasX = config.xai_api_key && config.social_accounts_x.length > 0
  const hasBsky = config.bluesky_handle && config.bluesky_app_password &&
    (config.social_accounts_bluesky.length > 0 || config.social_following_bluesky)
  const hasMasto = config.mastodon_token &&
    (config.social_accounts_mastodon.length > 0 || config.social_following_mastodon)

  if (!hasX && !hasBsky && !hasMasto) {
    throw new SensorConfigError('No social accounts configured on any platform')
  }

  const results = await Promise.allSettled([
    fetchXAccounts(config, limit),
    fetchBlueskyAccounts(config, limit),
    fetchMastodonAccounts(config, limit),
  ])

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
