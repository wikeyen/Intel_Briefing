// ABOUTME: Toutiao sensor — fetches the hot board from China's leading news aggregator.
// ABOUTME: Returns trending news stories with popularity scores from toutiao.com.
import type { ConfigSettings, IntelItem } from '../models'

const TOUTIAO_URL = 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc'

export async function fetchToutiao(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(TOUTIAO_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Toutiao`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { status?: string }).status !== 'success') throw new Error('Toutiao API error: status is not success')

  const dataArr = (body.data as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of dataArr.slice(0, limit)) {
    const title = String(entry.Title ?? '').trim()
    if (!title) continue

    const clusterId = String(entry.ClusterId ?? '')
    const clusterIdStr = String(entry.ClusterIdStr ?? clusterId)
    const hotValue = Number(entry.HotValue ?? 0)

    items.push({
      id: `toutiao-${clusterId || items.length}`,
      source: 'toutiao',
      title,
      url: `https://www.toutiao.com/trending/${clusterIdStr}/`,
      heat: hotValue > 0 ? String(hotValue) : null,
    })
  }
  return items
}
