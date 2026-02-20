// ABOUTME: Link verifier utility for validating URLs from scraped items.
// ABOUTME: Uses HEAD with GET fallback; returns true (valid), false (bad URL).

const DEFAULT_TIMEOUT = 5000

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function verifyLink(url: string, timeout = DEFAULT_TIMEOUT): Promise<boolean> {
  if (!isValidUrl(url)) return false

  try {
    const headResp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    if (headResp.ok) return true

    // HEAD rejected (405, 403, etc.) -- fall back to GET
    const getResp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    return getResp.ok
  } catch {
    return false
  }
}
