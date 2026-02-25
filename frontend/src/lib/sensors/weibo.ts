// ABOUTME: Weibo sensor using the public hot search API.
// ABOUTME: Fetches real-time trending topics from China's largest microblogging platform.
import type { ConfigSettings, IntelItem } from '../models'

const WEIBO_URL = 'https://weibo.com/ajax/side/hotSearch'

export async function fetchWeibo(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(WEIBO_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://weibo.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Weibo`)

    const body = await resp.json() as Record<string, unknown>
    if ((body as { ok?: number }).ok !== 1) return []

    const realtime = ((body.data as Record<string, unknown>)?.realtime as Array<Record<string, unknown>>) ?? []
    const items: IntelItem[] = []

    for (const entry of realtime.slice(0, limit)) {
      const word = String(entry.word ?? '')
      if (!word) continue
      const scheme = entry.word_scheme ? String(entry.word_scheme) : `#${word}`

      items.push({
        id: `weibo-${entry.mid ?? word}`,
        source: 'weibo',
        title: word,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(scheme)}&t=31&band_rank=1&Refer=top`,
        heat: String(entry.num ?? '0'),
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
