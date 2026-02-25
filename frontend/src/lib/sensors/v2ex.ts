// ABOUTME: V2EX sensor using the public hot topics JSON API.
// ABOUTME: Fetches trending topics from the V2EX Chinese tech community; no authentication required.
import type { ConfigSettings, IntelItem } from '../models'

const V2EX_HOT_API = 'https://www.v2ex.com/api/topics/hot.json'

export async function fetchV2ex(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(V2EX_HOT_API, {
      headers: { 'User-Agent': 'Intel-Briefing/1.0' },
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from V2EX`)
    const data = await resp.json() as Array<Record<string, unknown>>

    const items: IntelItem[] = []
    for (const topic of data.slice(0, limit)) {
      const replies = topic.replies ?? 0
      const topicId = String(topic.id ?? '')
      items.push({
        id: `v2ex-${topicId}`,
        source: 'v2ex',
        title: String(topic.title ?? ''),
        url: String(topic.url ?? ''),
        heat: `${replies} replies`,
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
