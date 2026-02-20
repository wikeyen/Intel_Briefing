// ABOUTME: Chrome Radar sensor — scrapes Chrome Web Store for popular but poorly-rated extensions.
// ABOUTME: Parses AF_initDataCallback JSON embedded in category page HTML to get extension metadata.
import type { ConfigSettings, IntelItem } from '../models'

const CWS_BASE = 'https://chromewebstore.google.com'
const CATEGORIES = [
  'extensions/productivity/tools',
  'extensions/productivity/developer',
  'extensions/productivity/workflow',
]
const MIN_USERS = 5000
const MAX_RATING = 3.8

interface CWSExtension {
  id: string
  name: string
  rating: number
  users: number
}

/** Parse the AF_initDataCallback JSON from CWS category page HTML. */
export function parseExtensionsFromHtml(html: string): CWSExtension[] {
  const match = html.match(
    /AF_initDataCallback\(\{key:\s*'ds:1'.*?data:(\[[\s\S]*?\])\s*,\s*sideChannel:/,
  )
  if (!match) return []

  let data: unknown[]
  try {
    data = JSON.parse(match[1])
  } catch {
    return []
  }

  // Navigate to the extension list: data[0][0][0][13][0][0]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extList = (data as any)[0][0][0][13][0][0] as unknown[][]
    if (!Array.isArray(extList)) return []

    return extList
      .map((wrapper) => {
        const ext = wrapper[0] as unknown[]
        if (!Array.isArray(ext) || typeof ext[0] !== 'string') return null
        return {
          id: ext[0] as string,
          name: (ext[2] as string) ?? '',
          rating: typeof ext[3] === 'number' ? ext[3] : 0,
          users: typeof ext[14] === 'number' ? ext[14] : 0,
        }
      })
      .filter((e): e is CWSExtension => e !== null)
  } catch {
    return []
  }
}

async function scrapeCategoryPage(category: string): Promise<CWSExtension[]> {
  const resp = await fetch(`${CWS_BASE}/category/${category}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) return []
  const html = await resp.text()
  return parseExtensionsFromHtml(html)
}

export async function fetchChromeRadar(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const categoryResults = await Promise.allSettled(
    CATEGORIES.map((cat) => scrapeCategoryPage(cat)),
  )

  const candidates: CWSExtension[] = []
  for (const result of categoryResults) {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value)
    }
  }

  // Deduplicate by extension ID
  const seen = new Set<string>()
  const unique = candidates.filter((ext) => {
    if (seen.has(ext.id)) return false
    seen.add(ext.id)
    return true
  })

  // Filter: low rating + high user count
  const matches = unique.filter((ext) => ext.rating > 0 && ext.rating < MAX_RATING && ext.users >= MIN_USERS)

  // Sort by user count descending (biggest opportunities first)
  matches.sort((a, b) => b.users - a.users)

  return matches.slice(0, limit).map((ext) => ({
    id: `chrome-${ext.id}`,
    source: 'chrome_radar',
    title: ext.name,
    url: `${CWS_BASE}/detail/${ext.id}`,
    heat: `${ext.users.toLocaleString()} users, ${ext.rating.toFixed(1)} stars`,
  }))
}
