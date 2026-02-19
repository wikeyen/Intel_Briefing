// ABOUTME: Chrome Radar sensor — scrapes Chrome Web Store for popular but poorly-rated extensions.
// ABOUTME: Identifies "ugly cash cows": high user count (>5000) with low rating (<3.8).
import type { ConfigSettings, IntelItem } from '../models'

const CWS_BASE = 'https://chromewebstore.google.com'
const CATEGORIES = ['extensions/workflow', 'extensions/developer_tools']
const MIN_USERS = 5000
const MAX_RATING = 3.8

interface RawExtension {
  name: string
  detailUrl: string
  rating: number
}

function parseUserCount(text: string): number {
  const match = text.match(/([\d,]+)\+?\s*users?/i)
  if (!match) return 0
  return parseInt(match[1].replace(/,/g, ''), 10)
}

async function scrapeCategoryPage(category: string): Promise<RawExtension[]> {
  try {
    const resp = await fetch(`${CWS_BASE}/category/${category}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return []
    const html = await resp.text()

    const extensions: RawExtension[] = []
    const tilePattern = /<div[^>]*class="[^"]*webstore-test-wall-tile[^"]*"[^>]*>([\s\S]*?)<\/div>/g
    let tileMatch
    while ((tileMatch = tilePattern.exec(html)) !== null) {
      const tile = tileMatch[1]
      const linkMatch = /href="([^"]*\/detail\/[^"]*)"/.exec(tile)
      const nameMatch = /<span[^>]*>([^<]+)<\/span>/.exec(tile)
      const ratingMatch = /class="Y30PE"[^>]*>([^<]+)/.exec(tile)

      if (linkMatch && nameMatch && ratingMatch) {
        const rating = parseFloat(ratingMatch[1])
        if (!isNaN(rating) && rating < MAX_RATING) {
          extensions.push({
            name: nameMatch[1].trim(),
            detailUrl: linkMatch[1].startsWith('http') ? linkMatch[1] : `${CWS_BASE}${linkMatch[1]}`,
            rating,
          })
        }
      }
    }
    return extensions
  } catch {
    return []
  }
}

async function getUserCount(detailUrl: string): Promise<number> {
  try {
    const resp = await fetch(detailUrl, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return 0
    const html = await resp.text()
    const match = /class="F9iKBc"[^>]*>([^<]+)/.exec(html)
    return match ? parseUserCount(match[1]) : 0
  } catch {
    return 0
  }
}

export async function fetchChromeRadar(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const categoryResults = await Promise.allSettled(
      CATEGORIES.map((cat) => scrapeCategoryPage(cat)),
    )

    const candidates: RawExtension[] = []
    for (const result of categoryResults) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value)
      }
    }

    const seen = new Set<string>()
    const unique = candidates.filter((ext) => {
      if (seen.has(ext.detailUrl)) return false
      seen.add(ext.detailUrl)
      return true
    })

    const withCounts = await Promise.allSettled(
      unique.slice(0, limit * 3).map(async (ext) => {
        const users = await getUserCount(ext.detailUrl)
        return { ...ext, users }
      }),
    )

    const items: IntelItem[] = []
    for (const result of withCounts) {
      if (items.length >= limit) break
      if (result.status !== 'fulfilled') continue
      const ext = result.value
      if (ext.users < MIN_USERS) continue

      const id = ext.detailUrl.split('/').pop() ?? ext.name
      items.push({
        id: `chrome-${id}`,
        source: 'chrome_radar',
        title: ext.name,
        url: ext.detailUrl,
        heat: `${ext.users.toLocaleString()} users, ${ext.rating.toFixed(1)} stars`,
      })
    }

    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
