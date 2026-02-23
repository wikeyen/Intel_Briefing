// ABOUTME: Douyin sensor — fetches hot search topics from China's TikTok equivalent.
// ABOUTME: Returns trending search terms with popularity scores from the Douyin hot list.
import type { ConfigSettings, IntelItem } from '../models'

const DOUYIN_URL = 'https://aweme.snssdk.com/aweme/v1/hot/search/list/'

export async function fetchDouyin(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(DOUYIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from Douyin`)

  const body = await resp.json() as Record<string, unknown>
  if ((body as { status_code?: number }).status_code !== 0) return []

  const data = body.data as Record<string, unknown> | undefined
  const wordList = (data?.word_list as Array<Record<string, unknown>>) ?? []

  const items: IntelItem[] = []
  for (const entry of wordList.slice(0, limit)) {
    const word = String(entry.word ?? '').trim()
    if (!word) continue

    const groupId = String(entry.group_id ?? '')
    const sentenceId = String(entry.sentence_id ?? '')
    const hotValue = Number(entry.hot_value ?? 0)

    items.push({
      id: `douyin-${groupId || items.length}`,
      source: 'douyin',
      title: word,
      url: `https://www.douyin.com/hot/${encodeURIComponent(sentenceId || word)}`,
      heat: hotValue > 0 ? String(hotValue) : null,
    })
  }
  return items
}
