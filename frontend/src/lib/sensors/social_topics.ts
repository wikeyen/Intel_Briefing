// ABOUTME: Social topics sensor — tracks keywords and hashtags across X, Bluesky, and Mastodon.
// ABOUTME: Aggregates matching posts from multiple platforms into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { queryGrok } from '../platforms/x'
import { createBlueskyAgent, blueskyPostToItem } from '../platforms/bluesky'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'

const X_SYSTEM_PROMPT =
  'You are a social media intelligence analyst tracking specific topics on X (Twitter). ' +
  'Return ONLY a valid JSON array with no markdown fences and no extra text. ' +
  'Each element must be a JSON object with exactly these keys: ' +
  '{"topic": "<the keyword or hashtag that matched>", "handle": "<@author handle>", ' +
  '"title": "<post text, max 280 chars>", "url": "<direct post URL or empty string>", ' +
  '"published_at": "<ISO date YYYY-MM-DD or empty string>"}. ' +
  'Only include REAL posts from the last 48 hours. If a post matches multiple topics, ' +
  'include it once under the first matching topic. Return 0–20 items total.'

function buildXPrompt(keywords: string[], today: string): string {
  return (
    `Today is ${today}. Search X for recent posts about these topics or hashtags: ${keywords.join(', ')}. ` +
    'For each topic, find 1–3 high-signal posts from the last 48 hours. ' +
    'Deduplicate: if the same post matches multiple topics, include it once under the first matching topic. ' +
    'Return a JSON array. No markdown, no prose — JSON only.'
  )
}

async function fetchXTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key || config.social_topics_keywords.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const raw = await queryGrok({
    apiKey: config.xai_api_key, baseUrl: config.xai_base_url, model: config.xai_model,
    systemPrompt: X_SYSTEM_PROMPT, userPrompt: buildXPrompt(config.social_topics_keywords, today),
  })
  const items: IntelItem[] = []
  const seenUrls = new Set<string>()
  for (let idx = 0; idx < Math.min(raw.length, limit); idx++) {
    const r = raw[idx]
    if (typeof r !== 'object') continue
    const title = String(r.title ?? '').trim()
    if (!title) continue
    const url = String(r.url ?? '')
    if (url && seenUrls.has(url)) continue
    if (url) seenUrls.add(url)
    const handle = String(r.handle ?? '').trim().replace(/^@/, '')
    items.push({
      id: `x-topics-${today}-${idx}`,
      source: 'x',
      title, url,
      handle: handle || null,
      topic: String(r.topic ?? '') || null,
      published_at: String(r.published_at ?? today) || null,
    })
  }
  return items
}

async function fetchBlueskyTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password || config.social_topics_keywords.length === 0) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)
  const items: IntelItem[] = []
  for (const keyword of config.social_topics_keywords) {
    if (items.length >= limit) break
    try {
      const { data } = await agent.app.bsky.feed.searchPosts({ q: keyword, limit: Math.min(5, limit) })
      for (const post of data.posts) {
        if (items.length >= limit) break
        const item = blueskyPostToItem(post as unknown as Record<string, unknown>, 'topics')
        if (item) {
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* search may not be available, skip */ }
  }
  return items
}

async function fetchMastodonTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) return []
  const items: IntelItem[] = []
  for (const keyword of config.social_topics_keywords) {
    if (items.length >= limit) break
    const tag = keyword.replace(/^#/, '')
    try {
      const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
        `/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=5`,
      )
      for (const status of statuses) {
        if (items.length >= limit) break
        const item = mastodonStatusToItem(status, 'topics')
        if (item) {
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* tag may not exist, skip */ }
  }
  return items
}

export async function fetchSocialTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) {
    throw new SensorConfigError('No topic keywords configured')
  }

  const results = await Promise.allSettled([
    fetchXTopics(config, limit),
    fetchBlueskyTopics(config, limit),
    fetchMastodonTopics(config, limit),
  ])

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
