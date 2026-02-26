// ABOUTME: Extracted helper functions for the pipeline state machine — sensor fetch, LLM config, retry, merge.
// ABOUTME: Pure functions and utilities shared across state handlers; no orchestration logic.

import type { ConfigSettings, IntelReport, SensorResult, SensorSummary, BriefingSummary, SummaryLanguage } from '../models'
import { sensorResultSucceeded, sensorLimit } from '../models'
import type { LlmConfig } from '../summary/llm'
import { SENSOR_REGISTRY } from '../sensors'
import { SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import type { CategoryKey } from '../sensors/taxonomy'
import { SensorConfigError } from '../sensors/errors'
import { summarizeSingleSensor } from '../summary/summarizer'
import type { SummarizeOptions } from '../summary/summarizer'
import { writeReport } from './cache'
import { runIntelligenceAnalysis } from './intelligence'
import { writeIntelligence } from './intelligence-cache'
import type { PipelineProgressTracker } from './progress'
import type { PipelineContext, FailureKind } from './types'

export const MAX_AUTO_RETRIES = 3

/**
 * Run a single sensor's fetch function and return a SensorResult.
 * Catches all errors so one failing sensor never blocks the pipeline.
 */
export async function fetchSensor(
  name: string,
  config: ConfigSettings,
  onProgress?: (detail: string, itemCount?: number) => void,
): Promise<SensorResult> {
  const fetchFn = SENSOR_REGISTRY[name]
  if (!fetchFn) {
    return { sensor_name: name, items: [], error: `Unknown sensor: ${name}`, error_kind: 'config' }
  }
  const limit = sensorLimit(config, name)
  try {
    const items = await fetchFn(config, limit, onProgress)
    return { sensor_name: name, items, error: null, error_kind: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConfig = err instanceof SensorConfigError
    return { sensor_name: name, items: [], error: message, error_kind: isConfig ? 'config' : 'api' }
  }
}

/**
 * Build an LlmConfig from ConfigSettings, or return null if summary provider is not configured.
 */
export function buildLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  }
}

/**
 * Build an LlmConfig for attribution calls from ConfigSettings, or return null if not configured.
 * When set, the summarizer can use a cheaper/faster model for source-attribution passes.
 */
export function buildAttributionLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  if (!config.summary_attribution_model) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_attribution_model,
  }
}

/**
 * Merge a retry result into the existing report: remove old items by source, insert new ones.
 * Uses the sensor taxonomy to place items in the correct category section.
 * Mutates the report in place.
 */
export function mergeRetryResult(report: IntelReport, result: SensorResult): void {
  for (const section of Object.values(report.items)) {
    // Remove old items from this sensor
    for (let i = section.length - 1; i >= 0; i--) {
      if (section[i].source === result.sensor_name) {
        section.splice(i, 1)
      }
    }
  }
  // Insert new items into the correct category section using the taxonomy map
  const category = SENSOR_CATEGORY_MAP[result.sensor_name] as CategoryKey | undefined
  for (const item of result.items) {
    // Use the sensor's taxonomy category, falling back to the first non-empty section
    const targetSection = category ? report.items[category] : undefined
    if (targetSection) {
      targetSection.push(item)
    } else {
      // Fallback: place in the first section that exists
      const sections = Object.values(report.items)
      if (sections.length > 0) {
        sections[0].push(item)
      }
    }
  }
}

/**
 * Merge a single sensor's summary into the existing BriefingSummary.
 * Replaces the matching section by sensor_name, or appends if new.
 */
export function mergeSensorSummary(summary: BriefingSummary, sensorSummary: SensorSummary): void {
  const idx = summary.sections.findIndex(s => s.sensor_name === sensorSummary.sensor_name)
  if (idx >= 0) {
    summary.sections[idx] = sensorSummary
  } else {
    summary.sections.push(sensorSummary)
  }
}

/** Extract unique sensor names from a report's items. */
export function extractSensorNames(report: IntelReport): string[] {
  const names = new Set<string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      names.add(item.source)
    }
  }
  return Array.from(names)
}

/**
 * Retry a single failed sensor: re-fetch (for api failures) or just re-summarize (for summary failures).
 * Returns true if the sensor now succeeds, false otherwise.
 * Mutates ctx.report, ctx.summary, and ctx.failures as side effects.
 */
export async function retryOneSensor(ctx: PipelineContext, sensorName: string): Promise<boolean> {
  const { tracker, config, signal } = ctx
  const failureKind = ctx.failureKinds.get(sensorName)

  tracker.resetFetchState(sensorName)
  tracker.resetSummaryState(sensorName)

  // Summary-only failure: skip re-fetch, just re-summarize
  if (failureKind === 'summary') {
    tracker.setFetchState(sensorName, 'ok')
    tracker.addEvent('info', 'retry', `Re-summarizing (fetch was OK)`, sensorName)

    if (!ctx.report || !ctx.baseSummarizeOpts) return false

    const sensorSummary = await summarizeSingleSensor(ctx.report, sensorName, {
      ...(ctx.baseSummarizeOpts as SummarizeOptions),
      skipCache: true,
    })

    if (signal.aborted) return false

    if (sensorSummary && ctx.summary) {
      mergeSensorSummary(ctx.summary, sensorSummary)
      ctx.failures.delete(sensorName)
      ctx.failureKinds.delete(sensorName)
      tracker.setSummaryState(sensorName, 'ok')
      tracker.addEvent('ok', 'retry', `Summary retry succeeded`, sensorName)
      return true
    }

    tracker.setSummaryState(sensorName, 'failed')
    tracker.addEvent('error', 'retry', `Summary retry failed`, sensorName)
    return false
  }

  // API/config failure: re-fetch then re-summarize
  tracker.setFetchState(sensorName, 'running')

  const result = await fetchSensor(sensorName, config, (detail, itemCount) => {
    tracker.setFetchDetail(sensorName, detail, itemCount)
  })

  if (signal.aborted) return false

  if (sensorResultSucceeded(result)) {
    tracker.setFetchState(sensorName, 'ok', result.items.length)
    tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)
    ctx.failures.delete(sensorName)
    ctx.failureKinds.delete(sensorName)

    // Merge retry result into report
    if (ctx.report) {
      mergeRetryResult(ctx.report, result)
      await writeReport(ctx.report).catch(() => {})

      if (!ctx.report.sources_ok.includes(sensorName)) {
        ctx.report.sources_ok.push(sensorName)
      }
      ctx.report.sources_failed = ctx.report.sources_failed.filter(n => n !== sensorName)

      // Summarize just this sensor
      if (ctx.baseSummarizeOpts) {
        const sensorSummary = await summarizeSingleSensor(ctx.report, sensorName, {
          ...(ctx.baseSummarizeOpts as SummarizeOptions),
          skipCache: true,
        })

        if (sensorSummary && ctx.summary) {
          mergeSensorSummary(ctx.summary, sensorSummary)
        }
      }
    }

    return true
  }

  tracker.setFetchState(sensorName, 'failed', 0, result.error, result.error_kind ?? 'api')
  tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', sensorName)
  return false
}

/**
 * Run intelligence analysis and persist results. Logs events to the tracker.
 * Deduplicated from the two identical blocks in the orchestrator (with/without summary stage).
 */
export async function runIntelligence(
  report: IntelReport,
  llmConfig: LlmConfig,
  signal: AbortSignal | undefined,
  language: SummaryLanguage | undefined,
  tracker: PipelineProgressTracker,
): Promise<void> {
  tracker.addEvent('info', 'intelligence', 'Intelligence analysis started')
  try {
    const intelligence = await runIntelligenceAnalysis(report, llmConfig, signal, language)

    if (intelligence.trend === null) tracker.addEvent('warn', 'intelligence', 'Trend analysis returned no results')
    if (intelligence.topics === null) tracker.addEvent('warn', 'intelligence', 'Topic analysis returned no results')
    if (intelligence.accounts === null) tracker.addEvent('warn', 'intelligence', 'Account analysis returned no results')

    const hasData = intelligence.trend !== null || intelligence.topics !== null || intelligence.accounts !== null
    if (hasData) {
      await writeIntelligence(intelligence)
      tracker.addEvent('ok', 'intelligence', 'Intelligence analysis complete')
    } else {
      tracker.addEvent('warn', 'intelligence', 'Intelligence analysis produced no results (LLM may have failed)')
    }
  } catch (err) {
    console.error('Intelligence analysis failed:', err)
    tracker.addEvent('warn', 'intelligence', `Intelligence analysis failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
