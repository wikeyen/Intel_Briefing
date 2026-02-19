// ABOUTME: Decodes HTML entities in text strings to readable characters.
// ABOUTME: Applied as a post-processing step in the collector pipeline to all sensor output.
import { decode } from 'he'

const TEXT_FIELDS = ['title', 'abstract', 'content', 'heat', 'topic', 'account', 'handle']

/** Decode HTML entities in all text fields of an IntelItem (mutates in place). */
export function decodeItemEntities(item: Record<string, unknown>): void {
  for (const field of TEXT_FIELDS) {
    if (typeof item[field] === 'string') {
      item[field] = decode(item[field] as string)
    }
  }
}
