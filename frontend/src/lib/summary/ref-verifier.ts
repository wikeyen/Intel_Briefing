// ABOUTME: URL hallucination checker — verifies LLM-generated ref URLs against a known-good pool.
// ABOUTME: Pool match is instant; non-pool URLs get HTTP HEAD/GET fallback via verifyLink().
import type { BriefingRef, IntelItem, SensorSummaryItem } from '../models'
import { verifyLink } from '../utils/verifier'

const HTTP_CONCURRENCY = 5

export interface VerifyResult {
  verified: BriefingRef[]
  failures: BriefingRef[]
}

/** Build a Set of known-good URLs from source items. */
export function buildUrlPool(items: IntelItem[]): Set<string> {
  const pool = new Set<string>()
  for (const item of items) {
    if (item.url) pool.add(item.url)
  }
  return pool
}

/** Build a URL pool from already-verified sensor summary items. */
export function buildSensorUrlPool(sensorSummaries: { items: SensorSummaryItem[] }[]): Set<string> {
  const pool = new Set<string>()
  for (const section of sensorSummaries) {
    for (const item of section.items) {
      if (item.url && item.verified !== false) pool.add(item.url)
    }
  }
  return pool
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Verify an array of BriefingRefs against a known-good URL pool.
 * Pool matches are instant. Non-pool URLs get HTTP verification.
 * Returns verified refs (with verified=true) and failures separately.
 */
export async function verifyRefs(
  refs: BriefingRef[],
  knownUrls: Set<string>,
): Promise<VerifyResult> {
  if (refs.length === 0) return { verified: [], failures: [] }

  const verified: BriefingRef[] = []
  const failures: BriefingRef[] = []
  const needsHttp: BriefingRef[] = []

  // Phase 1: pool match (instant)
  for (const ref of refs) {
    if (!ref.url || !isValidUrl(ref.url)) {
      failures.push({ ...ref, verified: false })
    } else if (knownUrls.has(ref.url)) {
      verified.push({ ...ref, verified: true })
    } else {
      needsHttp.push(ref)
    }
  }

  // Phase 2: HTTP verification for non-pool URLs (concurrent, capped)
  if (needsHttp.length > 0) {
    const chunks: BriefingRef[][] = []
    for (let i = 0; i < needsHttp.length; i += HTTP_CONCURRENCY) {
      chunks.push(needsHttp.slice(i, i + HTTP_CONCURRENCY))
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (ref) => {
          const ok = await verifyLink(ref.url)
          return { ref, ok }
        }),
      )
      for (const { ref, ok } of results) {
        if (ok) {
          verified.push({ ...ref, verified: true })
        } else {
          failures.push({ ...ref, verified: false })
        }
      }
    }
  }

  return { verified, failures }
}
