// ABOUTME: Juejin sensor — fetches the hot article ranking from China's developer community.
// ABOUTME: Returns trending tech articles with popularity scores from juejin.cn.
import type { ConfigSettings, IntelItem } from '../models'

const JUEJIN_URL = 'https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot'

export async function fetchJuejin(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(JUEJIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Juejin`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { err_msg?: string }).err_msg !== 'success') return []

  const dataArr = (body.data as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of dataArr.slice(0, limit)) {
    const content = entry.content as Record<string, unknown> | undefined
    const counter = entry.content_counter as Record<string, unknown> | undefined
    const title = String(content?.title ?? '').trim()
    if (!title) continue

    const contentId = String(content?.content_id ?? '')
    const hotRank = Number(counter?.hot_rank ?? 0)

    items.push({
      id: `juejin-${contentId || items.length}`,
      source: 'juejin',
      title,
      url: `https://juejin.cn/post/${contentId}`,
      heat: hotRank > 0 ? String(hotRank) : null,
    })
  }
  return items
}
