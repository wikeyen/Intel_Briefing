// ABOUTME: Netease News sensor — fetches the hot news board from 163.com.
// ABOUTME: Returns trending news articles from one of China's largest news portals.
import type { ConfigSettings, IntelItem } from '../models'

const NETEASE_URL = 'https://m.163.com/fe/api/hot/news/flow'

export async function fetchNetease(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(NETEASE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Netease`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { msg?: string }).msg !== 'success') return []

  const data = body.data as Record<string, unknown> | undefined
  const list = (data?.list as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of list.slice(0, limit)) {
    const title = String(entry.title ?? '').trim()
    if (!title) continue

    const skipID = String(entry.skipID ?? '')

    items.push({
      id: `netease-${skipID || items.length}`,
      source: 'netease',
      title,
      url: skipID
        ? `https://www.163.com/dy/article/${skipID}.html`
        : String(entry.url ?? 'https://www.163.com'),
    })
  }
  return items
}
