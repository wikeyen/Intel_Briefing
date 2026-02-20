// ABOUTME: Keyword-based item filtering for the collection pipeline.
// ABOUTME: Suppress removes items matching keywords; boost reorders matching items to the top.
import type { IntelItem } from '../models'

/** Searchable text fields on an IntelItem. */
function searchableText(item: IntelItem): string {
  return [item.title, item.content, item.abstract].filter(Boolean).join(' ')
}

/** Build a word-boundary regex for a keyword (case-insensitive). */
function keywordRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Remove items whose title, content, or abstract matches any suppress keyword.
 * Matching is case-insensitive with word boundaries to avoid false positives.
 */
export function suppressItems(items: IntelItem[], keywords: string[]): IntelItem[] {
  if (keywords.length === 0) return items
  const patterns = keywords.map(keywordRegex)
  return items.filter((item) => !matchesAny(searchableText(item), patterns))
}

/**
 * Move items matching any boost keyword to the top of the list.
 * Preserves relative order within boosted and non-boosted groups.
 * Matching is case-insensitive with word boundaries.
 */
export function boostItems(items: IntelItem[], keywords: string[]): IntelItem[] {
  if (keywords.length === 0) return items
  const patterns = keywords.map(keywordRegex)
  const boosted: IntelItem[] = []
  const rest: IntelItem[] = []
  for (const item of items) {
    if (matchesAny(searchableText(item), patterns)) {
      boosted.push(item)
    } else {
      rest.push(item)
    }
  }
  return [...boosted, ...rest]
}
