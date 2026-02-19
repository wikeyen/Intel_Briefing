// ABOUTME: Topics sensor -- monitors configurable keywords and hashtags on X via Grok API.
// ABOUTME: Returns recent matching posts as structured IntelItem objects; deduplicates multi-keyword matches.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'

const SYSTEM_PROMPT =
  'You are a social media intelligence analyst tracking specific topics on X (Twitter). ' +
  'Return ONLY a valid JSON array with no markdown fences and no extra text. ' +
  'Each element must be a JSON object with exactly these keys: ' +
  '{"topic": "<the keyword or hashtag that matched>", "handle": "<@author handle>", ' +
  '"title": "<post text, max 280 chars>", "url": "<direct post URL or empty string>", ' +
  '"published_at": "<ISO date YYYY-MM-DD or empty string>"}. ' +
  'Only include REAL posts from the last 48 hours. If a post matches multiple topics, ' +
  'include it once under the first matching topic. Return 0–20 items total.'

function buildUserPrompt(keywords: string[], today: string): string {
  const kwList = keywords.join(', ')
  return (
    `Today is ${today}. Search X for recent posts about these topics or hashtags: ${kwList}. ` +
    'For each topic, find 1–3 high-signal posts from the last 48 hours. ' +
    'Deduplicate: if the same post matches multiple topics, include it once under the first matching topic. ' +
    'Return a JSON array. No markdown, no prose — JSON only.'
  )
}

function parseResponse(text: string): Array<Record<string, unknown>> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.split('\n').filter((line) => !line.startsWith('```')).join('\n').trim()
  }
  try {
    const data = JSON.parse(cleaned)
    if (Array.isArray(data)) return data
  } catch { /* ignore */ }
  return []
}

export async function fetchTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key) throw new SensorConfigError('xAI API key not configured')
  if (!config.topics_keywords || config.topics_keywords.length === 0) throw new SensorConfigError('No topic keywords configured')

  const today = new Date().toISOString().slice(0, 10)
  const resp = await fetch(config.xai_base_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.xai_api_key}`,
    },
    body: JSON.stringify({
      model: config.xai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(config.topics_keywords, today) },
      ],
      stream: false,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`xAI API ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = await resp.json() as Record<string, unknown>
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  const content = String((choices?.[0]?.message as Record<string, unknown>)?.content ?? '')

  const rawItems = parseResponse(content)
  const items: IntelItem[] = []
  const seenUrls = new Set<string>()

  for (let idx = 0; idx < Math.min(rawItems.length, limit); idx++) {
    const raw = rawItems[idx]
    if (typeof raw !== 'object') continue
    const title = String(raw.title ?? '').trim()
    if (!title) continue

    const url = String(raw.url ?? '')
    if (url && seenUrls.has(url)) continue
    if (url) seenUrls.add(url)

    const handle = String(raw.handle ?? '').trim().replace(/^@/, '')
    const topic = String(raw.topic ?? '').trim()

    items.push({
      id: `topics-${today}-${idx}`,
      source: 'topics',
      title,
      url,
      handle: handle || null,
      topic: topic || null,
      published_at: String(raw.published_at ?? today) || null,
    })
  }
  return items
}
