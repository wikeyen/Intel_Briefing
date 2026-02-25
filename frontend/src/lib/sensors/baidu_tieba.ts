// ABOUTME: Baidu Tieba sensor — fetches hot discussion topics from China's largest forum platform.
// ABOUTME: Returns trending discussion threads with engagement counts from tieba.baidu.com.
import type { ConfigSettings, IntelItem } from '../models'

const TIEBA_URL = 'https://tieba.baidu.com/hottopic/browse/topicList'

export async function fetchBaiduTieba(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(TIEBA_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Baidu Tieba`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { errmsg?: string }).errmsg !== 'success') return []

  const data = body.data as Record<string, unknown> | undefined
  const bangTopic = data?.bang_topic as Record<string, unknown> | undefined
  const topicList = (bangTopic?.topic_list as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of topicList.slice(0, limit)) {
    const name = String(entry.topic_name ?? '').trim()
    if (!name) continue

    const topicId = String(entry.topic_id ?? '')
    const discussNum = Number(entry.discuss_num ?? 0)

    items.push({
      id: `tieba-${topicId || items.length}`,
      source: 'baidu_tieba',
      title: name,
      url: String(entry.topic_url ?? `https://tieba.baidu.com/hottopic/browse/topicList`),
      heat: discussNum > 0 ? String(discussNum) : null,
    })
  }
  return items
}
