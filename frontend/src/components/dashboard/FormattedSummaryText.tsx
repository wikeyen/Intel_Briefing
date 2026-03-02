// ABOUTME: Renders structured executive summary text with paragraphs, bullet lists, and inline citations.
// ABOUTME: Splits on double-newlines for paragraphs, detects `- ` prefixed blocks as bullet lists, delegates citation resolution to CitationText.
'use client'

import type { BriefingSource } from '@/api/client'
import { CitationText } from './CitationText'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FormattedSummaryTextProps {
  text: string
  sources: BriefingSource[]
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PARAGRAPH_STYLE: React.CSSProperties = {
  fontSize: '0.875rem',
  lineHeight: 1.75,
  color: 'var(--ink)',
  margin: '0 0 0.75rem 0',
}

const LIST_STYLE: React.CSSProperties = {
  paddingLeft: '1.25rem',
  margin: '0 0 0.75rem 0',
}

const LIST_ITEM_STYLE: React.CSSProperties = {
  fontSize: '0.875rem',
  lineHeight: 1.75,
  color: 'var(--ink)',
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

interface ParagraphBlock {
  type: 'paragraph'
  text: string
}

interface BulletBlock {
  type: 'bullets'
  items: string[]
}

type Block = ParagraphBlock | BulletBlock

/**
 * Parse text into a sequence of paragraph and bullet blocks.
 * Splits on `\n\n` boundaries. A block where every line starts with `- `
 * becomes a bullet list; everything else becomes a paragraph.
 */
function parseBlocks(text: string): Block[] {
  if (!text || text.trim().length === 0) return []

  const rawBlocks = text.split('\n\n')
  const blocks: Block[] = []

  for (const raw of rawBlocks) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue

    const lines = trimmed.split('\n')
    const allBullets = lines.every(line => line.trimStart().startsWith('- '))

    if (allBullets) {
      blocks.push({
        type: 'bullets',
        items: lines.map(line => line.trimStart().slice(2)),
      })
    } else {
      blocks.push({ type: 'paragraph', text: trimmed })
    }
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormattedSummaryText({ text, sources }: FormattedSummaryTextProps) {
  const blocks = parseBlocks(text)

  if (blocks.length === 0) return null

  return (
    <div>
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1
        const marginStyle = isLast ? { margin: 0 } : {}

        if (block.type === 'bullets') {
          return (
            <ul key={i} style={{ ...LIST_STYLE, ...marginStyle }}>
              {block.items.map((item, j) => (
                <li key={j} style={LIST_ITEM_STYLE}>
                  <CitationText text={item} sources={sources} />
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} style={{ ...PARAGRAPH_STYLE, ...marginStyle }}>
            <CitationText text={block.text} sources={sources} />
          </p>
        )
      })}
    </div>
  )
}
