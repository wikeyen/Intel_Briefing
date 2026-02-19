// ABOUTME: Jina Reader utility for fetching clean article content as markdown.
// ABOUTME: Calls r.jina.ai — free tier, 20 req/min, no API key needed.

const JINA_BASE = 'https://r.jina.ai/'
const DEFAULT_MAX_CHARS = 3000
const DEFAULT_TIMEOUT = 15000

export async function fetchContent(
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
  timeout = DEFAULT_TIMEOUT,
): Promise<string | null> {
  try {
    const resp = await fetch(`${JINA_BASE}${url}`, {
      signal: AbortSignal.timeout(timeout),
    })
    if (!resp.ok) return null

    const text = (await resp.text()).trim()
    if (!text) return null

    return text.slice(0, maxChars)
  } catch {
    return null
  }
}
