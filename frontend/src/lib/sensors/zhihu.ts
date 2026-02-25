// ABOUTME: Zhihu sensor using the public hot list API.
// ABOUTME: Fetches trending questions from China's largest Q&A platform.
import type { ConfigSettings, IntelItem } from '../models'

const ZHIHU_URL = 'https://api.zhihu.com/topstory/hot-list'

export async function fetchZhihu(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(ZHIHU_URL, {
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Zhihu`)

    const body = await resp.json() as Record<string, unknown>
    const data = (body.data as Array<Record<string, unknown>>) ?? []
    const items: IntelItem[] = []

    for (const entry of data.slice(0, limit)) {
      const target = entry.target as Record<string, unknown> | undefined
      if (!target) continue
      const title = String(target.title ?? '')
      if (!title) continue

      const detailText = String(entry.detail_text ?? '')
      const rawNum = parseInt(detailText.replace(/[^\d]/g, ''), 10)
      const heat = !isNaN(rawNum) ? String(rawNum * 10000) : '0'

      const cardId = String(entry.card_id ?? '')
      const questionId = cardId.replace('Q_', '')

      items.push({
        id: `zhihu-${entry.id ?? questionId}`,
        source: 'zhihu',
        title,
        url: `https://www.zhihu.com/question/${questionId}`,
        heat,
      })
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
