// ABOUTME: Hacker News top blogs sensor using OPML + RSS/Atom feed parsing.
// ABOUTME: Fetches recent articles from a curated list of high-quality tech blogs.
import { createHash } from 'crypto'
import { XMLParser } from 'fast-xml-parser'
import type { ConfigSettings, IntelItem } from '../models'

const OPML_URL =
  'https://gist.githubusercontent.com/emschwartz/e6d2bf860ccc367fe37ff953ba6de66b/raw/hn-popular-blogs-2025.opml'

const FALLBACK_FEEDS = [
  { title: 'Simon Willison', rss: 'https://simonwillison.net/atom/everything/' },
  { title: 'Mitchell Hashimoto', rss: 'https://mitchellh.com/feed.xml' },
  { title: 'antirez', rss: 'https://antirez.com/rss' },
  { title: 'Paul Graham', rss: 'https://www.aaronsw.com/2002/feeds/pgessays.rss' },
  { title: 'Pluralistic', rss: 'https://pluralistic.net/feed/' },
]

const MAX_BLOGS = 20
const MAX_PER_BLOG = 2

interface BlogEntry { title: string; rss: string }

async function fetchOpml(): Promise<BlogEntry[]> {
  try {
    const resp = await fetch(OPML_URL, { signal: AbortSignal.timeout(15000), redirect: 'follow' })
    if (!resp.ok) return []
    const content = await resp.text()

    const blogs: BlogEntry[] = []
    const pattern = /<outline[^>]+type="rss"[^>]*>/g
    let match
    while ((match = pattern.exec(content)) !== null) {
      const outline = match[0]
      const textMatch = /text="([^"]+)"/.exec(outline)
      const xmlUrlMatch = /xmlUrl="([^"]+)"/.exec(outline)
      if (textMatch && xmlUrlMatch) {
        blogs.push({ title: textMatch[1], rss: xmlUrlMatch[1] })
      }
    }
    return blogs
  } catch {
    return []
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

function md5Short(input: string): string {
  return createHash('md5').update(input).digest('hex').slice(0, 8)
}

async function fetchRss(sourceTitle: string, rssUrl: string): Promise<IntelItem[]> {
  try {
    const resp = await fetch(rssUrl, { signal: AbortSignal.timeout(10000), redirect: 'follow' })
    if (!resp.ok) return []
    const xml = await resp.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['entry', 'item', 'link', 'author'].includes(name),
    })
    const parsed = parser.parse(xml)

    const items: IntelItem[] = []

    // Detect Atom vs RSS
    const feed = parsed.feed ?? parsed
    const isAtom = !!parsed.feed

    if (isAtom) {
      const entries = (feed.entry ?? []).slice(0, MAX_PER_BLOG)
      for (const entry of entries) {
        const titleText = String(entry.title ?? 'Untitled')
        const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
        const altLink = links.find((l: Record<string, string>) => l['@_rel'] === 'alternate') ?? links[0]
        const urlText = altLink?.['@_href'] ?? ''
        if (!urlText) continue
        const pubText = String(entry.published ?? entry.updated ?? '').slice(0, 10) || null
        const rawSummary = String(entry.summary ?? entry.content ?? '')
        const contentText = stripHtml(rawSummary) || null

        items.push({
          id: `hnblog-${sourceTitle}-${md5Short(urlText)}`,
          source: 'hn_blogs',
          title: titleText,
          url: urlText,
          published_at: pubText,
          content: contentText,
        })
      }
    } else {
      const channel = feed.rss?.channel ?? feed.channel ?? feed
      const rssItems = (channel.item ?? []).slice(0, MAX_PER_BLOG)
      for (const item of rssItems) {
        const titleText = String(item.title ?? 'Untitled')
        const urlText = String(item.link ?? '')
        if (!urlText) continue
        const pubText = item.pubDate ? String(item.pubDate).slice(0, 10) : null
        const rawDesc = String(item.description ?? '')
        const contentText = stripHtml(rawDesc) || null

        items.push({
          id: `hnblog-${sourceTitle}-${md5Short(urlText)}`,
          source: 'hn_blogs',
          title: titleText,
          url: urlText,
          published_at: pubText,
          content: contentText,
        })
      }
    }
    return items
  } catch {
    return []
  }
}

export async function fetchHnBlogs(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  try {
    const blogs = (await fetchOpml()).length > 0 ? await fetchOpml() : FALLBACK_FEEDS
    const actualBlogs = blogs.length > 0 ? blogs : FALLBACK_FEEDS

    const articles: IntelItem[] = []
    for (const blog of actualBlogs.slice(0, MAX_BLOGS)) {
      articles.push(...(await fetchRss(blog.title, blog.rss)))
      if (articles.length >= limit * 3) break
    }

    // Sort by published_at descending; items without a date sort last
    articles.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    return articles.slice(0, limit)
  } catch {
    return []
  }
}
