// ABOUTME: ArXiv sensor that fetches recent AI/ML research papers via the ArXiv Atom API.
// ABOUTME: Uses a 3-tier query fallback strategy to stay resilient over weekends and low-submission periods.
import { XMLParser } from 'fast-xml-parser'
import type { ConfigSettings, IntelItem } from '../models'

const STRATEGIES: [string, string][] = [
  ['cat:cs.AI', 'submittedDate'],
  ['cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL', 'submittedDate'],
  ['cat:cs.AI+OR+cat:cs.LG', 'lastUpdatedDate'],
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchArxiv(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  let lastError: Error | null = null
  for (let i = 0; i < STRATEGIES.length; i++) {
    const [query, sortBy] = STRATEGIES[i]
    try {
      const papers = await queryArxiv(query, sortBy, limit)
      if (papers.length > 0) return papers
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
    if (i < STRATEGIES.length - 1) {
      await sleep(3000)
    }
  }
  if (lastError) throw lastError
  return []
}

async function queryArxiv(query: string, sortBy: string, limit: number): Promise<IntelItem[]> {
  const url =
    `https://export.arxiv.org/api/query` +
    `?search_query=${query}` +
    `&start=0` +
    `&max_results=${limit}` +
    `&sortBy=${sortBy}` +
    `&sortOrder=descending`

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ArXiv`)
    const xml = await resp.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'entry' || name === 'author' || name === 'category',
    })
    const parsed = parser.parse(xml)
    const feed = parsed.feed ?? parsed
    const entries = feed.entry ?? []

    const items: IntelItem[] = []
    for (const entry of entries) {
      try {
        const rawId = String(entry.id ?? '')
        const arxivId = rawId.split('/').pop() ?? ''
        const rawTitle = String(entry.title ?? '')
        const title = rawTitle.replace(/\s+/g, ' ').trim()
        const rawSummary = String(entry.summary ?? '')
        const abstract = rawSummary.replace(/\s+/g, ' ').trim()
        const published = entry.published ? String(entry.published).slice(0, 10) : null

        const authorList = Array.isArray(entry.author) ? entry.author : entry.author ? [entry.author] : []
        const authors = authorList
          .map((a: Record<string, unknown>) => String(a.name ?? '').trim())
          .filter(Boolean)
          .slice(0, 3)

        const catList = Array.isArray(entry.category) ? entry.category : entry.category ? [entry.category] : []
        const categories = catList
          .map((c: Record<string, unknown>) => String(c['@_term'] ?? ''))
          .filter(Boolean)
          .slice(0, 3)

        items.push({
          id: arxivId,
          source: 'arxiv',
          title,
          url: `https://arxiv.org/abs/${arxivId}`,
          abstract: abstract || null,
          authors: authors.length > 0 ? authors : null,
          categories: categories.length > 0 ? categories : null,
          published_at: published,
        })
      } catch {
        continue
      }
    }
    return items
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
