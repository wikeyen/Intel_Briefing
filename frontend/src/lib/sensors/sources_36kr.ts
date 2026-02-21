// ABOUTME: 36Kr news sensor — extracts newsflash data from window.initialState JSON.
// ABOUTME: Fetches latest news flashes from 36Kr, a leading Chinese tech news outlet.
import { parse as parseHTML } from 'node-html-parser'
import type { ConfigSettings, IntelItem } from '../models'
import { hashString } from './utils'

const KR_URL = 'https://36kr.com/newsflashes'
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

export async function fetch36kr(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const resp = await fetch(KR_URL, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from 36Kr`)
  const html = await resp.text()

  // 36Kr is client-rendered; data lives in window.initialState JSON embedded in a <script> tag.
  const items = parseFromInitialState(html, limit)
  if (items.length > 0) return items

  // Fallback: try HTML scraping in case the page structure changes back to SSR
  return parseFromHTML(html, limit)
}

/** Parse newsflash items from window.initialState JSON blob */
function parseFromInitialState(html: string, limit: number): IntelItem[] {
  const match = html.match(new RegExp('window\\.initialState\\s*=\\s*({.+?})\\s*<\\/script>', 's'))
  if (!match) return []

  try {
    const state = JSON.parse(match[1])
    const itemList: unknown[] =
      state?.newsflashCatalogData?.newsflashList?.data?.itemList ?? []

    const items: IntelItem[] = []
    for (const entry of itemList) {
      if (items.length >= limit) break
      const e = entry as Record<string, unknown>
      const mat = e.templateMaterial as Record<string, unknown> | undefined
      if (!mat) continue

      const title = String(mat.widgetTitle ?? '').trim()
      if (!title) continue

      const itemId = String(e.itemId ?? '')
      const url = itemId
        ? `https://36kr.com/newsflashes/${itemId}`
        : `https://36kr.com/newsflashes`

      const publishTime = Number(mat.publishTime)
      const published_at = publishTime
        ? new Date(publishTime).toISOString()
        : null

      items.push({
        id: `36kr-${itemId || items.length}`,
        source: 'sources_36kr',
        title,
        url,
        published_at,
      })
    }
    return items
  } catch {
    return []
  }
}

/** Fallback: parse from static HTML if SSR is restored */
function parseFromHTML(html: string, limit: number): IntelItem[] {
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
}

