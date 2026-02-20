// ABOUTME: Pipeline orchestrator — coordinates sensor fetch+summarize through staged execution.
// ABOUTME: Uses separate semaphores per stage; failed fetches are excluded from the summary stage.
import type {
  ConfigSettings,
  IntelItem,
  IntelReport,
  SensorResult,
  RunMode,
  BriefingSummary,
  SensorSummary,
} from '../models'
import { sensorResultSucceeded, sensorLimit, SOURCE_URLS } from '../models'
import { Semaphore } from './semaphore'
import { PipelineProgressTracker } from './progress'
import { readReport, writePipelineStatus } from './cache'
import { writeSummary } from '../summary/cache'
import { chatCompletion, type LlmConfig, type ChatMessage } from '../summary/llm'
import { SENSOR_REGISTRY } from '../sensors'
import { SensorConfigError } from '../sensors/errors'
import { SENSOR_LABELS } from '../sensors/taxonomy'
import { assembleReport } from './report-builder'
import { getSensorPrompt, getOverallPrompt, CHUNK_SIZE, CHUNK_EXTRACT_PROMPT } from '../summary/prompts'
import { parseSensorJson, parseOverallJson } from '../summary/parse-json'

export interface PipelineResult {
  report: IntelReport | null
  summary: BriefingSummary | null
}

/** Format an IntelItem into a text block for the LLM prompt. */
function formatItem(item: IntelItem): string {
  const parts = [`- ${item.title}`]
  if (item.url) parts.push(`  URL: ${item.url}`)
  if (item.abstract) parts.push(`  Abstract: ${item.abstract.slice(0, 400)}`)
  if (item.content) parts.push(`  Content: ${item.content.slice(0, 500)}`)
  if (item.heat) parts.push(`  Heat: ${item.heat}`)
  if (item.account) parts.push(`  Account: ${item.account}`)
  return parts.join('\n')
}

/**
 * Run a single sensor's fetch function and return a SensorResult.
 * Catches all errors so one failing sensor never blocks the pipeline.
 */
async function fetchSensor(
  name: string,
  config: ConfigSettings,
): Promise<SensorResult> {
  const fetchFn = SENSOR_REGISTRY[name]
  if (!fetchFn) {
    return { sensor_name: name, items: [], error: `Unknown sensor: ${name}`, error_kind: 'config' }
  }
  const limit = sensorLimit(config, name)
  try {
    const items = await fetchFn(config, limit)
    return { sensor_name: name, items, error: null, error_kind: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConfig = err instanceof SensorConfigError
    return { sensor_name: name, items: [], error: message, error_kind: isConfig ? 'config' : 'api' }
  }
}

/** Group report items by their source sensor name. */
function groupBySensor(report: IntelReport): Map<string, IntelItem[]> {
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
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/** Callback to report map-reduce chunk progress. */
type ChunkProgressFn = (total: number, done: number) => void

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
  onChunkProgress?: ChunkProgressFn,
): Promise<SensorSummary | null> {
  if (items.length === 0) return null

  const label = SENSOR_LABELS[sensorName] ?? sensorName
  const sensorPrompt = getSensorPrompt(sensorName, promptOverrides)

  let summaryText: string

  if (items.length <= CHUNK_SIZE) {
    // Single-pass: small enough for one LLM call
    const itemsText = items.map(formatItem).join('\n\n')
    summaryText = await chatCompletion([
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: `综合分析以下 ${label} 的 ${items.length} 条内容：\n\n${itemsText}` },
    ], llmConfig)
  } else {
    // Map-reduce: chunk → extract signals → merge
    const chunks = chunkArray(items, CHUNK_SIZE)
    onChunkProgress?.(chunks.length, 0)

    // Map phase: extract key signals from each chunk concurrently
    let chunksCompleted = 0
    const extractionPromises = chunks.map((chunk, i) => {
      const chunkText = chunk.map(formatItem).join('\n\n')
      return chatCompletion([
        { role: 'system', content: CHUNK_EXTRACT_PROMPT },
        { role: 'user', content: `以下是 ${label} 的第 ${i + 1}/${chunks.length} 批内容（${chunk.length} 条）：\n\n${chunkText}` },
      ], llmConfig).then(result => {
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
    summaryText = await chatCompletion([
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: `以下是从 ${items.length} 条 ${label} 内容中提取的关键信号（分 ${chunks.length} 批提取）。请综合分析：\n\n${mergedExtractions}` },
    ], llmConfig)
  }

  const parsed = parseSensorJson(summaryText)
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
 * Build an LlmConfig from ConfigSettings, or return null if summary provider is not configured.
 */
function buildLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  }
}

/**
 * Run the full pipeline: fetch sensors, optionally summarize, and persist results.
 *
 * Supports three run modes:
 *   - `fetch`: Fetch from all enabled sensors, build report, skip summaries.
 *   - `summarize`: Skip fetching, load cached report, generate summaries only.
 *   - `fetch_summarize`: Fetch first, then summarize the fresh report.
 *
 * Each stage has its own Semaphore with independent concurrency limits.
 * Failed sensors in the fetch stage are excluded from the summary stage.
 * Progress is tracked via PipelineProgressTracker and persisted to the database.
 */
export async function runPipeline(
  config: ConfigSettings,
  mode: RunMode,
): Promise<PipelineResult> {
  const fetchConcurrency = config.fetch_concurrency ?? 4
  const summaryConcurrency = config.summary_concurrency ?? 4
  const fetchSemaphore = new Semaphore(fetchConcurrency)
  const summarySemaphore = new Semaphore(summaryConcurrency)

  // Identify enabled sensors from the registry
  const registrySensorNames = Object.keys(SENSOR_REGISTRY).filter(
    name => config.sensors_enabled[name] !== false,
  )

  const llmConfig = buildLlmConfig(config)
  const shouldFetch = mode === 'fetch' || mode === 'fetch_summarize'
  const shouldSummarize = mode === 'summarize' || mode === 'fetch_summarize'

  // For summarize-only mode, load the cached report up front so we can derive
  // sensor names for the tracker from the report's actual contents.
  let cachedReport: IntelReport | null = null
  if (mode === 'summarize') {
    cachedReport = await readReport()
    if (!cachedReport) {
      // No cached report — create a minimal tracker, mark complete, return empty
      const tracker = new PipelineProgressTracker([], mode, fetchConcurrency, summaryConcurrency, (status) => {
        writePipelineStatus(status).catch(() => {})
      })
      writePipelineStatus(tracker.snapshot()).catch(() => {})
      tracker.complete()
      return { report: null, summary: null }
    }
  }

  // Determine sensor names for the tracker: use registry names for fetch modes,
  // and derive from the cached report for summarize-only mode.
  const trackerSensorNames = mode === 'summarize'
    ? extractSensorNames(cachedReport!)
    : registrySensorNames

  // Create progress tracker with persistence callback
  const tracker = new PipelineProgressTracker(trackerSensorNames, mode, fetchConcurrency, summaryConcurrency, (status) => {
    writePipelineStatus(status).catch(() => {})
  })

  // Write initial status
  writePipelineStatus(tracker.snapshot()).catch(() => {})

  let report: IntelReport | null = null
  let summary: BriefingSummary | null = null

  // Track which sensors failed fetch — they are excluded from summary
  const failedSensors = new Set<string>()

  if (shouldFetch) {
    // Stage 1: Run all sensor fetches concurrently through the fetch semaphore
    const fetchPromises = registrySensorNames.map(name =>
      fetchSemaphore.run(async () => {
        tracker.setFetchState(name, 'running')
        const result = await fetchSensor(name, config)
        if (sensorResultSucceeded(result)) {
          tracker.setFetchState(name, 'ok', result.items.length)
        } else {
          tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
          failedSensors.add(name)
        }
        return result
      }),
    )

    // Wait for ALL fetches to complete before moving to summary stage
    const results = await Promise.all(fetchPromises)
    report = await assembleReport(results, config)

    // Mark failed sensors' summaries as skipped — they don't pass to the next stage
    if (shouldSummarize) {
      for (const name of failedSensors) {
        tracker.skipSummaryForSensor(name)
      }
    }
  }

  if (shouldSummarize) {
    // Use the freshly-fetched report, or the pre-loaded cached report
    const sourceReport = report ?? cachedReport
    if (!sourceReport) {
      tracker.complete()
      return { report: null, summary: null }
    }

    if (llmConfig) {
      const sensorGroups = groupBySensor(sourceReport)
      const sensorSummaries: SensorSummary[] = []

      // Per-sensor summaries — concurrent through the summary semaphore
      // Only summarize sensors that successfully fetched
      const summaryPromises = Array.from(sensorGroups.entries())
        .filter(([sensorName]) => !failedSensors.has(sensorName))
        .map(([sensorName, items]) =>
          summarySemaphore.run(async () => {
          if (items.length === 0) return null
          tracker.setSummaryState(sensorName, 'running')
          try {
            const result = await summarizeSensor(
              sensorName, items, llmConfig, config.summary_sensor_prompts,
              (total, done) => tracker.setSummaryChunks(sensorName, total, done),
            )
            tracker.setSummaryState(sensorName, 'ok')
            return result
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            tracker.setSummaryState(sensorName, 'failed', message)
            return null
          }
        }),
      )

      const summaryResults = await Promise.all(summaryPromises)
      for (const result of summaryResults) {
        if (result) sensorSummaries.push(result)
      }

      // Overall briefing summary
      tracker.setOverallSummary('running')
      const overallContext = sensorSummaries.length > 0
        ? sensorSummaries.map(s => `**${s.label}** (${s.item_count} items): ${s.summary}`).join('\n\n')
        : 'No data was collected in this run.'

      const overallMessages: ChatMessage[] = [
        { role: 'system', content: getOverallPrompt(config.summary_overall_prompt) },
        { role: 'user', content: `请根据以下各信息源摘要生成简报：\n\n${overallContext}` },
      ]

      try {
        const overallRaw = await chatCompletion(overallMessages, llmConfig)
        const overall = parseOverallJson(overallRaw)
        tracker.setOverallSummary('ok')

        summary = {
          generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
          report_fetched_at: sourceReport.fetched_at,
          sections: sensorSummaries,
          overall,
        }

        // Persist summary to cache
        try {
          await writeSummary(summary)
        } catch (err) {
          console.error('Failed to write summary cache:', err)
        }
      } catch (err) {
        tracker.setOverallSummary('failed')
        console.error('Failed to generate overall summary:', err)
      }
    }
  }

  tracker.complete()
  return { report, summary }
}

/** Extract unique sensor names from a report's items. */
function extractSensorNames(report: IntelReport): string[] {
  const names = new Set<string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      names.add(item.source)
    }
  }
  return Array.from(names)
}
