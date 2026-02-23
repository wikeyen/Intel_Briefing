// ABOUTME: Baidu Hot Search sensor — fetches real-time trending search terms from baidu.com.
// ABOUTME: Returns the most popular search queries on China's dominant search engine.
import type { ConfigSettings, IntelItem } from '../models'
import { hashString } from './utils'

const BAIDU_URL = 'https://top.baidu.com/api/board?platform=wise&tab=realtime'

export async function fetchBaidu(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(BAIDU_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Baidu Hot Search`)

  const body = await resp.json() as Record<string, unknown>
  if (!body.success) return []

  const data = body.data as Record<string, unknown> | undefined
  const cards = (data?.cards as Array<Record<string, unknown>>) ?? []
  if (cards.length === 0) return []

  // Baidu nests the actual content list under cards[0].content
  const contentArr = (cards[0].content as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of contentArr.slice(0, limit)) {
    const word = String(entry.word ?? '').trim()
    if (!word) continue

    const hash = (hashString(word) & 0xFFFF).toString(16).padStart(4, '0')

    items.push({
      id: `baidu-${hash}`,
      source: 'baidu',
      title: word,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(word)}`,
    })
  }
  return items
}
