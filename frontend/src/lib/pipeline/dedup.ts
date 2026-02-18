// ABOUTME: Deduplication logic for Intel Briefing pipeline.
// ABOUTME: Removes duplicate items by title (case-insensitive) and deduplicates politics/topics overlap.
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
 * Deduplicate items across the politics and topics sections.
 *
 * If the same post (matched by id) appears in both politics and topics,
 * keep it in politics and remove it from topics. This avoids double-counting
 * posts from tracked political accounts that also match tracked keywords.
 */
export function dedupAcrossSections(
  sections: Record<string, IntelItem[]>,
): Record<string, IntelItem[]> {
  const politics = sections['politics'] ?? []
  const politicsIds = new Set(politics.map((item) => item.id))

  if (politicsIds.size === 0) {
    return sections
  }

  const topics = sections['topics'] ?? []
  if (topics.length === 0) {
    return sections
  }

  return {
    ...sections,
    topics: topics.filter((item) => !politicsIds.has(item.id)),
  }
}
