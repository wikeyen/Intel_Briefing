// ABOUTME: X posts sensor — fetches recent tweets via @the-convocation/twitter-scraper.
// ABOUTME: Auth priority: config cookies > OpenClaw browser cookies > xcancel.com fallback.
import { Scraper, type Tweet } from '@the-convocation/twitter-scraper'
import { parse as parseHTML } from 'node-html-parser'
import type { ConfigSettings, IntelItem } from '../models'
import { delay } from './utils'

// ── Scraper singleton (reuse across calls to keep auth session) ──────────────
let _scraper: Scraper | null = null
let _scraperCookiesKey: string | null = null

async function initScraper(authToken: string, ct0: string): Promise<Scraper> {
  const key = `${authToken}:${ct0}`
  if (_scraper && _scraperCookiesKey === key) {
    if (await _scraper.isLoggedIn()) return _scraper
  }
  _scraper = new Scraper()
  _scraperCookiesKey = key
  await _scraper.setCookies([
    `auth_token=${authToken}; Domain=.x.com; Path=/; Secure; HttpOnly`,
    `ct0=${ct0}; Domain=.x.com; Path=/; Secure`,
  ])
  return _scraper
}

// ── OpenClaw browser cookie extraction ───────────────────────────────────────

interface XCookies { auth_token: string; ct0: string }

let _openclawCookiesCache: XCookies | null = null
let _openclawCookiesCacheTime = 0
const OPENCLAW_CACHE_TTL_MS = 10 * 60 * 1000 // refresh every 10 min

async function getOpenClawCookies(): Promise<XCookies | null> {
  // Return cached if fresh
  if (_openclawCookiesCache && Date.now() - _openclawCookiesCacheTime < OPENCLAW_CACHE_TTL_MS) {
    return _openclawCookiesCache
  }

  try {
    // Dynamic import to avoid top-level child_process dependency (easier to test)
    const { execFile } = await import('child_process')
    const json = await new Promise<string>((resolve, reject) => {
      execFile('openclaw', ['browser', '--browser-profile', 'openclaw', 'cookies', '--json'], {
        timeout: 10_000,
        env: { ...process.env, NO_COLOR: '1' },
      }, (err, stdout, stderr) => {
        if (err) return reject(err)
        resolve(stdout)
      })
    })

    // OpenClaw prefixes stderr warnings; parse only the JSON part
    const jsonStart = json.indexOf('{')
    if (jsonStart < 0) return null
    const data = JSON.parse(json.slice(jsonStart))
    const cookies: Array<{ name: string; value: string }> = data.cookies ?? []
    const authToken = cookies.find(c => c.name === 'auth_token')?.value
    const ct0 = cookies.find(c => c.name === 'ct0')?.value

    if (authToken && ct0) {
      _openclawCookiesCache = { auth_token: authToken, ct0 }
      _openclawCookiesCacheTime = Date.now()
      return _openclawCookiesCache
    }
    return null
  } catch {
    return null
  }
}

// ── Resolve auth: config cookies > OpenClaw browser > null ───────────────────

async function resolveAuth(config: ConfigSettings): Promise<XCookies | null> {
  // Priority 1: explicit config
  if (config.twitter_auth_token && config.twitter_ct0) {
    return { auth_token: config.twitter_auth_token, ct0: config.twitter_ct0 }
  }
  // Priority 2: OpenClaw browser
  return getOpenClawCookies()
}

// ── Primary: twitter-scraper (authenticated) ─────────────────────────────────

async function fetchViaScraper(
  scraper: Scraper,
  handle: string,
  lookbackMs: number,
  perAccountLimit: number,
): Promise<IntelItem[]> {
  const cutoff = Date.now() - lookbackMs
  const items: IntelItem[] = []

  const fetchDepth = Math.min(perAccountLimit * 2, 20)
  for await (const tweet of scraper.getTweets(handle, fetchDepth)) {
    if (items.length >= perAccountLimit) break
    if (tweet.isRetweet) continue
    if (tweet.isReply) continue

    const pubDate = tweet.timeParsed ?? (tweet.timestamp ? new Date(tweet.timestamp * 1000) : null)
    if (pubDate && pubDate.getTime() < cutoff) break // tweets are chronological, stop early

    const text = tweet.text ?? ''
    if (!text.trim()) continue

    const likes = tweet.likes ?? 0
    const retweets = tweet.retweets ?? 0
    const views = tweet.views ?? 0
    const heatParts: string[] = []
    if (likes > 0) heatParts.push(`${formatCount(likes)} likes`)
    if (retweets > 0) heatParts.push(`${formatCount(retweets)} retweets`)
    if (views > 0) heatParts.push(`${formatCount(views)} views`)

    items.push({
      id: `x-${tweet.id}`,
      source: 'x',
      title: text.slice(0, 280),
      url: tweet.permanentUrl ?? `https://x.com/${handle}/status/${tweet.id}`,
      heat: heatParts.join(' \u00b7 ') || null,
      account: tweet.name ?? handle,
      handle: tweet.username ?? handle,
      published_at: pubDate?.toISOString() ?? null,
    })
  }

  return items
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── Rate-limited sequential fetching ─────────────────────────────────────────

// Spread requests to avoid burst API traffic. Total spread scales with account
// count but is capped so the pipeline isn't blocked for too long.
// 3 accounts → ~60s each (~3 min total), 10 → ~60s each (~10 min), 30 → ~20s each (~10 min).
const MAX_SPREAD_MS = 10 * 60 * 1000 // 10 min max total
const PER_ACCOUNT_CAP_MS = 60_000     // never wait more than 60s per gap
const MIN_DELAY_MS = 2_000

function accountDelay(accountCount: number): number {
  if (accountCount <= 1) return 0
  const base = Math.min(MAX_SPREAD_MS / (accountCount - 1), PER_ACCOUNT_CAP_MS)
  const jitter = base * 0.3 * (Math.random() * 2 - 1) // ±30%
  return Math.max(MIN_DELAY_MS, Math.round(base + jitter))
}

async function fetchViaScraperAll(
  scraper: Scraper,
  handles: string[],
  lookbackMs: number,
  perAccountLimit: number,
  limit: number,
  onProgress?: (detail: string) => void,
): Promise<IntelItem[]> {
  const allResults: PromiseSettledResult<IntelItem[]>[] = []
  let okCount = 0
  let failCount = 0
  for (let i = 0; i < handles.length; i++) {
    if (i > 0) await delay(accountDelay(handles.length))
    onProgress?.(`Fetching ${handles[i]} (${i + 1}/${handles.length})${okCount + failCount > 0 ? ` — ${okCount} ok, ${failCount} failed` : ''}`)
    const result = await Promise.allSettled([
      fetchViaScraper(scraper, handles[i].replace(/^@/, ''), lookbackMs, perAccountLimit),
    ])
    allResults.push(result[0])
    if (result[0].status === 'fulfilled') okCount++
    else failCount++
  }

  onProgress?.(`Done: ${okCount} ok, ${failCount} failed (${handles.length} accounts)`)
  return collectItems(allResults, limit)
}

// ── Fallback: xcancel.com HTML scraping ──────────────────────────────────────

const XCANCEL_BASE = 'https://xcancel.com'
const FETCH_TIMEOUT = 15_000
const MAX_RETRIES = 2
const BASE_DELAY_MS = 800
const JITTER_MS = 1200

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

function jitteredDelay(): Promise<void> {
  return delay(BASE_DELAY_MS + Math.random() * JITTER_MS)
}

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

async function fetchAccountPostsXcancel(handle: string, lookbackMs: number): Promise<IntelItem[]> {
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
      source: 'x',
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

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchXPosts(
  config: ConfigSettings,
  limit: number,
  onProgress?: (detail: string) => void,
): Promise<IntelItem[]> {
  const handles = config.social_accounts_x
  if (!handles || handles.length === 0) return []

  const lookbackHours = config.sensor_lookback_hours?.x ?? 48
  const lookbackMs = lookbackHours * 60 * 60 * 1000
  const perAccountLimit = Math.max(10, Math.ceil(limit / handles.length) * 2)

  // Try authenticated scraper (config cookies or OpenClaw browser)
  const auth = await resolveAuth(config)
  if (auth) {
    try {
      const scraper = await initScraper(auth.auth_token, auth.ct0)
      return await fetchViaScraperAll(scraper, handles, lookbackMs, perAccountLimit, limit, onProgress)
    } catch (e) {
      console.warn('twitter-scraper failed, falling back to xcancel:', (e as Error).message)
    }
  }

  // Fallback: xcancel.com HTML scraping
  return fetchViaXcancelAll(handles, lookbackMs, limit, onProgress)
}

async function fetchViaXcancelAll(
  handles: string[],
  lookbackMs: number,
  limit: number,
  onProgress?: (detail: string) => void,
): Promise<IntelItem[]> {
  // Stagger requests to avoid burst traffic patterns
  const results: PromiseSettledResult<IntelItem[]>[] = []
  let okCount = 0
  let failCount = 0
  for (let i = 0; i < handles.length; i++) {
    if (i > 0) await jitteredDelay()
    onProgress?.(`Fetching ${handles[i]} (${i + 1}/${handles.length})${okCount + failCount > 0 ? ` — ${okCount} ok, ${failCount} failed` : ''}`)
    const result = await Promise.allSettled([fetchAccountPostsXcancel(handles[i].replace(/^@/, ''), lookbackMs)])
      .then(r => r[0])
    results.push(result)
    if (result.status === 'fulfilled') okCount++
    else failCount++
  }

  onProgress?.(`Done: ${okCount} ok, ${failCount} failed (${handles.length} accounts)`)
  return collectItems(results, limit)
}

function collectItems(results: PromiseSettledResult<IntelItem[]>[], limit: number): IntelItem[] {
  const items: IntelItem[] = []
  const seenIds = new Set<string>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const item of r.value) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      items.push(item)
      if (items.length >= limit) return items
    }
  }
  return items
}
