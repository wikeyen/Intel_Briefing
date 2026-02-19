// ABOUTME: GitHub sensor using the GitHub GraphQL API to find recently-created trending repos.
// ABOUTME: Requires a valid GitHub token in config.github_token; skips gracefully without one.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'

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
      const errMsg = JSON.stringify((data as Record<string, unknown>).errors).slice(0, 200)
      throw new Error(`GitHub GraphQL error: ${errMsg}`)
    }

    const items: IntelItem[] = []
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

      items.push({
        id: `gh-${safeName.replace(/\//g, '-')}`,
        source: 'github',
        title,
        url: String(node.url ?? ''),
        heat: `${node.stargazerCount ?? 0} stars`,
        published_at: publishedAt,
      })
    }
    return items.slice(0, limit)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
