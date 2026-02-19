// ABOUTME: Social trends sensor — surfaces trending content across X, Bluesky, and Mastodon.
// ABOUTME: Aggregates trending posts and discussions into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { queryGrok } from '../platforms/x'
import { createBlueskyAgent, blueskyPostToItem } from '../platforms/bluesky'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'

const X_SYSTEM_PROMPT =
  'You are a tech intelligence analyst. Return ONLY a valid JSON array with no markdown fences, ' +
  'no explanation, no extra text. Each element must be a JSON object with exactly these keys: ' +
  '{"title": "<post or trend title>", "url": "<direct URL or empty string>", ' +
  '"heat": "<engagement metric or empty string>", "summary": "<one sentence summary>"}. ' +
  'Focus on the last 24 hours only. Return 0–15 items.'

function buildXPrompt(today: string): string {
  return (
    `Today is ${today}. Search X (Twitter) for the top trending tech discussions, ` +
    'product launches, AI breakthroughs, and developer news from the last 24 hours. ' +
    'Return a JSON array of the most significant items. No markdown, no prose — JSON only.'
  )
}

async function fetchXTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key) return []
  const today = new Date().toISOString().slice(0, 10)
  const raw = await queryGrok({
    apiKey: config.xai_api_key, baseUrl: config.xai_base_url, model: config.xai_model,
    systemPrompt: X_SYSTEM_PROMPT, userPrompt: buildXPrompt(today),
    temperature: 0.4,
  })
  const items: IntelItem[] = []
  for (let idx = 0; idx < Math.min(raw.length, limit); idx++) {
    const r = raw[idx]
    if (typeof r !== 'object') continue
    const title = String(r.title ?? '').trim()
    if (!title) continue
    items.push({
      id: `x-trends-${today}-${idx}`,
      source: 'x',
      title, url: String(r.url ?? ''),
      heat: String(r.heat ?? '') || null,
      abstract: String(r.summary ?? '') || null,
      published_at: today,
    })
  }
  return items
}

async function fetchBlueskyTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)
  const { data } = await agent.getTimeline({ limit: Math.min(50, limit * 3) })
  // Sort by engagement (likes + reposts) and take the top items
  const scored = data.feed.map(f => ({
    post: f.post,
    score: Number((f.post as unknown as Record<string, unknown>).likeCount ?? 0) +
           Number((f.post as unknown as Record<string, unknown>).repostCount ?? 0),
  }))
  scored.sort((a, b) => b.score - a.score)
  const items: IntelItem[] = []
  for (const { post } of scored.slice(0, limit)) {
    const item = blueskyPostToItem(post as unknown as Record<string, unknown>, 'trends')
    if (item) items.push(item)
  }
  return items
}

async function fetchMastodonTrends(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
    `/api/v1/trends/statuses?limit=${Math.min(20, limit)}`,
  )
  const items: IntelItem[] = []
  for (const status of statuses) {
    if (items.length >= limit) break
    const item = mastodonStatusToItem(status, 'trends')
    if (item) items.push(item)
  }
  return items
}

export async function fetchSocialTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const hasX = !!config.xai_api_key
  const hasBsky = !!(config.bluesky_handle && config.bluesky_app_password)
  // Mastodon trends endpoint is public — always available

  if (!hasX && !hasBsky) {
    // Mastodon trends is always tried since it's public, but if user has no
    // credentials at all for any platform, we still attempt Mastodon public trends
  }

  const results = await Promise.allSettled([
    fetchXTrends(config, limit),
    fetchBlueskyTrends(config, limit),
    fetchMastodonTrends(config, limit),
  ])

  const items: IntelItem[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push(String(r.reason))
  }

  // Only throw if ALL platforms failed
  if (items.length === 0 && errors.length === 3) {
    throw new SensorConfigError('No platform available for trends — configure xAI, Bluesky, or check Mastodon connectivity')
  }

  return items.slice(0, limit)
}
