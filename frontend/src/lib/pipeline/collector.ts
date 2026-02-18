// ABOUTME: Parallel sensor fetch coordinator for Intel Briefing.
// ABOUTME: Runs all enabled sensors concurrently, collects results, and writes the Redis cache.
import type {
  ConfigSettings,
  IntelItem,
  IntelReport,
  SensorResult,
  SectionKey,
} from '../models'
import { createReport, sensorResultSucceeded, emptyItemsMap, sensorLimit } from '../models'
import { dedupItems, dedupAcrossSections } from './dedup'
import { writeReport } from './cache'
import { SENSOR_REGISTRY } from '../sensors'

// Section routing: maps sensor_name to report section key
const SENSOR_SECTION_MAP: Record<string, SectionKey> = {
  hacker_news: 'tech_trends',
  github: 'tech_trends',
  grok: 'tech_trends',
  arxiv: 'research',
  hn_blogs: 'insights',
  product_hunt: 'products',
  v2ex: 'community',
  sources_36kr: 'capital_flow',
  wallstreetcn: 'capital_flow',
  politics: 'politics',
  topics: 'topics',
}

type ProgressCallback = (
  sensorName: string,
  state: string,
  itemCount: number,
  error: string | null,
) => void | Promise<void>

/**
 * Run a single sensor's fetch function and return a SensorResult.
 */
async function runSensor(
  sensorName: string,
  fetchFn: (config: ConfigSettings, limit: number) => Promise<IntelItem[]>,
  config: ConfigSettings,
  limit: number,
): Promise<SensorResult> {
  try {
    const items = await fetchFn(config, limit)
    return { sensor_name: sensorName, items, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { sensor_name: sensorName, items: [], error: message }
  }
}

/**
 * Run the full collection pipeline and return a structured IntelReport.
 *
 * Steps:
 * 1. Identify all enabled sensors.
 * 2. Fetch from all sensors concurrently with Promise.allSettled().
 * 3. Deduplicate items within each section.
 * 4. Deduplicate across politics / topics sections.
 * 5. Write the result to the Redis cache.
 */
export async function collect(
  config: ConfigSettings,
  onProgress?: ProgressCallback,
): Promise<IntelReport> {
  // Identify enabled sensors
  const enabledSensors = Object.entries(SENSOR_REGISTRY).filter(
    ([name]) => config.sensors_enabled[name] !== false,
  )

  // Mark all as running (sequential awaits to prevent write-ordering races)
  if (onProgress) {
    for (const [name] of enabledSensors) {
      await onProgress(name, 'running', 0, null)
    }
  }

  // Run all sensors concurrently, using the per-sensor limit or global default
  const promises = enabledSensors.map(([name, fetchFn]) => {
    const limit = sensorLimit(config, name)
    return runSensor(name, fetchFn, config, limit)
  })
  const settled = await Promise.allSettled(promises)

  const results: SensorResult[] = []
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value)
    } else {
      // Promise rejected (should be rare since runSensor catches errors)
      results.push({
        sensor_name: 'unknown',
        items: [],
        error: String(outcome.reason),
      })
    }
  }

  // Notify progress for each result (sequential awaits to prevent write-ordering races)
  if (onProgress) {
    for (const result of results) {
      if (sensorResultSucceeded(result)) {
        await onProgress(result.sensor_name, 'ok', result.items.length, null)
      } else {
        await onProgress(result.sensor_name, 'failed', 0, result.error)
      }
    }
  }

  // Assemble sections
  const sections = emptyItemsMap()
  const sourcesOk: string[] = []
  const sourcesFailed: string[] = []

  for (const result of results) {
    if (sensorResultSucceeded(result)) {
      sourcesOk.push(result.sensor_name)
      const section = SENSOR_SECTION_MAP[result.sensor_name] ?? 'tech_trends'
      sections[section].push(...result.items)
    } else {
      sourcesFailed.push(result.sensor_name)
    }
  }

  // Deduplicate within each section
  for (const key of Object.keys(sections) as SectionKey[]) {
    sections[key] = dedupItems(sections[key])
  }

  // Deduplicate across politics / topics
  const dedupedSections = dedupAcrossSections(sections)

  const now = new Date()
  const report = createReport({
    date: now.toISOString().slice(0, 10),
    fetched_at: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    stale: false,
    sources_ok: sourcesOk.sort(),
    sources_failed: sourcesFailed.sort(),
    items: dedupedSections as Record<SectionKey, IntelItem[]>,
  })

  // Write to Redis cache
  try {
    await writeReport(report)
  } catch (err) {
    console.error('Failed to write cache:', err)
  }

  return report
}
