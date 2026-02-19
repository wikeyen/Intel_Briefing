// ABOUTME: Article content extraction using Mozilla Readability algorithm.
// ABOUTME: Fetches a webpage, parses HTML with jsdom, and extracts the main article text.

const FETCH_TIMEOUT = 15_000

/**
 * Fetch a URL and extract the main article content using Readability.
 * Returns the text content or null if extraction fails.
 * Uses dynamic imports for jsdom and @mozilla/readability to avoid bundling
 * Node.js-only modules in the Next.js client bundle.
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

    // Dynamic imports — jsdom uses child_process and other Node.js APIs
    // that cannot be bundled for the browser
    const { JSDOM } = await import('jsdom')
    const { Readability } = await import('@mozilla/readability')

    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article?.content) return null

    const TurndownService = (await import('turndown')).default
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    return turndown.turndown(article.content).trim()
  } catch {
    return null
  }
}
