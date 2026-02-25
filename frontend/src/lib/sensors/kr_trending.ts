// ABOUTME: 36Kr Trending sensor — fetches the 24-hour hot ranking via the gateway API.
// ABOUTME: Returns the most-read articles on 36kr.com, distinct from the newsflash sensor.
import type { ConfigSettings, IntelItem } from '../models'

const KR_HOT_URL = 'https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot'
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

export async function fetchKrTrending(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(KR_HOT_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      partner_id: 'wap',
      param: { siteId: 1, platformId: 2 },
      timestamp: Date.now(),
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from 36Kr Trending`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { code?: number }).code !== 0) return []

  const data = body.data as Record<string, unknown> | undefined
  const hotRankList = (data?.hotRankList as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of hotRankList.slice(0, limit)) {
    const material = entry.templateMaterial as Record<string, unknown> | undefined
    const title = String(material?.widgetTitle ?? '').trim()
    if (!title) continue

    const itemId = String(entry.itemId ?? '')
    const statRead = Number(material?.statRead ?? 0)

    items.push({
      id: `36kr-hot-${itemId || items.length}`,
      source: '36kr_trending',
      title,
      url: `https://www.36kr.com/p/${itemId}`,
      heat: statRead > 0 ? String(statRead) : null,
    })
  }
  return items
}
