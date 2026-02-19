// ABOUTME: WallStreetCN sensor using the public information-flow API.
// ABOUTME: Fetches global finance and macro news from China's leading financial news platform.
import type { ConfigSettings, IntelItem } from '../models'

const WSCN_URL =
  'https://api-one.wallstcn.com/apiv1/content/information-flow?channel=global-channel&accept=article&limit=30'

export async function fetchWallStreetCN(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(WSCN_URL, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from WallStreetCN`)
    const data = await resp.json() as Record<string, unknown>

    const items: IntelItem[] = []
    const rawItems = ((data.data as Record<string, unknown>)?.items as Array<Record<string, unknown>>) ?? []

    for (const raw of rawItems) {
      if (items.length >= limit) break
      const res = raw.resource as Record<string, unknown> | undefined
      if (!res) continue

      const title = String(res.title ?? res.content_short ?? '')
      if (!title) continue

      const url = String(res.uri ?? '')
      const ts = Number(res.display_time ?? 0)
      const timeStr = ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ') : null
      const itemId = String(res.id ?? (Math.abs(hashString(title)) & 0xFFFF))

      items.push({
        id: `wscn-${itemId}`,
        source: 'wallstreetcn',
        title,
        url,
        published_at: timeStr,
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return hash
}
