// ABOUTME: Unified summarization engine — per-sensor summaries with map-reduce and caching, plus overall briefing.
// ABOUTME: Shared by both the pipeline orchestrator and the standalone trigger route.
import type { IntelReport, IntelItem, BriefingSummary, SensorSummary, BriefingSource, SummaryLanguage } from '../models'
import { SOURCE_URLS, EMPTY_SENTIMENT } from '../models'
import { Semaphore } from '../pipeline/semaphore'
import { chatCompletion, chatCompletionStream, type LlmConfig, type ChatMessage } from './llm'
import { getSensorPrompt, getOverallPrompt, getChunkExtractPrompt, CHUNK_SIZE } from './prompts'
import { parseSensorJson, parseOverallJson } from './parse-json'
import { SENSOR_LABELS } from '../sensors/taxonomy'
import { formatItem, groupBySensor, chunkArray, computeContentHash } from './shared'
import { aggregateSentiment } from '../pipeline/sentiment'
import { readSensorSummary, writeSensorSummary } from './cache'
import { buildUrlPool } from './ref-verifier'
import { summarizeWithVerification } from './retry-with-verification'
import {
  getAttributionSystemPrompt,
  buildSectionAttributionPrompt,
  buildExecSummaryAttributionPrompt,
  buildSentimentAttributionPrompt,
  parseSectionAttributionResult,
  parseTextAttributionResult,
  parseSentimentAttributionResult,
  stripInvalidMarkers,
} from './attribution'

export type SummaryProgressCallback = (
  sensorName: string,
  label: string,
  state: 'pending' | 'running' | 'ok' | 'failed' | 'cached',
  error: string | null,
  chunks?: { total: number; done: number },
  verify?: { attempt: number; maxRetries: number; failures: number },
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
  /** Token callback for streaming visual feedback. Called with (sensorName, token). */
  onToken?: (sensorName: string, token: string) => void
  /** LLM config override for attribution calls (cheap model). Falls back to main llmConfig. */
  attributionLlmConfig?: LlmConfig
  /** Output language for generated summaries. Defaults to 'zh'. */
  language?: SummaryLanguage
  /** When true, skip the overall briefing generation and return only per-sensor summaries. */
  skipOverall?: boolean
}

/**
 * Language-keyed template functions for user messages in the summarization pipeline.
 * Keeps all inline Chinese/English strings in one place.
 */
function msg(language?: SummaryLanguage) {
  const en = language === 'en'
  return {
    singlePass: (label: string, count: number, itemsText: string) =>
      en
        ? `Synthesize the following ${count} ${label} items:\n\n${itemsText}`
        : `综合分析以下 ${label} 的 ${count} 条内容：\n\n${itemsText}`,
    chunkUser: (label: string, i: number, total: number, count: number, chunkText: string) =>
      en
        ? `The following is batch ${i}/${total} of ${label} content (${count} items):\n\n${chunkText}`
        : `以下是 ${label} 的第 ${i}/${total} 批内容（${count} 条）：\n\n${chunkText}`,
    batchLabel: (i: number) =>
      en ? `[Batch ${i}]` : `[批次 ${i}]`,
    reduceUser: (count: number, label: string, chunks: number, merged: string) =>
      en
        ? `The following are key signals extracted from ${count} ${label} items (in ${chunks} batches). Please synthesize:\n\n${merged}`
        : `以下是从 ${count} 条 ${label} 内容中提取的关键信号（分 ${chunks} 批提取）。请综合分析：\n\n${merged}`,
    sourceListHeader: en ? '## Reference List\n' : '## 参考清单\n',
    sensorSummariesHeader: en ? '## Per-Source Trend Analysis\n\n' : '## 各信息源趋势分析\n\n',
    overallUser: (context: string) =>
      en
        ? `Generate a briefing based on the following reference list and per-source trend analysis:\n\n${context}`
        : `请根据以下参考清单和信息源趋势分析生成简报：\n\n${context}`,
  }
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
  onVerifyRetry?: (attempt: number, maxRetries: number, failures: number) => void | Promise<void>,
  onToken?: (token: string) => void,
  language?: SummaryLanguage,
): Promise<SensorSummary | null> {
  if (items.length === 0) return null

  const label = SENSOR_LABELS[sensorName] ?? sensorName
  const sensorPrompt = getSensorPrompt(sensorName, promptOverrides, language)
  const knownUrls = buildUrlPool(items)
  const m = msg(language)

  let messages: ChatMessage[]

  if (items.length <= CHUNK_SIZE) {
    // Single-pass: small enough for one LLM call
    const itemsText = items.map(formatItem).join('\n\n')
    messages = [
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: m.singlePass(label, items.length, itemsText) },
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
        { role: 'system', content: getChunkExtractPrompt(language) },
        { role: 'user', content: m.chunkUser(label, i + 1, chunks.length, chunk.length, chunkText) },
      ], llmConfig, signal).then(result => {
        chunksCompleted++
        onChunkProgress?.(chunks.length, chunksCompleted)
        return result
      })
    })
    const extractions = await Promise.all(extractionPromises)

    // Reduce phase: synthesize all extractions with the per-sensor prompt
    const mergedExtractions = extractions
      .map((ext, i) => `${m.batchLabel(i + 1)} ${ext}`)
      .join('\n\n')
    messages = [
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: m.reduceUser(items.length, label, chunks.length, mergedExtractions) },
    ]
  }

  // Use retry-with-verification for the final synthesis call
  // Pool-only: all valid URLs come from the source items — reject hallucinated URLs
  const parsed = await summarizeWithVerification({
    messages,
    llmConfig,
    parseFn: parseSensorJson,
    knownUrls,
    poolOnly: true,
    extractRefs: (p) => p.items.map(it => ({ title: it.title, url: it.url })),
    applyVerified: (p, refs) => {
      const refMap = new Map(refs.map(r => [r.url, r.verified]))
      return {
        ...p,
        items: p.items.map(it => ({ ...it, verified: refMap.get(it.url) ?? null })),
      }
    },
    signal,
    onRetry: onVerifyRetry,
    onToken,
  })

  // Correct LLM-generated titles with original verbatim titles from source items.
  // The LLM sometimes rewrites or fabricates titles even when instructed not to.
  // However, when the target language differs from the source title's language,
  // keep the LLM's translated title — the prompt instructed it to translate.
  const originalTitles = new Map(items.filter(i => i.url).map(i => [i.url, i.title]))
  const correctedItems = parsed.items.map(it => {
    const original = originalTitles.get(it.url)
    if (!original) return it
    // If source title is already in the target language, prefer the original
    const sourceIsCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(original)
    const targetIsCjk = language === 'zh'
    if (sourceIsCjk === targetIsCjk) return { ...it, title: original }
    // Languages differ — keep LLM's translated title
    return it
  })

  return {
    sensor_name: sensorName,
    label,
    source_url: SOURCE_URLS[sensorName] ?? '',
    summary: parsed.summary,
    brief_summary: parsed.brief_summary || '',
    item_count: items.length,
    items: correctedItems,
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
    onToken,
    language,
    skipOverall = false,
  } = options

  const semaphore = new Semaphore(concurrency)
  const sensorGroups = groupBySensor(report)
  const sections: SensorSummary[] = []
  const m = msg(language)

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
        if (items.length === 0) {
          const label = SENSOR_LABELS[sensorName] ?? sensorName
          await onProgress?.(sensorName, label, 'ok', null)
          return null
        }

        const label = SENSOR_LABELS[sensorName] ?? sensorName

        // Check per-sensor cache unless skipCache is set
        if (!skipCache) {
          const contentHash = computeContentHash(items)
          const cached = await readSensorSummary(sensorName, language)
          if (cached && cached.content_hash === contentHash && cached.language === language) {
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
            (attempt, maxRetries, failures) => onProgress?.(sensorName, label, 'running', null, undefined, { attempt, maxRetries, failures }),
            onToken ? (token) => onToken(sensorName, token) : undefined,
            language,
          )
          if (signal?.aborted) return null
          if (result) {
            // Cache the per-sensor summary for future regeneration
            const contentHash = computeContentHash(items)
            await writeSensorSummary(sensorName, contentHash, result, language).catch(() => {})
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

  // Skip overall if requested (used by pause-before-overall to defer generation)
  if (skipOverall) {
    return buildPartialResult(report, sections)
  }

  const overall = await generateOverallBriefing(report, sections, options)

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
    overall: { executive_summary: '', sections: [], sentiment: { ...EMPTY_SENTIMENT } },
  }
}

/**
 * Generate the overall briefing from existing per-sensor sections.
 * Extracted so the orchestrator can call it independently after the pause loop resolves.
 */
export async function generateOverallBriefing(
  report: IntelReport,
  sections: SensorSummary[],
  options: SummarizeOptions,
): Promise<ReturnType<typeof parseOverallJson> & { sources?: BriefingSource[] }> {
  const { llmConfig, overallPromptOverride, signal, onProgress, onToken, language } = options
  const m = msg(language)

  await onProgress?.('__overall__', 'Overall', 'running', null)

  // Build global source list from all verified per-sensor Notable items
  const globalSources: BriefingSource[] = []
  for (const s of sections) {
    for (const item of s.items) {
      if (item.verified === false) continue
      globalSources.push({
        id: globalSources.length + 1,
        title: item.title,
        url: item.url,
        sensor: s.label,
        brief: item.brief || undefined,
      })
    }
  }

  // Format context: numbered source list + per-sensor trend summaries
  // NOTE: briefs are intentionally excluded from the source list context.
  // Per-sensor briefs are unreliable — the LLM often generates trend-level
  // observations rather than item-specific descriptions, causing the overall
  // LLM to misinterpret and miscategorize items. The overall LLM already has
  // titles + sensor names + per-sensor trend summaries, which is sufficient.
  const sourceList = globalSources.length > 0
    ? m.sourceListHeader + globalSources.map(s =>
        `[${s.id}] "${s.title}" — ${s.sensor}`
      ).join('\n')
    : ''

  const sensorSummaries = sections.length > 0
    ? m.sensorSummariesHeader + sections.map(s =>
        `### ${s.label} (${s.item_count} items)\n${s.summary}`
      ).join('\n\n')
    : ''

  // Aggregate per-item sentiment stats from local classifier to ground briefing analysis
  const allItems = Object.values(report.items).flat()
  const sentimentStats = aggregateSentiment(allItems)

  const overallContext = [
    sourceList,
    sensorSummaries,
    sentimentStats,
  ].filter(Boolean).join('\n\n') || 'No data was collected in this run.'

  const overallMessages: ChatMessage[] = [
    { role: 'system', content: getOverallPrompt(overallPromptOverride, language) },
    { role: 'user', content: m.overallUser(overallContext) },
  ]

  const MAX_OVERALL_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_OVERALL_ATTEMPTS; attempt++) {
    try {
      const onTokenOverall = onToken ? (token: string) => onToken('__overall__', token) : undefined
      let rawOverall: string
      if (onTokenOverall) {
        rawOverall = await chatCompletionStream(overallMessages, llmConfig, {
          onToken: onTokenOverall, signal, timeoutMs: 600_000,
        }).fullText
      } else {
        rawOverall = await chatCompletion(overallMessages, llmConfig, signal, 600_000)
      }
      const { parsed, ...overall } = parseOverallJson(rawOverall)

      // Retry when the LLM returned valid JSON but executive_summary is empty
      // (hollow response). Don't retry plain-text fallback — content is preserved.
      if (parsed && !overall.executive_summary && attempt < MAX_OVERALL_ATTEMPTS) {
        console.warn(`[overall-briefing] Attempt ${attempt}/${MAX_OVERALL_ATTEMPTS} parsed but executive_summary empty, retrying…`)
        continue
      }

      overall.sources = globalSources

      // Post-hoc citation attribution
      const cheapConfig: LlmConfig = options.attributionLlmConfig ?? llmConfig
      await attributeCitations(overall, globalSources, sections, llmConfig, cheapConfig, signal, language)

      if (parsed && overall.executive_summary) {
        await onProgress?.('__overall__', 'Overall', 'ok', null)
      } else {
        const reason = parsed ? 'LLM returned empty executive_summary' : 'LLM response was not valid JSON'
        console.warn(`[overall-briefing] ${reason}`)
        await onProgress?.('__overall__', 'Overall', 'failed', reason)
      }
      return overall
    } catch (err) {
      if (attempt < MAX_OVERALL_ATTEMPTS) {
        console.warn(`[overall-briefing] Attempt ${attempt}/${MAX_OVERALL_ATTEMPTS} threw error, retrying…`, (err as Error).message)
        continue
      }
      await onProgress?.('__overall__', 'Overall', 'failed', (err as Error).message)
      return { executive_summary: '', sections: [], sentiment: { ...EMPTY_SENTIMENT } }
    }
  }

  // Unreachable but satisfies TypeScript
  await onProgress?.('__overall__', 'Overall', 'failed', 'Retry loop exhausted')
  return { executive_summary: '', sections: [], sentiment: { ...EMPTY_SENTIMENT } }
}

/**
 * Summarize a single sensor's items. Used during pause-before-overall for retrying
 * individual sensors without re-running the full summarization engine.
 * Returns null if the sensor has no items or summarization fails.
 */
export async function summarizeSingleSensor(
  report: IntelReport,
  sensorName: string,
  options: SummarizeOptions,
): Promise<SensorSummary | null> {
  const { llmConfig, promptOverrides, signal, onProgress, onToken, language } = options
  const sensorGroups = groupBySensor(report)
  const items = sensorGroups.get(sensorName)
  if (!items || items.length === 0) return null

  const label = SENSOR_LABELS[sensorName] ?? sensorName
  await onProgress?.(sensorName, label, 'running', null)

  try {
    const result = await summarizeSensor(
      sensorName, items, llmConfig, promptOverrides,
      (total, done) => onProgress?.(sensorName, label, 'running', null, { total, done }),
      signal,
      (attempt, maxRetries, failures) => onProgress?.(sensorName, label, 'running', null, undefined, { attempt, maxRetries, failures }),
      onToken ? (token) => onToken(sensorName, token) : undefined,
      language,
    )
    if (signal?.aborted) return null
    if (result) {
      const contentHash = computeContentHash(items)
      await writeSensorSummary(sensorName, contentHash, result, language).catch(() => {})
    }
    await onProgress?.(sensorName, label, 'ok', null)
    return result
  } catch (err) {
    if (signal?.aborted) return null
    const message = err instanceof Error ? err.message : String(err)
    await onProgress?.(sensorName, label, 'failed', message)
    return null
  }
}

async function attributeCitations(
  overall: ReturnType<typeof parseOverallJson>,
  globalSources: BriefingSource[],
  sections: SensorSummary[],
  strongConfig: LlmConfig,
  cheapConfig: LlmConfig,
  signal?: AbortSignal,
  language?: SummaryLanguage,
): Promise<void> {
  if (globalSources.length === 0) return

  const validIds = new Set(globalSources.map(s => s.id))
  const attrSystemPrompt = getAttributionSystemPrompt(language)

  // Build lookup: sensor label → source items for that sensor
  const sensorSourceMap = new Map<string, BriefingSource[]>()
  for (const src of globalSources) {
    const existing = sensorSourceMap.get(src.sensor) ?? []
    existing.push(src)
    sensorSourceMap.set(src.sensor, existing)
  }

  const promises: Promise<void>[] = []

  // Section entry attribution — cheap model, parallel per section
  for (const section of overall.sections) {
    if (section.entries.length === 0) continue

    // Collect sources from sensors mentioned in this section's entries
    const sectionSources: BriefingSource[] = []
    const seenIds = new Set<number>()
    for (const entry of section.entries) {
      for (const s of (sensorSourceMap.get(entry.source) ?? [])) {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id)
          sectionSources.push(s)
        }
      }
    }
    const pool = sectionSources.length > 0 ? sectionSources : globalSources

    promises.push(
      chatCompletion([
        { role: 'system', content: attrSystemPrompt },
        { role: 'user', content: buildSectionAttributionPrompt(section.entries, pool, language) },
      ], cheapConfig, signal).then(raw => {
        const attributed = parseSectionAttributionResult(raw, section.entries.length)
        if (attributed) {
          for (let i = 0; i < section.entries.length; i++) {
            section.entries[i].text = stripInvalidMarkers(attributed[i], validIds)
          }
        }
      }).catch(() => { /* graceful degradation */ }),
    )
  }

  // Executive summary attribution — strong model
  if (overall.executive_summary) {
    promises.push(
      chatCompletion([
        { role: 'system', content: attrSystemPrompt },
        { role: 'user', content: buildExecSummaryAttributionPrompt(overall.executive_summary, globalSources, language) },
      ], strongConfig, signal).then(raw => {
        overall.executive_summary = stripInvalidMarkers(parseTextAttributionResult(raw), validIds)
      }).catch(() => { /* graceful degradation */ }),
    )
  }

  // Sentiment attribution — strong model
  const hasSentiment = overall.sentiment.controversies.length > 0
    || overall.sentiment.opinion_shifts.length > 0
    || overall.sentiment.risk_flags.length > 0

  if (hasSentiment) {
    promises.push(
      chatCompletion([
        { role: 'system', content: attrSystemPrompt },
        { role: 'user', content: buildSentimentAttributionPrompt(
          overall.sentiment.controversies,
          overall.sentiment.opinion_shifts,
          overall.sentiment.risk_flags,
          globalSources,
          language,
        ) },
      ], strongConfig, signal).then(raw => {
        const attributed = parseSentimentAttributionResult(raw)
        if (attributed) {
          for (let i = 0; i < Math.min(overall.sentiment.controversies.length, attributed.controversies.length); i++) {
            overall.sentiment.controversies[i].analysis = stripInvalidMarkers(attributed.controversies[i].analysis, validIds)
          }
          for (let i = 0; i < Math.min(overall.sentiment.opinion_shifts.length, attributed.opinion_shifts.length); i++) {
            overall.sentiment.opinion_shifts[i].analysis = stripInvalidMarkers(attributed.opinion_shifts[i].analysis, validIds)
          }
          for (let i = 0; i < Math.min(overall.sentiment.risk_flags.length, attributed.risk_flags.length); i++) {
            overall.sentiment.risk_flags[i].analysis = stripInvalidMarkers(attributed.risk_flags[i].analysis, validIds)
          }
        }
      }).catch(() => { /* graceful degradation */ }),
    )
  }

  await Promise.all(promises)
}
