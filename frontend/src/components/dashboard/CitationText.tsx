// ABOUTME: Resolves [N] citation markers in text against a BriefingSource array.
// ABOUTME: Renders matched citations as superscript clickable links to source articles.

import type { BriefingSource } from '@/api/client'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CitationTextProps {
  text: string
  sources: BriefingSource[]
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const LINK_STYLE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.5625rem',
  color: 'var(--accent)',
  textDecoration: 'none',
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Regex splits text into alternating segments: plain text, then captured digit group. */
const CITATION_RE = /\[(\d+)\]/

/**
 * Parse `text` and resolve `[N]` markers against `sources`.
 * Returns an array of React nodes — plain strings for text segments,
 * `<sup><a>` elements for resolved citations, and nothing for unresolved ones.
 */
function buildNodes(text: string, sources: BriefingSource[]): React.ReactNode[] {
  const parts = text.split(CITATION_RE)
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  const nodes: React.ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]

    // Even indices are plain text, odd indices are the captured digit group.
    if (i % 2 === 0) {
      if (segment) nodes.push(segment)
      continue
    }

    const id = Number(segment)
    const source = sourceById.get(id)
    if (!source) continue // Strip unresolved markers

    nodes.push(
      <sup key={`cite-${id}-${i}`}>
        <a
          href={source.url}
          title={source.title}
          target="_blank"
          rel="noopener noreferrer"
          style={LINK_STYLE}
          onMouseEnter={(e) => { (e.currentTarget.style.textDecoration = 'underline') }}
          onMouseLeave={(e) => { (e.currentTarget.style.textDecoration = 'none') }}
        >
          [{id}]
        </a>
      </sup>,
    )
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CitationText({ text, sources }: CitationTextProps) {
  return <span>{buildNodes(text, sources)}</span>
}
