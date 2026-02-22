// ABOUTME: GitHub sensor using the GitHub GraphQL API to find recently-created trending repos.
// ABOUTME: Tracks star velocity across runs via per-repo cache snapshots in the kv store.
import type { ConfigSettings, IntelItem } from '../models'
import { kvGet, kvSet } from '../db'
import { SensorConfigError } from './errors'

const STAR_CACHE_PREFIX = 'github_stars:'
const STAR_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

interface StarSnapshot {
  count: number
  firstSeenAt: string
}

const GRAPHQL_URL = 'https://api.github.com/graphql'

const GRAPHQL_QUERY = `
query($search_query: String!, $count: Int!) {
  search(query: $search_query, type: REPOSITORY, first: $count) {
    edges {
      node {
        ... on Repository {
          nameWithOwner
          url
          description
          stargazerCount
          forkCount
          createdAt
          primaryLanguage { name }
        }
      }
    }
  }
}`

export async function fetchGitHub(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.github_token) throw new SensorConfigError('GitHub token not configured')

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)
  const searchQuery = `created:>${sevenDaysAgo} sort:stars`

  try {
    const resp = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.github_token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Intel-Briefing/1.0',
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables: { search_query: searchQuery, count: Math.min(limit, 25) },
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from GitHub`)
    const data = await resp.json() as Record<string, unknown>

    if ('errors' in data) {
      const errMsg = JSON.stringify((data as Record<string, unknown>).errors)
      throw new Error(`GitHub GraphQL error: ${errMsg}`)
    }

    const items: IntelItem[] = []
    // Maps item.id → { starCount, nameWithOwner } for velocity tracking
    const repoMeta = new Map<string, { stars: number; nameWithOwner: string }>()
    const edges = ((data.data as Record<string, unknown>)?.search as Record<string, unknown>)?.edges as Array<Record<string, unknown>> ?? []

    for (const edge of edges) {
      const node = edge.node as Record<string, unknown> | undefined
      if (!node) continue

      const rawName = String(node.nameWithOwner ?? '')
      const safeName = rawName.replace(/[^a-zA-Z0-9/_.\-]/g, '_')
      const description = String(node.description ?? '')
      const title = safeName + (description ? ` — ${description}` : '')
      const createdAt = String(node.createdAt ?? '')
      const publishedAt = createdAt ? createdAt.slice(0, 10) : null
      const currentStars = typeof node.stargazerCount === 'number' ? node.stargazerCount : 0
      const itemId = `gh-${safeName.replace(/\//g, '-')}`

      repoMeta.set(itemId, { stars: currentStars, nameWithOwner: rawName })
      items.push({
        id: itemId,
        source: 'github',
        title,
        url: String(node.url ?? ''),
        heat: `${currentStars} stars`,
        published_at: publishedAt,
      })
    }

    const result = items.slice(0, limit)

    // Velocity tracking is best-effort — never fail the sensor over cache errors
    try {
      await attachStarVelocity(result, repoMeta)
    } catch {
      // Silently continue without velocity data
    }

    return result
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/**
 * Attach velocity data to each item by comparing current star counts
 * against cached snapshots from the previous run. Mutates items in-place.
 * Writes updated snapshots back to the cache for the next run.
 */
async function attachStarVelocity(
  items: IntelItem[],
  repoMeta: Map<string, { stars: number; nameWithOwner: string }>,
): Promise<void> {
  const now = new Date().toISOString()

  for (const item of items) {
    const meta = repoMeta.get(item.id)
    if (!meta) continue

    const currentCount = meta.stars
    const cacheKey = `${STAR_CACHE_PREFIX}${meta.nameWithOwner}`
    const previous = await kvGet<StarSnapshot>(cacheKey)

    if (!previous) {
      // First time seeing this repo — record it, no delta available
      item.velocity = {
        previousCount: null,
        currentCount,
        changePercent: null,
        firstSeenAt: now,
        hoursOnTrend: null,
      }
      await kvSet(cacheKey, { count: currentCount, firstSeenAt: now } satisfies StarSnapshot, STAR_CACHE_TTL_SECONDS)
    } else {
      const hoursOnTrend = Math.round(
        (Date.now() - new Date(previous.firstSeenAt).getTime()) / (1000 * 60 * 60) * 10,
      ) / 10
      const changePercent = previous.count > 0
        ? Math.round(((currentCount - previous.count) / previous.count) * 1000) / 10
        : null

      item.velocity = {
        previousCount: previous.count,
        currentCount,
        changePercent,
        firstSeenAt: previous.firstSeenAt,
        hoursOnTrend,
      }
      // Update the snapshot count but preserve the firstSeenAt timestamp
      await kvSet(cacheKey, { count: currentCount, firstSeenAt: previous.firstSeenAt } satisfies StarSnapshot, STAR_CACHE_TTL_SECONDS)
    }
  }
}
