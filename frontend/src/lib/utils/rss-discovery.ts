// ABOUTME: RSS feed auto-discovery — detects whether a URL is a feed or discovers feeds from HTML pages.
// ABOUTME: Checks content-type, URL patterns, and HTML <link rel="alternate"> tags for feed detection.

const DISCOVERY_TIMEOUT = 10_000

const FEED_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
]

const FEED_URL_PATTERNS = [/\.xml$/i, /\/rss\b/i, /\/feed\b/i, /\/atom\b/i]

export interface DiscoveryResult {
  type: 'feed' | 'discovered' | 'not_found' | 'error'
  feedUrl?: string
  feedTitle?: string
  message?: string
}

function isFeedContentType(contentType: string): boolean {
  return FEED_CONTENT_TYPES.some((ct) => contentType.includes(ct))
}

function looksLikeFeedUrl(url: string): boolean {
  return FEED_URL_PATTERNS.some((pat) => pat.test(url))
}

function looksLikeXml(body: string): boolean {
  const trimmed = body.trimStart()
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')
}

/**
 * Discover whether a URL is an RSS/Atom feed or find one linked from an HTML page.
 */
export async function discoverFeed(url: string): Promise<DiscoveryResult> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
      redirect: 'follow',
      headers: { 'User-Agent': 'IntelBriefing/1.0 (feed discovery)' },
    })
    if (!resp.ok) {
      return { type: 'error', message: `HTTP ${resp.status} ${resp.statusText}` }
    }

    const contentType = resp.headers.get('content-type') ?? ''
    const body = await resp.text()

    // Direct feed detection: XML content-type or feed URL pattern with XML body
    if (isFeedContentType(contentType) || (looksLikeFeedUrl(url) && looksLikeXml(body))) {
      return { type: 'feed', feedUrl: url }
    }

    // HTML page — look for <link rel="alternate"> tags
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      return discoverFromHtml(body, url)
    }

    // Non-HTML, non-feed content — check if it still looks like XML
    if (looksLikeXml(body)) {
      return { type: 'feed', feedUrl: url }
    }

    return { type: 'not_found', message: 'URL is not a feed and not an HTML page' }
  } catch (err) {
    return { type: 'error', message: (err as Error).message }
  }
}

function discoverFromHtml(html: string, pageUrl: string): DiscoveryResult {
  // Parse HTML link tags using regex to avoid heavy DOM dependency
  const linkPattern = /<link\s[^>]*rel\s*=\s*["']alternate["'][^>]*>/gi
  const links = html.match(linkPattern) ?? []

  for (const linkTag of links) {
    const typeMatch = linkTag.match(/type\s*=\s*["']([^"']+)["']/)
    const type = typeMatch?.[1] ?? ''
    if (!type.includes('rss') && !type.includes('atom') && !type.includes('xml')) continue

    const hrefMatch = linkTag.match(/href\s*=\s*["']([^"']+)["']/)
    if (!hrefMatch) continue

    const feedUrl = new URL(hrefMatch[1], pageUrl).href
    const titleMatch = linkTag.match(/title\s*=\s*["']([^"']+)["']/)
    const feedTitle = titleMatch?.[1]

    return { type: 'discovered', feedUrl, feedTitle }
  }

  return { type: 'not_found', message: 'No RSS/Atom feed links found on the page' }
}
