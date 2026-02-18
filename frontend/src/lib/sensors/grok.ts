// ABOUTME: Grok/xAI sensor for X (Twitter) tech trend intelligence.
// ABOUTME: Queries the Grok API for trending tech discussions; returns structured IntelItem list.
import type { ConfigSettings, IntelItem } from '../models'

const SYSTEM_PROMPT =
  'You are a tech intelligence analyst. Return ONLY a valid JSON array with no markdown fences, ' +
  'no explanation, no extra text. Each element must be a JSON object with exactly these keys: ' +
  '{"title": "<post or trend title>", "url": "<direct URL or empty string>", "heat": "<engagement metric or empty string>", "summary": "<one sentence summary>"}. ' +
  'Focus on the last 24 hours only. Return 0–15 items.'

function buildUserPrompt(today: string): string {
  return (
    `Today is ${today}. Search X (Twitter) for the top trending tech discussions, ` +
    'product launches, AI breakthroughs, and developer news from the last 24 hours. ' +
    'Return a JSON array of the most significant items. No markdown, no prose — JSON only.'
  )
}

function parseGrokResponse(text: string): Array<Record<string, unknown>> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .split('\n')
      .filter((line) => !line.startsWith('```'))
      .join('\n')
      .trim()
  }
  try {
    const data = JSON.parse(cleaned)
    if (Array.isArray(data)) return data
  } catch { /* ignore */ }
  return []
}

export async function fetchGrok(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.xai_api_key) return []

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
        { role: 'user', content: buildUserPrompt(today) },
      ],
      stream: false,
      temperature: 0.4,
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

  const rawItems = parseGrokResponse(content)
  const items: IntelItem[] = []
  for (let idx = 0; idx < Math.min(rawItems.length, limit); idx++) {
    const raw = rawItems[idx]
    if (typeof raw !== 'object') continue
    const title = String(raw.title ?? '').trim()
    if (!title) continue
    items.push({
      id: `grok-${today}-${idx}`,
      source: 'grok',
      title,
      url: String(raw.url ?? ''),
      heat: String(raw.heat ?? '') || null,
      abstract: String(raw.summary ?? '') || null,
      published_at: today,
    })
  }
  return items
}
