// ABOUTME: X posts sensor — scrapes recent tweets from xcancel.com profile pages.
// ABOUTME: Parses HTML with node-html-parser, skips retweets, filters by lookback hours.
import { parse as parseHTML } from 'node-html-parser'
import type { ConfigSettings, IntelItem } from '../models'

const XCANCEL_BASE = 'https://xcancel.com'
const FETCH_TIMEOUT = 15_000
const MAX_RETRIES = 2
const BASE_DELAY_MS = 800
const JITTER_MS = 1200

/** Pool of realistic browser User-Agents to rotate through */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
]

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function jitteredDelay(): Promise<void> {
  return delay(BASE_DELAY_MS + Math.random() * JITTER_MS)
}

/** Parse the date from xcancel's tweet-date title attribute, e.g. "Feb 20, 2026 · 10:33 AM UTC" */
function parseXDate(title: string): Date | null {
  const cleaned = title.replace(' · ', ' ')
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d
}

async function fetchWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await delay(BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * JITTER_MS)
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      })
      if (resp.status === 429 || resp.status === 503) {
        lastError = new Error(`xcancel ${resp.status}`)
        continue
      }
      if (!resp.ok) throw new Error(`xcancel ${resp.status}`)
      return await resp.text()
    } catch (e) {
      lastError = e as Error
      if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') continue
      throw e
    }
  }
  throw lastError ?? new Error('fetchWithRetry exhausted')
}

async function fetchAccountPosts(handle: string, lookbackMs: number): Promise<IntelItem[]> {
  const html = await fetchWithRetry(`${XCANCEL_BASE}/${handle}`)
  const root = parseHTML(html)
  const now = Date.now()
  const cutoff = now - lookbackMs
  const items: IntelItem[] = []

  for (const el of root.querySelectorAll('.timeline-item')) {
    if (el.querySelector('.retweet-header')) continue

    const linkEl = el.querySelector('.tweet-link')
    const href = linkEl?.getAttribute('href') ?? ''
    const statusMatch = href.match(/\/status\/(\d+)/)
    if (!statusMatch) continue
    const statusId = statusMatch[1]

    const dateEl = el.querySelector('.tweet-date a')
    const dateTitle = dateEl?.getAttribute('title') ?? ''
    const pubDate = parseXDate(dateTitle)
    if (pubDate && pubDate.getTime() < cutoff) continue

    const contentEl = el.querySelector('.tweet-content')
    const title = contentEl?.textContent?.trim() ?? ''
    if (!title) continue

    const fullnameEl = el.querySelector('.fullname')
    const usernameEl = el.querySelector('.username')
    const account = fullnameEl?.textContent?.trim() ?? handle
    const authorHandle = (usernameEl?.textContent?.trim() ?? `@${handle}`).replace(/^@/, '')

    const stats = el.querySelectorAll('.tweet-stat')
    const statValues = stats.map(s => s.textContent?.trim() ?? '')
    const likes = statValues[2] ?? ''
    const retweets = statValues[1] ?? ''
    const heat = [likes ? `${likes} likes` : '', retweets ? `${retweets} retweets` : '']
      .filter(Boolean).join(' \u00b7 ')

    items.push({
      id: `x-${statusId}`,
      source: 'x_posts',
      title: title.slice(0, 280),
      url: `https://x.com/${authorHandle}/status/${statusId}`,
      heat: heat || null,
      account,
      handle: authorHandle,
      published_at: pubDate?.toISOString() ?? null,
    })
  }

  return items
}

export async function fetchXPosts(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const handles = config.social_accounts_x
  if (!handles || handles.length === 0) return []

  const lookbackHours = config.sensor_lookback_hours?.x_posts ?? 48
  const lookbackMs = lookbackHours * 60 * 60 * 1000

  // Stagger requests to avoid burst traffic patterns
  const results: PromiseSettledResult<IntelItem[]>[] = []
  for (const h of handles) {
    if (results.length > 0) await jitteredDelay()
    results.push(await Promise.allSettled([fetchAccountPosts(h.replace(/^@/, ''), lookbackMs)]).then(r => r[0]))
  }

  const items: IntelItem[] = []
  const seenIds = new Set<string>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const item of r.value) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      items.push(item)
      if (items.length >= limit) break
    }
    if (items.length >= limit) break
  }

  return items
}
