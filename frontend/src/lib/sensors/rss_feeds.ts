// ABOUTME: RSS feeds sensor — fetches user-specified RSS/Atom feeds and extracts article content.
// ABOUTME: Parses XML with fast-xml-parser, scrapes full content via readability, with fallback to RSS summary.
import { XMLParser } from 'fast-xml-parser'
import type { ConfigSettings, IntelItem, RssFeedType } from '../models'
import { normalizeRssFeeds } from '../models'
import { SensorConfigError } from './errors'
import { stripHtml, md5Short } from './utils'

const FEED_FETCH_TIMEOUT = 10_000
const SCRAPE_CONCURRENCY = 5

interface RawItem {
  title: string
  url: string
  published: string | null
  summary: string | null
  fullContent: string | null
  feedTitle: string
  feedType: RssFeedType
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/** Extract text content from an XML node that may be a string or an object with #text. */
function textOf(node: unknown): string | null {
  if (node == null) return null
  if (typeof node === 'string') return node
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'])
  }
  return String(node)
}

function parseFeed(xml: string, feedType: RssFeedType): { feedTitle: string; items: RawItem[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['entry', 'item', 'link', 'author'].includes(name),
  })
  const parsed = parser.parse(xml)

  const isAtom = !!parsed.feed
  const feed = parsed.feed ?? parsed
  const items: RawItem[] = []

  if (isAtom) {
    const feedTitle = String(feed.title ?? 'Unknown Feed')
    const entries = feed.entry ?? []
    for (const entry of entries) {
      const title = String(entry.title ?? 'Untitled')
      const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
      const altLink = links.find((l: Record<string, string>) => l['@_rel'] === 'alternate') ?? links[0]
      const url = altLink?.['@_href'] ?? ''
      if (!url) continue
      const published = String(entry.published ?? entry.updated ?? '') || null
      const summary = entry.summary ? stripHtml(String(entry.summary)) : null
      // Atom <content> holds the full article HTML
      const rawContent = textOf(entry.content)
      const fullContent = rawContent ? stripHtml(rawContent) : null
      items.push({ title, url, published, summary, fullContent, feedTitle, feedType })
    }
  } else {
    const channel = feed.rss?.channel ?? feed.channel ?? feed
    const feedTitle = String(channel.title ?? 'Unknown Feed')
    const rssItems = channel.item ?? []
    for (const item of rssItems) {
      const title = String(item.title ?? 'Untitled')
      const url = String(item.link ?? '')
      if (!url) continue
      const published = item.pubDate ? String(item.pubDate) : null
      const summary = item.description ? stripHtml(String(item.description)) : null
      // RSS 2.0 <content:encoded> holds full article HTML (NS prefix stripped by removeNSPrefix)
      const rawEncoded = textOf(item.encoded)
      const fullContent = rawEncoded ? stripHtml(rawEncoded) : null
      items.push({ title, url, published, summary, fullContent, feedTitle, feedType })
    }
  }
  return { feedTitle: items[0]?.feedTitle ?? 'Unknown Feed', items }
}

async function fetchFeed(feedUrl: string, feedType: RssFeedType): Promise<RawItem[]> {
  try {
    const resp = await fetch(feedUrl, {
      signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT),
      redirect: 'follow',
    })
    if (!resp.ok) return []
    const xml = await resp.text()
    const { items } = parseFeed(xml, feedType)
    return items
  } catch {
    return []
  }
}

async function scrapeArticles(items: RawItem[]): Promise<RawItem[]> {
  // Dynamic import to avoid pulling jsdom (Node.js-only) into the client bundle.
  // The static import chain Data.tsx → sensors/index.ts → rss_feeds.ts must not
  // reach readability.ts, which transitively depends on jsdom → child_process.
  const { extractArticle } = await import('../utils/readability')

  const results: RawItem[] = []
  for (let i = 0; i < items.length; i += SCRAPE_CONCURRENCY) {
    const batch = items.slice(i, i + SCRAPE_CONCURRENCY)
    const scraped = await Promise.allSettled(
      batch.map(async (item) => {
        // Skip scraping if the feed already provided full content
        if (item.fullContent) return item
        const content = await extractArticle(item.url)
        return { ...item, summary: content ?? item.summary }
      }),
    )
    for (const result of scraped) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }
  return results
}

/** Source name per feed type — routes items to different taxonomy categories. */
const SOURCE_BY_TYPE: Record<RssFeedType, string> = {
  news: 'rss_news',
  blog: 'rss_feeds',
  other: 'rss_feeds',
}

export async function fetchRssFeeds(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.rss_feed_urls || config.rss_feed_urls.length === 0) {
    throw new SensorConfigError('No RSS feed URLs configured')
  }

  const feeds = normalizeRssFeeds(config.rss_feed_urls)

  const feedResults = await Promise.allSettled(
    feeds.map((entry) => fetchFeed(entry.url, entry.type)),
  )

  let allItems: RawItem[] = []
  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value)
    }
  }

  const lookbackHours = config.sensor_lookback_hours?.rss_feeds
  if (lookbackHours) {
    const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
    allItems = allItems.filter((item) => {
      const pub = parseDate(item.published)
      return pub !== null && pub >= cutoff
    })
  }

  allItems.sort((a, b) => {
    const da = parseDate(a.published)
    const db = parseDate(b.published)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.getTime() - da.getTime()
  })

  allItems = allItems.slice(0, limit)

  const enriched = await scrapeArticles(allItems)

  return enriched.map((item) => ({
    id: `rss-${md5Short(item.url)}`,
    source: SOURCE_BY_TYPE[item.feedType],
    title: item.title,
    url: item.url,
    published_at: parseDate(item.published)?.toISOString().slice(0, 10) ?? null,
    content: item.fullContent ?? item.summary,
    account: item.feedTitle,
  }))
}
