// ABOUTME: X posts sensor — fetches recent tweets via @the-convocation/twitter-scraper.
// ABOUTME: Auth priority: config cookies > OpenClaw browser cookies. No auth = no results.
import { Scraper, type Tweet } from '@the-convocation/twitter-scraper'
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

  // Collect raw tweets including self-replies for thread stitching
  const rawTweets: Tweet[] = []
  const fetchDepth = Math.min(perAccountLimit * 2, 20)
  for await (const tweet of scraper.getTweets(handle, fetchDepth)) {
    if (rawTweets.length >= fetchDepth) break
    if (tweet.isRetweet) continue
    if (tweet.isQuoted) continue

    const pubDate = tweet.timeParsed ?? (tweet.timestamp ? new Date(tweet.timestamp * 1000) : null)
    if (pubDate && pubDate.getTime() < cutoff) break // tweets are chronological, stop early

    const text = tweet.text ?? ''
    if (!text.trim()) continue

    rawTweets.push(tweet)
  }

  // Stitch first self-reply into parent post
  stitchSelfReplies(rawTweets)

  // Convert originals (non-replies) to IntelItem
  const items: IntelItem[] = []
  for (const tweet of rawTweets) {
    if (tweet.isReply) continue
    if (items.length >= perAccountLimit) break

    const pubDate = tweet.timeParsed ?? (tweet.timestamp ? new Date(tweet.timestamp * 1000) : null)
    const text = tweet.text ?? ''
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
      title: text.slice(0, 560),
      url: tweet.permanentUrl ?? `https://x.com/${handle}/status/${tweet.id}`,
      heat: heatParts.join(' \u00b7 ') || null,
      account: tweet.name ?? handle,
      handle: tweet.username ?? handle,
      published_at: pubDate?.toISOString() ?? null,
    })
  }

  return items
}

/** Stitch first self-reply text into parent tweet (mutates array). */
function stitchSelfReplies(tweets: Tweet[]): void {
  const byId = new Map<string, Tweet>()
  for (const t of tweets) {
    if (t.id) byId.set(t.id, t)
  }
  const stitched = new Set<string>()
  for (const tweet of tweets) {
    if (!tweet.isReply || !tweet.inReplyToStatusId) continue
    const parent = byId.get(tweet.inReplyToStatusId)
    if (!parent) continue
    if (parent.username?.toLowerCase() !== tweet.username?.toLowerCase()) continue
    if (stitched.has(parent.id!)) continue // only stitch one reply per parent
    parent.text = (parent.text ?? '') + '\n\n' + (tweet.text ?? '')
    stitched.add(tweet.id!)
  }
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

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchXPosts(
  config: ConfigSettings,
  limit: number,
  onProgress?: (detail: string) => void,
): Promise<IntelItem[]> {
  const disabled = new Set(config.social_accounts_disabled ?? [])
  const handles = (config.social_accounts_x ?? []).filter(h => !disabled.has(h))
  if (handles.length === 0) return []

  const lookbackHours = config.sensor_lookback_hours?.x ?? 48
  const lookbackMs = lookbackHours * 60 * 60 * 1000
  const perAccountLimit = Math.max(10, Math.ceil(limit / handles.length) * 2)

  const auth = await resolveAuth(config)
  if (!auth) {
    throw new Error('X sensor requires authentication — set Twitter cookies in Credentials or install OpenClaw')
  }

  const scraper = await initScraper(auth.auth_token, auth.ct0)
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

  const items: IntelItem[] = []
  const seenIds = new Set<string>()
  for (const r of allResults) {
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
