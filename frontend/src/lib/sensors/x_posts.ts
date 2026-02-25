// ABOUTME: X posts sensor — fetches recent tweets via twitter-scraper, Apify, or mixed mode.
// ABOUTME: Provider selection via config; auth/credit-error fallback to alternate provider.
import { Scraper, type Tweet } from '@the-convocation/twitter-scraper'
import { ApifyClient } from 'apify-client'
import type { ConfigSettings, IntelItem } from '../models'
import { delay, isWithinResumeWindow } from './utils'
import { readReport } from '../pipeline/cache'

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

let _lastPersistTime = 0
const PERSIST_INTERVAL_MS = 24 * 60 * 60 * 1000 // refresh stored cookies daily

async function resolveAuth(config: ConfigSettings): Promise<XCookies | null> {
  const needsRefresh = Date.now() - _lastPersistTime > PERSIST_INTERVAL_MS

  // When due for daily refresh or no stored cookies, try OpenClaw first
  if (needsRefresh || !(config.twitter_auth_token && config.twitter_ct0)) {
    const fresh = await getOpenClawCookies()
    if (fresh) {
      // Persist to DB + YAML so values appear in the Credentials UI
      try {
        const { saveConfig } = await import('../config')
        await saveConfig({ twitter_auth_token: fresh.auth_token, twitter_ct0: fresh.ct0 })
      } catch { /* non-fatal — cookies still usable in-memory */ }
      _lastPersistTime = Date.now()
      return fresh
    }
  }

  // Stored config cookies (manually entered or previously persisted)
  if (config.twitter_auth_token && config.twitter_ct0) {
    return { auth_token: config.twitter_auth_token, ct0: config.twitter_ct0 }
  }

  return null
}

// ── Auth error detection ─────────────────────────────────────────────────────

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('auth') || msg.includes('credential') || msg.includes('login')
    || msg.includes('unauthorized') || msg.includes('403') || msg.includes('401')
    || msg.includes('requires authentication')
}

// ── Credit/billing error detection ────────────────────────────────────────────

export function isCreditError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('credit') || msg.includes('billing') || msg.includes('limit exceeded')
    || msg.includes('payment') || msg.includes('subscription') || msg.includes('quota')
    || msg.includes('402')
}

// ── Strategy: twitter-scraper (authenticated) ────────────────────────────────

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
      heat: heatParts.join(' · ') || null,
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

// ── Strategy: Apify twitter-scraper actor ────────────────────────────────────

/** Raw tweet shape from the quacker/twitter-scraper actor dataset. */
interface ApifyTweet {
  id?: number
  id_str?: string
  tweetId?: string
  permalink?: string
  url?: string
  text?: string
  full_text?: string
  user?: { name?: string; screen_name?: string; username?: string }
  favorite_count?: number
  favorites?: number
  retweet_count?: number
  retweets?: number
  retweetCount?: number
  quote_count?: number
  reply_count?: number
  views?: number
  viewCount?: number
  created_at?: string
  createdAt?: string
  retweeted?: boolean
  isRetweet?: boolean
}

const APIFY_ACTOR_ID = 'quacker/twitter-scraper'
const APIFY_RUN_TIMEOUT_SECS = 120

/** Map a single Apify tweet record to an IntelItem. */
export function mapApifyTweet(raw: ApifyTweet, fallbackHandle: string): IntelItem | null {
  const text = raw.full_text ?? raw.text ?? ''
  if (!text.trim()) return null

  const tweetId = raw.id_str ?? raw.tweetId ?? String(raw.id ?? '')
  const handle = raw.user?.screen_name ?? raw.user?.username ?? fallbackHandle
  const account = raw.user?.name ?? handle
  const permalink = raw.permalink ?? raw.url
  const url = permalink
    ? (permalink.startsWith('http') ? permalink : `https://x.com${permalink}`)
    : `https://x.com/${handle}/status/${tweetId}`

  const likes = raw.favorite_count ?? raw.favorites ?? 0
  const rts = raw.retweet_count ?? raw.retweets ?? raw.retweetCount ?? 0
  const views = raw.views ?? raw.viewCount ?? 0
  const heatParts: string[] = []
  if (likes > 0) heatParts.push(`${formatCount(likes)} likes`)
  if (rts > 0) heatParts.push(`${formatCount(rts)} retweets`)
  if (views > 0) heatParts.push(`${formatCount(views)} views`)

  const dateStr = raw.created_at ?? raw.createdAt ?? null
  const pubDate = dateStr ? new Date(dateStr) : null
  const published_at = pubDate && !isNaN(pubDate.getTime()) ? pubDate.toISOString() : null

  return {
    id: `x-${tweetId}`,
    source: 'x',
    title: text.slice(0, 560),
    url,
    heat: heatParts.join(' · ') || null,
    account,
    handle,
    published_at,
  }
}

async function fetchViaApify(
  apifyToken: string,
  handles: string[],
  lookbackMs: number,
  perAccountLimit: number,
  onProgress?: (detail: string) => void,
): Promise<IntelItem[]> {
  const client = new ApifyClient({ token: apifyToken })
  const cutoff = Date.now() - lookbackMs
  const allItems: IntelItem[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i].replace(/^@/, '')
    onProgress?.(`[Apify] Fetching @${handle} (${i + 1}/${handles.length})`)

    const { defaultDatasetId } = await client.actor(APIFY_ACTOR_ID).call(
      {
        handles: [handle],
        tweetsDesired: perAccountLimit * 2,
      },
      { waitSecs: APIFY_RUN_TIMEOUT_SECS },
    )

    if (!defaultDatasetId) continue
    const { items: rawItems } = await client.dataset(defaultDatasetId).listItems()

    for (const raw of rawItems as ApifyTweet[]) {
      if (raw.retweeted || raw.isRetweet) continue

      const item = mapApifyTweet(raw, handle)
      if (!item) continue

      // Lookback filter
      if (item.published_at) {
        const pubTime = new Date(item.published_at).getTime()
        if (pubTime < cutoff) continue
      }

      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        allItems.push(item)
      }
    }
  }

  return allItems
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

// ── twitter-scraper strategy: rate-limited sequential per-account fetch ──────

async function fetchAllViaScraper(
  config: ConfigSettings,
  handles: string[],
  lookbackMs: number,
  perAccountLimit: number,
  limit: number,
  onProgress?: (detail: string, itemCount?: number) => void,
): Promise<IntelItem[]> {
  const auth = await resolveAuth(config)
  if (!auth) {
    throw new Error('X sensor requires authentication — set Twitter cookies in Credentials or install OpenClaw')
  }

  const scraper = await initScraper(auth.auth_token, auth.ct0)
  const allResults: PromiseSettledResult<IntelItem[]>[] = []
  let okCount = 0
  let failCount = 0
  let totalItems = 0

  for (let i = 0; i < handles.length; i++) {
    if (i > 0) await delay(accountDelay(handles.length))
    onProgress?.(`Fetching ${handles[i]} (${i + 1}/${handles.length})${okCount + failCount > 0 ? ` — ${okCount} ok, ${failCount} failed` : ''}`, totalItems)
    const result = await Promise.allSettled([
      fetchViaScraper(scraper, handles[i].replace(/^@/, ''), lookbackMs, perAccountLimit),
    ])
    allResults.push(result[0])
    if (result[0].status === 'fulfilled') {
      okCount++
      totalItems += result[0].value.length
    } else {
      failCount++
      // Auth errors are systemic — re-throw immediately so fallback can kick in
      if (isAuthError(result[0].reason)) throw result[0].reason
    }
  }

  onProgress?.(`Done: ${okCount} ok, ${failCount} failed (${handles.length} accounts)`, totalItems)

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

// ── Provider availability checks ─────────────────────────────────────────────

function hasScraperCredentials(config: ConfigSettings): boolean {
  return !!(config.twitter_auth_token && config.twitter_ct0)
}

function hasApifyCredentials(config: ConfigSettings): boolean {
  return !!config.apify_token
}

// ── Mixed mode: split handles between scraper and Apify ──────────────────────

async function fetchMixed(
  config: ConfigSettings,
  handles: string[],
  lookbackMs: number,
  perAccountLimit: number,
  limit: number,
  onProgress?: (detail: string, itemCount?: number) => void,
): Promise<IntelItem[]> {
  // Round-robin split: even-index → scraper, odd-index → Apify
  const scraperHandles: string[] = []
  const apifyHandles: string[] = []
  for (let i = 0; i < handles.length; i++) {
    if (i % 2 === 0) scraperHandles.push(handles[i])
    else apifyHandles.push(handles[i])
  }

  onProgress?.(`[Mixed] Splitting ${handles.length} accounts: ${scraperHandles.length} Scraper, ${apifyHandles.length} Apify`, 0)

  // Run both groups in parallel
  const [scraperResult, apifyResult] = await Promise.allSettled([
    scraperHandles.length > 0
      ? fetchAllViaScraper(config, scraperHandles, lookbackMs, perAccountLimit, limit, (d, n) => onProgress?.(`[Scraper] ${d}`, n))
      : Promise.resolve([]),
    apifyHandles.length > 0
      ? fetchViaApify(config.apify_token!, apifyHandles, lookbackMs, perAccountLimit, (d) => onProgress?.(d))
      : Promise.resolve([]),
  ])

  // If Apify group failed with credit or auth error, retry those handles via scraper
  let apifyItems: IntelItem[] = []
  if (apifyResult.status === 'fulfilled') {
    apifyItems = apifyResult.value
  } else if (isCreditError(apifyResult.reason) || isAuthError(apifyResult.reason)) {
    onProgress?.('[Mixed] Apify failed (credits/auth) — retrying Apify accounts via Scraper')
    try {
      apifyItems = await fetchAllViaScraper(config, apifyHandles, lookbackMs, perAccountLimit, limit, (d, n) => onProgress?.(`[Scraper fallback] ${d}`, n))
    } catch {
      // If scraper fallback also fails, continue with whatever we have
    }
  }

  const scraperItems = scraperResult.status === 'fulfilled' ? scraperResult.value : []

  // Merge + deduplicate
  const seenIds = new Set<string>()
  const merged: IntelItem[] = []
  for (const item of [...scraperItems, ...apifyItems]) {
    if (seenIds.has(item.id)) continue
    seenIds.add(item.id)
    merged.push(item)
    if (merged.length >= limit) break
  }

  return merged
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchXPosts(
  config: ConfigSettings,
  limit: number,
  onProgress?: (detail: string, itemCount?: number) => void,
): Promise<IntelItem[]> {
  const disabled = new Set(config.social_accounts_disabled ?? [])
  const handles = (config.social_accounts_x ?? []).filter(h => !disabled.has(h))
  if (handles.length === 0) return []

  // Resume logic — reuse cached items for accounts already fetched within the window
  const windowHours = config.resume_window_hours ?? 0
  let cachedItems: IntelItem[] = []
  let handlesToFetch = handles
  if (windowHours > 0) {
    try {
      const report = await readReport()
      const fetchedAt = report?.sources_fetched_at?.x
      if (report && isWithinResumeWindow(fetchedAt, windowHours)) {
        cachedItems = (report.items.social ?? []).filter(item => item.source === 'x')
        const cachedHandles = new Set(cachedItems.map(item => (item.handle ?? '').toLowerCase()))
        handlesToFetch = handles.filter(h => !cachedHandles.has(h.replace(/^@/, '').toLowerCase()))
        if (cachedHandles.size > 0) {
          console.log(`[x] Resume: reusing ${cachedHandles.size} cached accounts (window ${windowHours}h)`)
        }
        if (handlesToFetch.length === 0) return cachedItems.slice(0, limit)
      }
    } catch {
      // Cache read failed — proceed with full fetch
    }
  }

  const lookbackHours = config.sensor_lookback_hours?.x ?? 48
  const lookbackMs = lookbackHours * 60 * 60 * 1000
  const perAccountLimit = Math.max(10, Math.ceil(limit / handlesToFetch.length) * 2)

  // Always use twitter-scraper for account fetching.
  // Apify is reserved for trends only (via social_trends sensor) to control costs.
  const freshItems = await fetchAllViaScraper(config, handlesToFetch, lookbackMs, perAccountLimit, limit, onProgress)

  // Merge cached + fresh items, dedup by id
  if (cachedItems.length > 0) {
    const seenIds = new Set(cachedItems.map(item => item.id))
    const merged = [...cachedItems]
    for (const item of freshItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        merged.push(item)
      }
    }
    return merged.slice(0, limit)
  }
  return freshItems
}
