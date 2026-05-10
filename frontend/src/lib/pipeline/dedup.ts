// ABOUTME: Deduplication logic for Info Aggregation pipeline.
// ABOUTME: Removes duplicate items by title (case-insensitive) and deduplicates social section overlap.
import type { IntelItem } from '../models'

/**
 * Remove duplicate items within a list using case-insensitive title matching.
 *
 * Items with empty or missing titles are always kept (they cannot be
 * meaningfully deduplicated by title).
 */
export function dedupItems(items: IntelItem[]): IntelItem[] {
  const seen = new Set<string>()
  const result: IntelItem[] = []

  for (const item of items) {
    const key = item.title?.trim().toLowerCase() ?? ''
    if (!key) {
      // Keep items with empty titles — cannot deduplicate them
      result.push(item)
      continue
    }
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }

  return result
}

/**
 * Deduplicate items within the social section.
 *
 * If the same URL appears from both accounts and topics/trends sub-sensors,
 * keep the accounts version (more specific source wins). This avoids
 * double-counting posts from tracked accounts that also match tracked keywords.
 */
export function dedupAcrossSections(
  sections: Record<string, IntelItem[]>,
): Record<string, IntelItem[]> {
  const social = sections['social'] ?? []
  if (social.length === 0) return sections

  // Within social: if the same URL appears from both accounts and topics/trends,
  // keep the accounts version (more specific source wins).
  const accountUrls = new Set(
    social.filter(item => item.id.includes('-accounts-')).map(item => item.url).filter(Boolean),
  )
  if (accountUrls.size === 0) return sections

  return {
    ...sections,
    social: social.filter(item =>
      item.id.includes('-accounts-') || !accountUrls.has(item.url),
    ),
  }
}
