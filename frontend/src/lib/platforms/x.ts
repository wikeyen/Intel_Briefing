// ABOUTME: X platform adapter — wraps xAI Grok chat completion API.
// ABOUTME: Shared by social_accounts, social_topics, and social_trends sensors.
import { SensorConfigError } from '../sensors/errors'

export interface GrokQuery {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
}

/** Parse Grok response text, stripping markdown fences if present. */
export function parseGrokJson(text: string): Array<Record<string, unknown>> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.split('\n').filter(line => !line.startsWith('```')).join('\n').trim()
  }
  try {
    const data = JSON.parse(cleaned)
    if (Array.isArray(data)) return data
  } catch { /* ignore */ }
  return []
}

/** Send a chat completion to xAI Grok and return parsed JSON array. */
export async function queryGrok(query: GrokQuery): Promise<Array<Record<string, unknown>>> {
  if (!query.apiKey) throw new SensorConfigError('xAI API key not configured')

  const resp = await fetch(query.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${query.apiKey}`,
    },
    body: JSON.stringify({
      model: query.model,
      messages: [
        { role: 'system', content: query.systemPrompt },
        { role: 'user', content: query.userPrompt },
      ],
      stream: false,
      temperature: query.temperature ?? 0.3,
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
  return parseGrokJson(content)
}
