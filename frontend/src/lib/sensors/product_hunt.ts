// ABOUTME: Product Hunt sensor using the official GraphQL API.
// ABOUTME: Fetches trending products ordered by votes; requires a valid producthunt_token in config.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'

const PH_API = 'https://api.producthunt.com/v2/api/graphql'

function buildQuery(limit: number): string {
  return `query {
  posts(first: ${limit}, order: VOTES) {
    edges {
      node {
        name
        tagline
        url
        votesCount
        website
        slug
        topics { edges { node { name } } }
        user { name }
      }
    }
  }
}`
}

export async function fetchProductHunt(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.producthunt_token) throw new SensorConfigError('Product Hunt token not configured')

  try {
    const resp = await fetch(PH_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.producthunt_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: buildQuery(limit) }),
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Product Hunt`)
    const data = await resp.json() as Record<string, unknown>

    const items: IntelItem[] = []
    const edges = ((data.data as Record<string, unknown>)?.posts as Record<string, unknown>)?.edges as Array<Record<string, unknown>> ?? []

    for (const edge of edges) {
      const node = edge.node as Record<string, unknown>
      const slug = node.slug as string | undefined
      const phUrl = slug
        ? `https://www.producthunt.com/posts/${slug}`
        : String(node.url ?? '')
      const topicEdges = ((node.topics as Record<string, unknown>)?.edges as Array<Record<string, unknown>>) ?? []
      const topics = topicEdges
        .map((t) => (t.node as Record<string, string>)?.name)
        .filter(Boolean)
        .slice(0, 3)

      const name = String(node.name ?? '')
      items.push({
        id: `ph-${slug ?? name.toLowerCase().replace(/ /g, '-')}`,
        source: 'product_hunt',
        title: `${name} — ${node.tagline}`,
        url: phUrl,
        heat: `${node.votesCount ?? 0} votes`,
        categories: topics.length > 0 ? topics : null,
      })
    }
    return items.slice(0, limit)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
