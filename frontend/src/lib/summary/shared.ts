// ABOUTME: Shared utilities for summarization — formatItem, groupBySensor, chunkArray, computeContentHash.
// ABOUTME: Used by both the pipeline orchestrator and the standalone summarizer engine.
import { createHash } from 'crypto'
import type { IntelItem, IntelReport } from '../models'

/** Format an IntelItem into a text block for the LLM prompt. */
export function formatItem(item: IntelItem): string {
  const parts = [`- ${item.title}`]
  if (item.url) parts.push(`  URL: ${item.url}`)
  if (item.abstract) parts.push(`  Abstract: ${item.abstract.slice(0, 400)}`)
  if (item.content) parts.push(`  Content: ${item.content.slice(0, 500)}`)
  if (item.heat) parts.push(`  Heat: ${item.heat}`)
  if (item.account) parts.push(`  Account: ${item.account}`)
  return parts.join('\n')
}

/** Group all report items by their source sensor name. */
export function groupBySensor(report: IntelReport): Map<string, IntelItem[]> {
  const groups = new Map<string, IntelItem[]>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      const existing = groups.get(item.source) ?? []
      existing.push(item)
      groups.set(item.source, existing)
    }
  }
  return groups
}

/** Split an array into chunks of at most `size` elements. */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Compute a deterministic content hash for a set of items.
 * Uses sorted item IDs so the hash is stable regardless of item order.
 * Returns a 16-character hex string.
 */
export function computeContentHash(items: IntelItem[]): string {
  const ids = items.map(i => i.id).sort()
  return createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 16)
}
