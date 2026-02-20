// ABOUTME: Summarizer orchestrator — produces per-sensor summaries and an overall briefing.
// ABOUTME: Takes an IntelReport and LLM config, calls LLM sequentially for each sensor.
import { chatCompletion, type LlmConfig, type ChatMessage } from './llm'
import type { IntelReport, IntelItem, BriefingSummary, SensorSummary } from '../models'
import { SOURCE_URLS } from '../models'
import { getSensorPrompt, getOverallPrompt } from './prompts'
import { parseSensorJson, parseOverallJson } from './parse-json'

/** Human-readable sensor labels for prompts and output. */
const SENSOR_LABELS: Record<string, string> = {
  hacker_news: 'Hacker News',
  arxiv: 'ArXiv AI',
  github: 'GitHub Trending',
  product_hunt: 'Product Hunt',
  v2ex: 'V2EX',
  hn_blogs: 'HN Blogs',
  sources_36kr: '36Kr',
  wallstreetcn: 'WallStreetCN',
  social_accounts: 'Social Accounts',
  social_topics: 'Social Topics',
  social_trends: 'Social Trends',
  chrome_radar: 'Chrome Radar',
  rss_feeds: 'RSS Feeds',
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

/** Group all report items by their source sensor. */
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

export type SummaryProgressCallback = (
  sensorName: string,
  label: string,
  state: 'pending' | 'running' | 'ok' | 'failed',
  error: string | null,
) => void | Promise<void>

/**
 * Summarize an IntelReport by calling the LLM for each sensor, then once for the overall briefing.
 * Calls are sequential to respect rate limits. When onProgress is provided, per-sensor errors are
 * reported and skipped rather than thrown, allowing the pipeline to continue.
 */
export async function summarizeReport(
  report: IntelReport,
  llmConfig: LlmConfig,
  onProgress?: SummaryProgressCallback,
): Promise<BriefingSummary> {
  const sensorGroups = groupBySensor(report)
  const sections: SensorSummary[] = []

  // Per-sensor summaries (sequential)
  for (const [sensorName, items] of sensorGroups) {
    if (items.length === 0) continue

    const label = SENSOR_LABELS[sensorName] ?? sensorName
    const sensorPrompt = getSensorPrompt(sensorName)
    const itemsText = items.map(formatItem).join('\n\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: sensorPrompt },
      { role: 'user', content: `综合分析以下 ${label} 的 ${items.length} 条内容：\n\n${itemsText}` },
    ]

    await onProgress?.(sensorName, label, 'running', null)

    try {
      const raw = await chatCompletion(messages, llmConfig)
      const parsed = parseSensorJson(raw)
      sections.push({
        sensor_name: sensorName,
        label,
        source_url: SOURCE_URLS[sensorName] ?? '',
        summary: parsed.summary,
        item_count: items.length,
        items: parsed.items,
      })
      await onProgress?.(sensorName, label, 'ok', null)
    } catch (err) {
      if (onProgress) {
        await onProgress(sensorName, label, 'failed', (err as Error).message)
      } else {
        throw err
      }
    }
  }

  // Overall briefing
  const overallContext = sections.length > 0
    ? sections.map(s => `**${s.label}** (${s.item_count} items): ${s.summary}`).join('\n\n')
    : 'No data was collected in this run.'

  const overallMessages: ChatMessage[] = [
    { role: 'system', content: getOverallPrompt() },
    { role: 'user', content: `请根据以下各信息源摘要生成简报：\n\n${overallContext}` },
  ]

  await onProgress?.('__overall__', 'Overall', 'running', null)

  const overallRaw = await chatCompletion(overallMessages, llmConfig)
  const overall = parseOverallJson(overallRaw)

  await onProgress?.('__overall__', 'Overall', 'ok', null)

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    report_fetched_at: report.fetched_at,
    sections,
    overall,
  }
}
