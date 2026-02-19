// ABOUTME: Politics sensor -- monitors political leaders' X (Twitter) accounts via Grok API.
// ABOUTME: Returns recent posts from configurable handles as structured IntelItem objects.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'

const SYSTEM_PROMPT =
  'You are a political intelligence analyst monitoring social media. ' +
  'Return ONLY a valid JSON array with no markdown fences and no extra text. ' +
  'Each element must be a JSON object with exactly these keys: ' +
  '{"handle": "<@handle>", "account": "<Display Name>", "title": "<post text, max 280 chars>", ' +
  '"url": "<direct post URL or empty string>", "published_at": "<ISO date YYYY-MM-DD or empty string>"}. ' +
  'Only include REAL posts from the last 48 hours. Return 0–20 items total across all handles.'

function buildUserPrompt(handles: string[], today: string): string {
  const handleList = handles.join(', ')
  return (
    `Today is ${today}. Search X for recent posts from these political accounts: ${handleList}. ` +
    'For each account, find their 1–3 most significant posts from the last 48 hours. ' +
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

export async function fetchPolitics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key) throw new SensorConfigError('xAI API key not configured')
  if (!config.politics_accounts || config.politics_accounts.length === 0) throw new SensorConfigError('No politics accounts configured')

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
        { role: 'user', content: buildUserPrompt(config.politics_accounts, today) },
      ],
      stream: false,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`xAI API ${resp.status}: ${body}`)
  }
  const data = await resp.json() as Record<string, unknown>
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  const content = String((choices?.[0]?.message as Record<string, unknown>)?.content ?? '')

  const rawItems = parseResponse(content)
  const items: IntelItem[] = []
  for (let idx = 0; idx < Math.min(rawItems.length, limit); idx++) {
    const raw = rawItems[idx]
    if (typeof raw !== 'object') continue
    const title = String(raw.title ?? '').trim()
    const handle = String(raw.handle ?? '').trim().replace(/^@/, '')
    if (!title) continue
    items.push({
      id: `politics-${today}-${idx}`,
      source: 'politics',
      title,
      url: String(raw.url ?? ''),
      account: String(raw.account ?? handle),
      handle: handle || null,
      published_at: String(raw.published_at ?? today) || null,
    })
  }
  return items
}
