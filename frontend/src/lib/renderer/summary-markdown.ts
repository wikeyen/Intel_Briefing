// ABOUTME: Pure Markdown renderer for AI-generated BriefingSummary objects.
// ABOUTME: Used by API callers that want a ready-to-forward briefing body.
import type { BriefingEntry, BriefingRef, BriefingSummary, SentimentAnalysis } from '../models'

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function renderRefs(refs: BriefingRef[] | undefined): string {
  if (!refs || refs.length === 0) return ''

  const rendered = refs
    .filter(ref => nonEmpty(ref.url) || nonEmpty(ref.title))
    .slice(0, 5)
    .map(ref => {
      const title = nonEmpty(ref.title) ? ref.title : ref.url
      if (nonEmpty(ref.url)) return `[${title}](${ref.url})`
      return title
    })

  return rendered.length > 0 ? `\n  Sources: ${rendered.join(' · ')}` : ''
}

function renderEntry(entry: BriefingEntry): string {
  const source = nonEmpty(entry.source) ? ` _(${entry.source})_` : ''
  return `- ${entry.text}${source}${renderRefs(entry.refs)}`
}

function renderEntryList(title: string, entries: BriefingEntry[] | undefined): string | null {
  if (!entries || entries.length === 0) return null
  return `## ${title}\n\n${entries.map(renderEntry).join('\n')}`
}

function renderSentiment(sentiment: SentimentAnalysis | undefined): string | null {
  if (!sentiment) return null

  const lines: string[] = []
  if (sentiment.overall_mood) lines.push(`- Mood: ${sentiment.overall_mood}`)
  if (nonEmpty(sentiment.mood_summary)) lines.push(`- ${sentiment.mood_summary}`)

  const buckets: Array<[string, typeof sentiment.controversies]> = [
    ['Controversies', sentiment.controversies],
    ['Opinion shifts', sentiment.opinion_shifts],
    ['Risk flags', sentiment.risk_flags],
  ]

  for (const [label, entries] of buckets) {
    if (!entries || entries.length === 0) continue
    lines.push(`- ${label}: ${entries.map(entry => {
      const topic = nonEmpty(entry.topic) ? `${entry.topic}: ` : ''
      return `${topic}${entry.analysis}`
    }).join('；')}`)
  }

  return lines.length > 0 ? `## Sentiment\n\n${lines.join('\n')}` : null
}

function renderSourceList(summary: BriefingSummary): string | null {
  const sources = summary.overall.sources ?? []
  if (sources.length === 0) return null

  const lines = sources
    .filter(source => nonEmpty(source.url) || nonEmpty(source.title))
    .slice(0, 30)
    .map(source => {
      const title = nonEmpty(source.title) ? source.title : source.url
      const sensor = nonEmpty(source.sensor) ? ` — ${source.sensor}` : ''
      if (nonEmpty(source.url)) return `${source.id}. [${title}](${source.url})${sensor}`
      return `${source.id}. ${title}${sensor}`
    })

  return lines.length > 0 ? `## Sources\n\n${lines.join('\n')}` : null
}

/** Render an AI BriefingSummary as a Markdown document. Pure: no I/O, no network. */
export function renderSummaryMarkdown(summary: BriefingSummary): string {
  const blocks: string[] = [
    '# Info Aggregation Summary',
    `_Generated at ${summary.generated_at}_  \n_Report fetched at ${summary.report_fetched_at}_`,
  ]

  if (nonEmpty(summary.overall.executive_summary)) {
    blocks.push(`## Executive Summary\n\n${summary.overall.executive_summary.trim()}`)
  }

  const quickScan = renderEntryList('Quick Scan', summary.overall.quick_scan)
  if (quickScan) blocks.push(quickScan)

  for (const section of summary.overall.sections ?? []) {
    if (!section.entries || section.entries.length === 0) continue
    blocks.push(`## ${section.title}\n\n${section.entries.map(renderEntry).join('\n')}`)
  }

  const sentiment = renderSentiment(summary.overall.sentiment)
  if (sentiment) blocks.push(sentiment)

  const sourceList = renderSourceList(summary)
  if (sourceList) blocks.push(sourceList)

  return blocks.join('\n\n').trim() + '\n'
}
