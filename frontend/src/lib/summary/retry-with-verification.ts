// ABOUTME: LLM retry loop with URL verification — re-prompts the LLM when refs fail validation.
// ABOUTME: Uses pool match + HTTP fallback, feeds failures back to LLM, max 3 retries.
import type { BriefingRef } from '../models'
import type { ChatMessage, LlmConfig } from './llm'
import { chatCompletion, chatCompletionStream } from './llm'
import { verifyRefs } from './ref-verifier'

const DEFAULT_MAX_RETRIES = 3

export interface SummarizeWithVerificationOptions<T> {
  messages: ChatMessage[]
  llmConfig: LlmConfig
  /** Parse raw LLM output into a structured result. */
  parseFn: (raw: string) => T
  /** Known-good URL pool for instant verification. */
  knownUrls: Set<string>
  /** Extract refs from the parsed result for verification. */
  extractRefs: (parsed: T) => BriefingRef[]
  /** Apply verified refs back into the parsed result. */
  applyVerified: (parsed: T, refs: BriefingRef[]) => T
  /** When true, only accept URLs in the known pool — no HTTP fallback.
   *  Prevents hallucinated URLs (like platform homepages) from passing verification. */
  poolOnly?: boolean
  /** Max number of retry attempts (default: 3). */
  maxRetries?: number
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
  /** Called on each retry with attempt number, max retries, and failure count. */
  onRetry?: (attempt: number, maxRetries: number, failureCount: number) => void | Promise<void>
  /** Token callback for streaming visual feedback during LLM generation. */
  onToken?: (token: string) => void
}

/** Build a correction message telling the LLM which refs failed and what URLs are available. */
function buildCorrectionMessage(failures: BriefingRef[], knownUrls: Set<string>): string {
  const failedList = failures
    .map(f => `- "${f.title}" ${f.url}`)
    .join('\n')

  const validList = Array.from(knownUrls)
    .map(u => `- ${u}`)
    .join('\n')

  return (
    `The following reference links failed verification (not accessible or do not exist):\n${failedList}\n\n` +
    `Please regenerate using only the following valid links:\n${validList}`
  )
}

/**
 * Call the LLM, verify refs, and retry with feedback on failures.
 *
 * Flow:
 * 1. chatCompletion -> parse -> extract refs -> verifyRefs
 * 2. If all pass -> return with verified=true on all refs
 * 3. If failures -> append assistant response + correction message -> retry
 * 4. After maxRetries -> return with failed refs marked verified=false
 */
export async function summarizeWithVerification<T>(
  options: SummarizeWithVerificationOptions<T>,
): Promise<T> {
  const {
    llmConfig,
    parseFn,
    knownUrls,
    extractRefs,
    applyVerified,
    poolOnly,
    maxRetries = DEFAULT_MAX_RETRIES,
    signal,
    onRetry,
    onToken,
  } = options

  // Clone messages so we can append without mutating the caller's array
  const messages: ChatMessage[] = [...options.messages]

  let lastParsed: T | null = null
  let lastRaw = ''

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (onToken) {
      lastRaw = await chatCompletionStream(messages, llmConfig, { onToken, signal }).fullText
    } else {
      lastRaw = await chatCompletion(messages, llmConfig, signal)
    }
    lastParsed = parseFn(lastRaw)

    const refs = extractRefs(lastParsed)
    if (refs.length === 0) {
      return lastParsed
    }

    const { verified, failures } = await verifyRefs(refs, knownUrls, { poolOnly })

    if (failures.length === 0) {
      // All refs verified — apply verified status and return
      return applyVerified(lastParsed, verified)
    }

    if (attempt < maxRetries) {
      // Notify about the retry
      await onRetry?.(attempt + 1, maxRetries, failures.length)
      // Append the LLM's response and our correction as new messages for the retry
      messages.push({ role: 'assistant', content: lastRaw })
      messages.push({ role: 'user', content: buildCorrectionMessage(failures, knownUrls) })
    } else {
      // Final attempt exhausted — combine verified + failures (marked verified=false)
      const allRefs = [...verified, ...failures]
      return applyVerified(lastParsed, allRefs)
    }
  }

  // Should not reach here, but satisfy TypeScript
  return lastParsed!
}
