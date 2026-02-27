// ABOUTME: HTTP client for the Python NLP sidecar service.
// ABOUTME: Calls POST /analyze for item enrichment and GET /health for readiness checks.

const NLP_BASE = process.env.NLP_SIDECAR_URL ?? 'http://localhost:8001'
const NLP_TIMEOUT_MS = 30_000

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

/** Send items to the NLP sidecar for analysis. Returns null if sidecar is unavailable. */
export async function analyzeItems(items: AnalyzeInput[]): Promise<NlpAnalyzeResponse | null> {
  try {
    const resp = await fetch(`${NLP_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(NLP_TIMEOUT_MS),
    })
    if (!resp.ok) {
      console.warn(`[nlp-client] /analyze returned ${resp.status}`)
      return null
    }
    return await resp.json() as NlpAnalyzeResponse
  } catch (err) {
    console.warn('[nlp-client] /analyze failed:', err)
    return null
  }
}
