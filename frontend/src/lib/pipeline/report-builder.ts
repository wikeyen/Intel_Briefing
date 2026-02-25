// ABOUTME: Assembles a pipeline report from raw sensor results — dedup, filter, post-process, cache.
// ABOUTME: Extracted from orchestrator.ts to isolate report assembly from pipeline coordination.
import type {
  ConfigSettings,
  IntelItem,
  IntelReport,
  SensorResult,
  CategoryKey,
} from '../models'
import { createReport, sensorResultSucceeded, emptyItemsMap } from '../models'
import { dedupItems, dedupAcrossSections } from './dedup'
import { verifyLink } from '../utils/verifier'
import { fetchContent } from '../utils/jina-reader'
import { decodeItemEntities } from '../utils/decode-entities'
import { suppressItems, boostItems } from './keyword-filter'
import { readReport, writeReport } from './cache'
import { SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import type { LlmConfig } from '../summary/llm'
import { enrichSentiment } from './sentiment'

export interface AssembleReportOptions {
  llmConfig?: LlmConfig | null
  signal?: AbortSignal
  /** When set, merge results into the existing cached report instead of replacing it. */
  sensorFilter?: string[]
  /** Pre-computed per-sensor fetch timestamps (for cached sensors that weren't re-fetched). */
  sensorTimestamps?: Record<string, string>
}

/**
 * Assemble a report from sensor results: dedup, filter, post-process, then write to cache.
 */
export async function assembleReport(
  results: SensorResult[],
  config: ConfigSettings,
  opts?: AssembleReportOptions,
): Promise<IntelReport> {
  // Apply per-sensor lookback time filtering
  for (const result of results) {
    if (!sensorResultSucceeded(result)) continue
    const lookbackHours = config.sensor_lookback_hours?.[result.sensor_name]
    if (!lookbackHours) continue
    const cutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000
    const cutoffDayStr = new Date(cutoffMs).toISOString().slice(0, 10)
    result.items = result.items.filter((item) => {
      if (!item.published_at) return true
      // Date-only timestamps (YYYY-MM-DD): compare at day granularity
      if (item.published_at.length <= 10) return item.published_at >= cutoffDayStr
      // Full timestamps: compare at ms precision
      const pubMs = new Date(item.published_at).getTime()
      return !isNaN(pubMs) && pubMs >= cutoffMs
    })
  }

  // Assemble sections
  const sections = emptyItemsMap()
  const sourcesOk: string[] = []
  const sourcesFailed: string[] = []

  for (const result of results) {
    if (sensorResultSucceeded(result)) {
      sourcesOk.push(result.sensor_name)
      const section = SENSOR_CATEGORY_MAP[result.sensor_name] ?? 'tech'
      sections[section].push(...result.items)
    } else {
      sourcesFailed.push(result.sensor_name)
    }
  }

  // Deduplicate within each section
  for (const key of Object.keys(sections) as CategoryKey[]) {
    sections[key] = dedupItems(sections[key])
  }

  // Deduplicate within the social section (accounts take priority over topics/trends)
  const dedupedSections = dedupAcrossSections(sections)

  // Decode HTML entities in all text fields
  for (const key of Object.keys(dedupedSections) as CategoryKey[]) {
    for (const item of dedupedSections[key]) {
      decodeItemEntities(item as unknown as Record<string, unknown>)
    }
  }

  // Sentiment enrichment: classify social items via LLM
  const allItems = Object.values(dedupedSections).flat()
  try {
    await enrichSentiment(allItems, opts?.llmConfig, opts?.signal)
  } catch (err) {
    console.error('Sentiment enrichment failed (non-fatal):', err)
  }

  // Keyword filtering: suppress matching items, boost matching items to the top
  for (const key of Object.keys(dedupedSections) as CategoryKey[]) {
    dedupedSections[key] = suppressItems(dedupedSections[key], config.suppress_keywords ?? [])
    dedupedSections[key] = boostItems(dedupedSections[key], config.boost_keywords ?? [])
  }

  // Post-processing: verify links + enrich content (hn_blogs) — concurrent
  const postProcessTasks: Promise<void>[] = []
  for (const key of Object.keys(dedupedSections) as CategoryKey[]) {
    for (const item of dedupedSections[key]) {
      if (item.source === 'x' && item.url) {
        postProcessTasks.push(
          verifyLink(item.url).then(ok => { item.verified = ok }),
        )
      }
      if (item.source === 'hn_blogs' && item.url) {
        postProcessTasks.push(
          fetchContent(item.url).then(text => {
            if (text) item.content = text
          }),
        )
      }
    }
  }
  await Promise.allSettled(postProcessTasks)

  const now = new Date()
  const nowIso = now.toISOString().replace(/\.\d+Z$/, 'Z')

  // Build per-sensor fetch timestamps: use pre-computed ones for cached sensors, "now" for fresh
  const fetchedAt: Record<string, string> = {}
  for (const name of sourcesOk) {
    fetchedAt[name] = opts?.sensorTimestamps?.[name] ?? nowIso
  }

  // Report-level fetched_at: most recent sensor timestamp (could be "now" for fresh, or earlier for all-cached)
  const allTimestamps = Object.values(fetchedAt)
  const reportFetchedAt = allTimestamps.length > 0
    ? allTimestamps.reduce((latest, ts) => ts > latest ? ts : latest)
    : nowIso

  const newReport = createReport({
    date: now.toISOString().slice(0, 10),
    fetched_at: reportFetchedAt,
    stale: false,
    sources_ok: sourcesOk.sort(),
    sources_failed: sourcesFailed.sort(),
    items: dedupedSections as Record<CategoryKey, IntelItem[]>,
    sources_fetched_at: fetchedAt,
  })

  // Partial run: merge new results into the existing cached report
  const sensorFilter = opts?.sensorFilter
  let report = newReport
  if (sensorFilter?.length) {
    const existing = await readReport().catch(() => null)
    if (existing) {
      report = mergePartialReport(existing, newReport, sensorFilter)
    }
  }

  // Write to cache
  try {
    await writeReport(report)
  } catch (err) {
    console.error('Failed to write report cache:', err)
  }

  return report
}

/**
 * Merge a partial pipeline run into an existing report.
 * Keeps items from sensors NOT in the run, replaces items from sensors that ARE in the run.
 */
function mergePartialReport(
  existing: IntelReport,
  partial: IntelReport,
  sensorsInRun: string[],
): IntelReport {
  const runSet = new Set(sensorsInRun)

  // Merge items: keep existing items from sensors NOT in this run
  const merged = emptyItemsMap()
  for (const key of Object.keys(existing.items) as CategoryKey[]) {
    const kept = (existing.items[key] ?? []).filter(item => !runSet.has(item.source))
    merged[key] = kept
  }
  // Add all items from the new partial report
  for (const key of Object.keys(partial.items) as CategoryKey[]) {
    merged[key].push(...(partial.items[key] ?? []))
  }

  // Merge sources_ok / sources_failed: remove run sensors from existing lists, add new ones
  const existingOk = existing.sources_ok.filter(s => !runSet.has(s))
  const existingFailed = existing.sources_failed.filter(s => !runSet.has(s))

  // Merge sources_fetched_at: keep existing timestamps, overlay new ones
  const mergedFetchedAt: Record<string, string> = {
    ...(existing.sources_fetched_at ?? {}),
    ...(partial.sources_fetched_at ?? {}),
  }

  return createReport({
    date: partial.date,
    fetched_at: partial.fetched_at,
    stale: false,
    sources_ok: [...existingOk, ...partial.sources_ok].sort(),
    sources_failed: [...existingFailed, ...partial.sources_failed].sort(),
    items: merged,
    sources_fetched_at: mergedFetchedAt,
  })
}
