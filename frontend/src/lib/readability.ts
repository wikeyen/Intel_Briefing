// ABOUTME: Article content extraction using Mozilla Readability algorithm.
// ABOUTME: Fetches a webpage, parses HTML with jsdom, and extracts the main article text.
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const FETCH_TIMEOUT = 15_000

/**
 * Fetch a URL and extract the main article content using Readability.
 * Returns the text content or null if extraction fails.
 */
export async function extractArticle(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: 'follow',
      headers: { 'User-Agent': 'IntelBriefing/1.0 (RSS reader)' },
    })
    if (!resp.ok) return null

    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const html = await resp.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article?.textContent) return null

    return article.textContent.trim()
  } catch {
    return null
  }
}
