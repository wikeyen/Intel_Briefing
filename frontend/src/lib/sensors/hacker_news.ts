// ABOUTME: Hacker News sensor using the official Firebase REST API.
// ABOUTME: Fetches top stories without authentication and returns IntelItem objects.
import type { ConfigSettings, IntelItem } from '../models'

export async function fetchHackerNews(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return []
    const storyIds = await resp.json() as number[]

    const candidateIds = storyIds.slice(0, Math.min(limit * 2, 30))
    const items: IntelItem[] = []

    for (const storyId of candidateIds) {
      if (items.length >= limit) break
      try {
        const itemResp = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`,
          { signal: AbortSignal.timeout(10000) },
        )
        if (!itemResp.ok) continue
        const item = await itemResp.json() as Record<string, unknown>
        if (!item || item.type !== 'story') continue

        const score = Number(item.score ?? 0)
        const descendants = Number(item.descendants ?? 0)
        const url = (item.url as string) || `https://news.ycombinator.com/item?id=${storyId}`

        items.push({
          id: `hn-${storyId}`,
          source: 'hacker_news',
          title: String(item.title ?? ''),
          url,
          heat: `${score} pts, ${descendants} comments`,
          published_at: null,
        })
      } catch {
        continue
      }
    }
    return items
  } catch {
    return []
  }
}
