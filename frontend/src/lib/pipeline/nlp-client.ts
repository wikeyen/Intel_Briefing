// ABOUTME: HTTP client for the Python NLP sidecar service.
// ABOUTME: Calls POST /enrich (batched) + POST /cluster for analysis, and GET /health for readiness checks.

const NLP_BASE = process.env.NLP_SIDECAR_URL ?? 'http://localhost:8001'
const NLP_ENRICH_TIMEOUT_MS = 30_000
const NLP_CLUSTER_TIMEOUT_MS = 60_000
const ENRICH_BATCH_SIZE = 200

export interface NlpKeyword {
  text: string
  weight: number
}

export interface NlpSentiment {
  label: string
  score: number
}

export interface NlpEntities {
  people: string[]
  orgs: string[]
  places: string[]
}

export interface NlpEnrichedItem {
  id: string
  keywords: NlpKeyword[]
  sentiment: NlpSentiment
  entities: NlpEntities
}

export interface NlpCluster {
  id: number
  label: string
  item_ids: string[]
  top_keywords: NlpKeyword[]
  sentiment_distribution: Record<string, number>
  representative_items: string[]
}

export interface NlpAnalyzeResponse {
  items: NlpEnrichedItem[]
  clusters: NlpCluster[]
}

interface AnalyzeInput {
  id: string
  title: string
  abstract?: string
  lang: string
}

/** Check if the NLP sidecar is available and ready. */
export async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${NLP_BASE}/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    return data.status === 'ready' && data.models_loaded === true
  } catch {
    return false
  }
}

/** Send a batch of items to /enrich for per-item NLP enrichment. */
async function enrichBatch(items: AnalyzeInput[]): Promise<NlpEnrichedItem[]> {
  const resp = await fetch(`${NLP_BASE}/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(NLP_ENRICH_TIMEOUT_MS),
  })
  if (!resp.ok) {
    throw new Error(`/enrich returned ${resp.status}`)
  }
  const data = await resp.json()
  return data.items as NlpEnrichedItem[]
}

/** Send all items + enrichment data to /cluster for global topic clustering. */
async function clusterAll(
  items: AnalyzeInput[],
  enrichedItems: NlpEnrichedItem[],
): Promise<NlpCluster[]> {
  // Build per-item maps from enriched results
  const perItemKeywords: Record<string, Array<{ text: string; weight: number }>> = {}
  const perItemSentiment: Record<string, string> = {}
  for (const item of enrichedItems) {
    perItemKeywords[item.id] = item.keywords
    perItemSentiment[item.id] = item.sentiment.label
  }

  const resp = await fetch(`${NLP_BASE}/cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      per_item_keywords: perItemKeywords,
      per_item_sentiment: perItemSentiment,
    }),
    signal: AbortSignal.timeout(NLP_CLUSTER_TIMEOUT_MS),
  })
  if (!resp.ok) {
    throw new Error(`/cluster returned ${resp.status}`)
  }
  const data = await resp.json()
  return data.clusters as NlpCluster[]
}

/** Send items to the NLP sidecar for analysis. Returns null if sidecar is unavailable. */
export async function analyzeItems(items: AnalyzeInput[]): Promise<NlpAnalyzeResponse | null> {
  try {
    // Phase 1: Enrich items in batches
    const allEnriched: NlpEnrichedItem[] = []
    for (let i = 0; i < items.length; i += ENRICH_BATCH_SIZE) {
      const batch = items.slice(i, i + ENRICH_BATCH_SIZE)
      const enriched = await enrichBatch(batch)
      allEnriched.push(...enriched)
    }

    // Phase 2: Global clustering (one call with all items)
    const clusters = await clusterAll(items, allEnriched)

    return { items: allEnriched, clusters }
  } catch (err) {
    console.warn('[nlp-client] analyze failed:', err)
    return null
  }
}
