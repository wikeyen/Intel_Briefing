// ABOUTME: Unified summarization engine — per-sensor summaries with map-reduce and caching, plus overall briefing.
// ABOUTME: Shared by both the pipeline orchestrator and the standalone trigger route.
import type { IntelReport, IntelItem, BriefingSummary, SensorSummary, BriefingRef } from '../models'
import { SOURCE_URLS, EMPTY_SENTIMENT } from '../models'
import { Semaphore } from '../pipeline/semaphore'
import { chatCompletion, type LlmConfig, type ChatMessage } from './llm'
import { getSensorPrompt, getOverallPrompt, CHUNK_SIZE, CHUNK_EXTRACT_PROMPT } from './prompts'
import { parseSensorJson, parseOverallJson } from './parse-json'
import { SENSOR_LABELS } from '../sensors/taxonomy'
import { formatItem, groupBySensor, chunkArray, computeContentHash } from './shared'
import { readSensorSummary, writeSensorSummary } from './cache'
import { buildUrlPool, buildSensorUrlPool } from './ref-verifier'
import { summarizeWithVerification } from './retry-with-verification'

export type SummaryProgressCallback = (
  sensorName: string,
  label: string,
  state: 'pending' | 'running' | 'ok' | 'failed' | 'cached',
  error: string | null,
  chunks?: { total: number; done: number },
) => void | Promise<void>

export interface SummarizeOptions {
  llmConfig: LlmConfig
  /** Number of concurrent per-sensor LLM calls. Defaults to 1. */
  concurrency?: number
  /** Per-sensor prompt overrides from config. */
  promptOverrides?: Record<string, string>
  /** Custom override for the overall briefing prompt. */
  overallPromptOverride?: string
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
  /** Progress callback for per-sensor and overall status. */
  onProgress?: SummaryProgressCallback
  /**
   * When true, skip per-sensor cache checks and always call the LLM.
   * Used by fetch+summarize to force fresh analysis after new data arrives.
   */
  skipCache?: boolean
  /**
   * Only summarize sensors in this set. When omitted, all sensors with data are summarized.
   * Sensors NOT in this set, sensors in `report.sources_failed`, and sensors with no items
   * are automatically excluded by the engine.
   */
  enabledSensors?: Set<string>
}

/**
 * Summarize items from a single sensor via LLM using map-reduce.
 *
 * - Small batches (<= CHUNK_SIZE): single LLM call with synthesis prompt.
 * - Large batches: map phase extracts signals from each chunk concurrently,
 *   then reduce phase synthesizes all extractions with the per-sensor prompt.
 */
async function summarizeSensor(
  sensorName: string,
  items: IntelItem[],
  llmConfig: LlmConfig,
  promptOverrides?: Record<string, string>,
  onChunkProgress?: (total: number, done: number) => void,
  signal?: AbortSignal,
): Promise<SensorSummary | null> {
  if (items.length === 0) return null

  const label = SENSOR_LABELS[sensorName] ?? sensorName
  const sensorPrompt = getSensorPrompt(sensorName, promptOverrides)
  const knownUrls = buildUrlPool(items)

  let messages: ChatMessage[]

  if (items.length <= CHUNK_SIZE) {
    // Single-pass: small enough for one LLM call
    const itemsText = items.map(formatItem).join('\n\n')
    messages = [
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: `综合分析以下 ${label} 的 ${items.length} 条内容：\n\n${itemsText}` },
    ]
  } else {
    // Map-reduce: chunk → extract signals → merge
    const chunks = chunkArray(items, CHUNK_SIZE)
    onChunkProgress?.(chunks.length, 0)

    // Map phase: extract key signals from each chunk concurrently
    // (chunk extraction uses chatCompletion directly — no refs to verify)
    let chunksCompleted = 0
    const extractionPromises = chunks.map((chunk, i) => {
      const chunkText = chunk.map(formatItem).join('\n\n')
      return chatCompletion([
        { role: 'system', content: CHUNK_EXTRACT_PROMPT },
        { role: 'user', content: `以下是 ${label} 的第 ${i + 1}/${chunks.length} 批内容（${chunk.length} 条）：\n\n${chunkText}` },
      ], llmConfig, signal).then(result => {
        chunksCompleted++
        onChunkProgress?.(chunks.length, chunksCompleted)
        return result
      })
    })
    const extractions = await Promise.all(extractionPromises)

    // Reduce phase: synthesize all extractions with the per-sensor prompt
    const mergedExtractions = extractions
      .map((ext, i) => `[批次 ${i + 1}] ${ext}`)
      .join('\n\n')
    messages = [
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: `以下是从 ${items.length} 条 ${label} 内容中提取的关键信号（分 ${chunks.length} 批提取）。请综合分析：\n\n${mergedExtractions}` },
    ]
  }

  // Use retry-with-verification for the final synthesis call
  const parsed = await summarizeWithVerification({
    messages,
    llmConfig,
    parseFn: parseSensorJson,
    knownUrls,
    extractRefs: (p) => p.items.map(it => ({ title: it.title, url: it.url })),
    applyVerified: (p, refs) => {
      const refMap = new Map(refs.map(r => [r.url, r.verified]))
      return {
        ...p,
        items: p.items.map(it => ({ ...it, verified: refMap.get(it.url) ?? null })),
      }
    },
    signal,
  })

  return {
    sensor_name: sensorName,
    label,
    source_url: SOURCE_URLS[sensorName] ?? '',
    summary: parsed.summary,
    item_count: items.length,
    items: parsed.items,
  }
}

/**
 * Unified summarization engine — produces per-sensor summaries and an overall briefing.
 *
 * Supports:
 * - Map-reduce chunking for large item sets
 * - Semaphore-controlled concurrency
 * - Per-sensor caching with content hashing (skip unchanged sources on regenerate)
 * - Prompt overrides from config
 * - AbortSignal for cancellation
 * - Progress callbacks for both orchestrator and standalone routes
 *
 * When `skipCache` is false (default), checks per-sensor summary cache before calling LLM.
 * Cached summaries whose content hash matches the current items are reused.
 * When `skipCache` is true, all sensors are re-summarized fresh.
 */
export async function summarizeReport(
  report: IntelReport,
  options: SummarizeOptions,
): Promise<BriefingSummary> {
  const {
    llmConfig,
    concurrency = 1,
    promptOverrides,
    overallPromptOverride,
    signal,
    onProgress,
    skipCache = false,
    enabledSensors,
  } = options

  const semaphore = new Semaphore(concurrency)
  const sensorGroups = groupBySensor(report)
  const sections: SensorSummary[] = []

  // Build the set of sensors to exclude:
  // 1. Sensors not in enabledSensors (if provided)
  // 2. Sensors that failed during the fetch stage (from report.sources_failed)
  const failedSet = new Set(report.sources_failed)
  const shouldSummarize = (name: string): boolean => {
    if (failedSet.has(name)) return false
    if (enabledSensors && !enabledSensors.has(name)) return false
    return true
  }

  // Per-sensor summaries — concurrent through the semaphore
  const summaryPromises = Array.from(sensorGroups.entries())
    .filter(([sensorName]) => shouldSummarize(sensorName))
    .map(([sensorName, items]) =>
      semaphore.run(async () => {
        if (signal?.aborted) return null
        if (items.length === 0) return null

        const label = SENSOR_LABELS[sensorName] ?? sensorName

        // Check per-sensor cache unless skipCache is set
        if (!skipCache) {
          const contentHash = computeContentHash(items)
          const cached = await readSensorSummary(sensorName)
          if (cached && cached.content_hash === contentHash) {
            await onProgress?.(sensorName, label, 'cached', null)
            return cached.sensor_summary
          }
        }

        await onProgress?.(sensorName, label, 'running', null)

        try {
          const result = await summarizeSensor(
            sensorName, items, llmConfig, promptOverrides,
            (total, done) => onProgress?.(sensorName, label, 'running', null, { total, done }),
            signal,
          )
          if (signal?.aborted) return null
          if (result) {
            // Cache the per-sensor summary for future regeneration
            const contentHash = computeContentHash(items)
            await writeSensorSummary(sensorName, contentHash, result).catch(() => {})
          }
          await onProgress?.(sensorName, label, 'ok', null)
          return result
        } catch (err) {
          if (signal?.aborted) return null
          const message = err instanceof Error ? err.message : String(err)
          await onProgress?.(sensorName, label, 'failed', message)
          // When progress callback is present, swallow per-sensor errors and continue
          if (onProgress) return null
          throw err
        }
      }),
    )

  const summaryResults = await Promise.all(summaryPromises)
  if (signal?.aborted) {
    return buildPartialResult(report, sections)
  }

  for (const result of summaryResults) {
    if (result) sections.push(result)
  }

  // Overall briefing — include notable items with URLs so the LLM can cite sources
  await onProgress?.('__overall__', 'Overall', 'running', null)

  const overallContext = sections.length > 0
    ? sections.map(s => {
        const itemsList = s.items.length > 0
          ? '\n  Notable items:\n' + s.items.map(it => `  - "${it.title}" ${it.url}`).join('\n')
          : ''
        return `**${s.label}** (${s.item_count} items): ${s.summary}${itemsList}`
      }).join('\n\n')
    : 'No data was collected in this run.'

  const overallMessages: ChatMessage[] = [
    { role: 'system', content: getOverallPrompt(overallPromptOverride) },
    { role: 'user', content: `请根据以下各信息源摘要生成简报：\n\n${overallContext}` },
  ]

  // Build URL pool from verified per-sensor notable items
  const overallUrlPool = buildSensorUrlPool(sections)

  let overall: ReturnType<typeof parseOverallJson>
  try {
    overall = await summarizeWithVerification({
      messages: overallMessages,
      llmConfig,
      parseFn: parseOverallJson,
      knownUrls: overallUrlPool,
      extractRefs: (parsed) => {
        const allRefs: BriefingRef[] = []
        for (const entry of parsed.quick_scan) allRefs.push(...entry.refs)
        for (const sec of parsed.sections) {
          for (const entry of sec.entries) allRefs.push(...entry.refs)
        }
        for (const entry of parsed.sentiment.controversies) allRefs.push(...entry.refs)
        for (const entry of parsed.sentiment.opinion_shifts) allRefs.push(...entry.refs)
        for (const entry of parsed.sentiment.risk_flags) allRefs.push(...entry.refs)
        return allRefs
      },
      applyVerified: (parsed, refs) => {
        const refMap = new Map(refs.map(r => [r.url, r.verified]))
        const applyToRefs = (entryRefs: BriefingRef[]) =>
          entryRefs.map(r => ({ ...r, verified: refMap.get(r.url) ?? r.verified }))
        return {
          ...parsed,
          quick_scan: parsed.quick_scan.map(e => ({ ...e, refs: applyToRefs(e.refs) })),
          sections: parsed.sections.map(s => ({
            ...s,
            entries: s.entries.map(e => ({ ...e, refs: applyToRefs(e.refs) })),
          })),
          sentiment: {
            ...parsed.sentiment,
            controversies: parsed.sentiment.controversies.map(e => ({ ...e, refs: applyToRefs(e.refs) })),
            opinion_shifts: parsed.sentiment.opinion_shifts.map(e => ({ ...e, refs: applyToRefs(e.refs) })),
            risk_flags: parsed.sentiment.risk_flags.map(e => ({ ...e, refs: applyToRefs(e.refs) })),
          },
        }
      },
      signal,
    })
    await onProgress?.('__overall__', 'Overall', 'ok', null)
  } catch (err) {
    await onProgress?.('__overall__', 'Overall', 'failed', (err as Error).message)
    overall = { quick_scan: [], executive_summary: '', sections: [], sentiment: { ...EMPTY_SENTIMENT } }
  }

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    report_fetched_at: report.fetched_at,
    sections,
    overall,
  }
}

function buildPartialResult(report: IntelReport, sections: SensorSummary[]): BriefingSummary {
  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    report_fetched_at: report.fetched_at,
    sections,
    overall: { quick_scan: [], executive_summary: '', sections: [], sentiment: { ...EMPTY_SENTIMENT } },
  }
}
