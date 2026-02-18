// ABOUTME: 36Kr news sensor using HTML scraping with node-html-parser.
// ABOUTME: Fetches latest news flashes from 36Kr, a leading Chinese tech news outlet.
import { parse as parseHTML } from 'node-html-parser'
import type { ConfigSettings, IntelItem } from '../models'

const KR_URL = 'https://36kr.com/newsflashes'
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

export async function fetch36kr(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const resp = await fetch(KR_URL, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    })
    if (!resp.ok) return []
    const html = await resp.text()
    const root = parseHTML(html)

    const items: IntelItem[] = []
    const itemTags = root.querySelectorAll('.newsflash-item')

    for (let idx = 0; idx < itemTags.length && items.length < limit; idx++) {
      const itemTag = itemTags[idx]
      const titleElem = itemTag.querySelector('.item-title')
      if (!titleElem) continue

      const title = titleElem.text.trim()
      const href = titleElem.getAttribute('href') ?? ''
      if (!href) continue

      const url = href.startsWith('http') ? href : `https://36kr.com${href}`
      const timeTag = itemTag.querySelector('.time')
      const timeStr = timeTag?.text.trim() ?? null

      items.push({
        id: `36kr-${idx}-${(hashString(url) & 0xFFFF).toString(16).padStart(4, '0')}`,
        source: 'sources_36kr',
        title,
        url,
        published_at: timeStr,
      })
    }
    return items
  } catch {
    return []
  }
}

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
