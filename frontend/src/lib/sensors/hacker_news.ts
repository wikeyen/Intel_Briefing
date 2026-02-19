// ABOUTME: Hacker News sensor using the official Firebase REST API.
// ABOUTME: Fetches top stories with parallel fetching and top-level comments.
import type { ConfigSettings, IntelItem } from '../models'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'
const MAX_COMMENTS = 5

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

interface HnComment {
  by?: string
  text?: string
}

async function fetchComments(kids: number[]): Promise<string> {
  const commentIds = kids.slice(0, MAX_COMMENTS)
  const settled = await Promise.allSettled(
    commentIds.map(async (id) => {
      const resp = await fetch(`${HN_BASE}/item/${id}.json`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) return null
      return (await resp.json()) as HnComment
    }),
  )

  const lines: string[] = []
  for (const result of settled) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const { by, text } = result.value
    if (!by || !text) continue
    const clean = stripHtml(text).slice(0, 200)
    lines.push(`@${by}: ${clean}`)
  }

  return lines.length > 0 ? `Top comments:\n${lines.join('\n')}` : ''
}

async function fetchStory(storyId: number): Promise<IntelItem | null> {
  try {
    const itemResp = await fetch(`${HN_BASE}/item/${storyId}.json`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!itemResp.ok) return null
    const item = (await itemResp.json()) as Record<string, unknown>
    if (!item || item.type !== 'story') return null

    const score = Number(item.score ?? 0)
    const descendants = Number(item.descendants ?? 0)
    const url = (item.url as string) || `https://news.ycombinator.com/item?id=${storyId}`
    const time = Number(item.time ?? 0)
    const kids = (item.kids as number[]) ?? []

    const content = kids.length > 0 ? await fetchComments(kids) : ''

    return {
      id: `hn-${storyId}`,
      source: 'hacker_news',
      title: String(item.title ?? ''),
      url,
      heat: `${score} pts, ${descendants} comments`,
      published_at: time > 0 ? new Date(time * 1000).toISOString() : null,
      content: content || null,
    }
  } catch {
    return null
  }
}

export async function fetchHackerNews(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(`${HN_BASE}/topstories.json`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Hacker News`)
    const storyIds = (await resp.json()) as number[]

    const candidateIds = storyIds.slice(0, Math.min(limit * 2, 30))

    const settled = await Promise.allSettled(
      candidateIds.map((id) => fetchStory(id)),
    )

    const items: IntelItem[] = []
    for (const result of settled) {
      if (items.length >= limit) break
      if (result.status === 'fulfilled' && result.value) {
        items.push(result.value)
      }
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
