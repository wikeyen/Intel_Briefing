// ABOUTME: Assembles a pipeline report from raw sensor results — dedup, filter, post-process, cache.
// ABOUTME: Extracted from orchestrator.ts to isolate report assembly from pipeline coordination.
import type {
  ConfigSettings,
  IntelItem,
  IntelReport,
  SensorResult,
  SectionKey,
} from '../models'
import { createReport, sensorResultSucceeded, emptyItemsMap } from '../models'
import { dedupItems, dedupAcrossSections } from './dedup'
import { verifyLink } from '../utils/verifier'
import { fetchContent } from '../utils/jina-reader'
import { decodeItemEntities } from '../utils/decode-entities'
import { suppressItems, boostItems } from './keyword-filter'
import { writeReport } from './cache'
import { SENSOR_SECTION_MAP } from './sensor-map'

/**
 * Assemble a report from sensor results: dedup, filter, post-process, then write to cache.
 */
export async function assembleReport(
  results: SensorResult[],
  config: ConfigSettings,
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
      const section = SENSOR_SECTION_MAP[result.sensor_name] ?? 'tech'
      sections[section].push(...result.items)
    } else {
      sourcesFailed.push(result.sensor_name)
    }
  }

  // Deduplicate within each section
  for (const key of Object.keys(sections) as SectionKey[]) {
    sections[key] = dedupItems(sections[key])
  }

  // Deduplicate within the social section (accounts take priority over topics/trends)
  const dedupedSections = dedupAcrossSections(sections)

  // Decode HTML entities in all text fields
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    for (const item of dedupedSections[key]) {
      decodeItemEntities(item as unknown as Record<string, unknown>)
    }
  }

  // Keyword filtering: suppress matching items, boost matching items to the top
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
    dedupedSections[key] = suppressItems(dedupedSections[key], config.suppress_keywords ?? [])
    dedupedSections[key] = boostItems(dedupedSections[key], config.boost_keywords ?? [])
  }

  // Post-processing: verify links (Grok items) + enrich content (hn_blogs) — concurrent
  const postProcessTasks: Promise<void>[] = []
  for (const key of Object.keys(dedupedSections) as SectionKey[]) {
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
  const report = createReport({
    date: now.toISOString().slice(0, 10),
    fetched_at: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    stale: false,
    sources_ok: sourcesOk.sort(),
    sources_failed: sourcesFailed.sort(),
    items: dedupedSections as Record<SectionKey, IntelItem[]>,
  })

  // Write to cache
  try {
    await writeReport(report)
  } catch (err) {
    console.error('Failed to write report cache:', err)
  }

  return report
}
