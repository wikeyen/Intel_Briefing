// ABOUTME: Summarizer orchestrator — produces per-sensor summaries and an overall briefing.
// ABOUTME: Takes an IntelReport and LLM config, calls LLM sequentially for each sensor.
import { chatCompletion, type LlmConfig, type ChatMessage } from './llm'
import type { IntelReport, IntelItem, BriefingSummary, SensorSummary } from '../models'

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

const SYSTEM_PROMPT = 'You are an intel analyst writing concise briefings. Summarize the key themes, notable items, and emerging trends. Be specific — cite names, numbers, and links where relevant. Keep each summary to 2-4 sentences.'

const OVERALL_SYSTEM_PROMPT = 'You are an intel analyst writing an executive briefing. Synthesize the per-source summaries into a coherent overview of the most important developments. Highlight cross-cutting themes. Keep it to 3-6 sentences.'

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

/**
 * Summarize an IntelReport by calling the LLM for each sensor, then once for the overall briefing.
 * Calls are sequential to respect rate limits.
 */
export async function summarizeReport(
  report: IntelReport,
  llmConfig: LlmConfig,
): Promise<BriefingSummary> {
  const sensorGroups = groupBySensor(report)
  const sections: SensorSummary[] = []

  // Per-sensor summaries (sequential)
  for (const [sensorName, items] of sensorGroups) {
    if (items.length === 0) continue

    const label = SENSOR_LABELS[sensorName] ?? sensorName
    const itemsText = items.map(formatItem).join('\n\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Summarize these ${items.length} items from ${label}:\n\n${itemsText}` },
    ]

    const summary = await chatCompletion(messages, llmConfig)
    sections.push({ sensor_name: sensorName, label, summary, item_count: items.length })
  }

  // Overall briefing
  const overallContext = sections.length > 0
    ? sections.map(s => `**${s.label}** (${s.item_count} items): ${s.summary}`).join('\n\n')
    : 'No data was collected in this run.'

  const overallMessages: ChatMessage[] = [
    { role: 'system', content: OVERALL_SYSTEM_PROMPT },
    { role: 'user', content: `Write an executive briefing based on these source summaries:\n\n${overallContext}` },
  ]

  const overall = await chatCompletion(overallMessages, llmConfig)

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    report_fetched_at: report.fetched_at,
    sections,
    overall,
  }
}
