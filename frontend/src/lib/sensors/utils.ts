// ABOUTME: Shared utility functions used across multiple sensor modules.
// ABOUTME: Consolidates stripHtml, md5Short, hashString, delay to avoid duplication.
import { createHash } from 'crypto'

/** Strip all HTML tags and trim whitespace. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

/** Return first 8 hex chars of the MD5 hash of a string. */
export function md5Short(input: string): string {
  return createHash('md5').update(input).digest('hex').slice(0, 8)
}

/** Simple DJB2-style string hash. Always returns a non-negative integer. */
export function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Promise-based delay for rate-limiting. */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
