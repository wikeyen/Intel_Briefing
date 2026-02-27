// ABOUTME: Pure Markdown renderer for IntelReport — no I/O, no HTTP, no sleeps.
// ABOUTME: Renders all report sections from the IntelReport model.
import type { IntelItem, IntelReport } from '../models'

const NO_DATA_PLACEHOLDER = '_No data available for this section._'

function renderItem(item: IntelItem): string {
  const lines: string[] = []

  if (item.url) {
    lines.push(`- **[${item.title}](${item.url})**`)
  } else {
    lines.push(`- **${item.title}**`)
  }

  const meta: string[] = []
  if (item.source) {
    meta.push(`via ${item.source}`)
  }
  if (item.published_at) {
    meta.push(item.published_at)
  }
  if (item.heat) {
    meta.push(`🔥 ${item.heat}`)
  }
  if (item.account) {
    meta.push(`@${item.handle ?? item.account}`)
  }
  if (item.topic) {
    meta.push(`#${item.topic}`)
  }
  if (meta.length > 0) {
    lines.push(`  *${meta.join(' · ')}*`)
  }

  if (item.authors && item.authors.length > 0) {
    lines.push(`  Authors: ${item.authors.join(', ')}`)
  }

  if (item.abstract) {
    const trimmed =
      item.abstract.length > 400
        ? item.abstract.slice(0, 400) + '…'
        : item.abstract
    lines.push(`  > ${trimmed}`)
  }

  return lines.join('\n')
}

function renderSection(
  title: string,
  items: IntelItem[],
): string {
  const header = `## ${title}`
  if (items.length === 0) {
    return `${header}\n\n${NO_DATA_PLACEHOLDER}`
  }

  const body = items.map((item) => renderItem(item)).join('\n\n')
  return `${header}\n\n${body}`
}

/**
 * Render an IntelReport as a Markdown document.
 * Pure function — performs no I/O, no HTTP calls, no sleeps.
 */
export function renderMarkdown(report: IntelReport): string {
  let header =
    `# Intel Briefing — ${report.date}\n\n` +
    `_Fetched at ${report.fetched_at}_\n`

  if (report.stale) {
    header +=
      '\n> ⚠️ **This report may be stale.** Data was not refreshed on schedule.\n'
  }

  const sectionBlocks: string[] = []
  for (const [key, items] of Object.entries(report.items)) {
    const title = key === 'ungrouped'
      ? 'Ungrouped'
      : key.charAt(0).toUpperCase() + key.slice(1)
    sectionBlocks.push(renderSection(title, items))
  }

  const footerSources =
    [...report.sources_ok].sort().join(', ') || 'none'
  const footerFailed =
    [...report.sources_failed].sort().join(', ') || 'none'
  const footer =
    `---\n\n` +
    `**Sources OK:** ${footerSources}  \n` +
    `**Sources Failed:** ${footerFailed}`

  return [header, ...sectionBlocks, footer].join('\n\n')
}
