// ABOUTME: Compact executive overview card displayed above the dashboard tab bar.
// ABOUTME: Shows mood badge, executive summary with expand/collapse, quick scan bullets, and risk flags.
'use client'

import { useState } from 'react'
import type { BriefingSummary } from '@/api/client'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const TRUNCATE_LENGTH = 280

const MOOD_COLORS: Record<string, string> = {
  bullish: '#3D9E85',
  bearish: '#C4606E',
  mixed: '#D4A843',
  neutral: 'var(--ink-tertiary)',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutiveSummaryCardProps {
  summary: BriefingSummary | null
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MoodBadge({ mood }: { mood: string }) {
  const color = MOOD_COLORS[mood] ?? MOOD_COLORS.neutral
  return (
    <span style={{
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      color,
      borderRadius: 4,
      padding: '1px 8px',
      fontFamily: MONO,
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      whiteSpace: 'nowrap',
    }}>
      {mood}
    </span>
  )
}

function QuickScanList({ entries }: { entries: Array<{ text: string; source: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
      }}>
        Quick Scan
      </span>
      <ul style={{
        margin: 0,
        paddingLeft: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}>
        {entries.map((entry, i) => (
          <li key={i} style={{
            fontSize: '0.75rem',
            lineHeight: 1.5,
            color: 'var(--ink-secondary)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{entry.source}:</span>{' '}
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RiskFlagsList({ flags }: { flags: Array<{ topic: string; analysis: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
      }}>
        Risk Flags
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {flags.map((flag, i) => (
          <div
            key={i}
            style={{
              background: 'color-mix(in srgb, var(--warn) 6%, transparent)',
              borderLeft: '2px solid var(--warn)',
              borderRadius: '0 4px 4px 0',
              padding: '0.375rem 0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: 2 }}>
              <span style={{ fontSize: '0.6875rem', lineHeight: 1 }}>{'\u26A0'}</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink)' }}>
                {flag.topic}
              </span>
            </div>
            <p style={{ fontSize: '0.625rem', color: 'var(--ink-secondary)', margin: 0, lineHeight: 1.5 }}>
              {flag.analysis}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutiveSummaryCard({ summary }: ExecutiveSummaryCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (!summary) return null

  const execSummary = summary.overall?.executive_summary
  if (!execSummary || execSummary.trim().length === 0) return null

  const mood = summary.overall.sentiment?.overall_mood ?? 'neutral'
  const quickScan = summary.overall.quick_scan
  const riskFlags = summary.overall.sentiment?.risk_flags
  const needsTruncation = execSummary.length > TRUNCATE_LENGTH
  const displayText = needsTruncation && !expanded
    ? execSummary.slice(0, TRUNCATE_LENGTH).trimEnd() + '\u2026'
    : execSummary

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1.25rem',
      background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
      marginBottom: '0.75rem',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.625rem',
      }}>
        <span style={{
          fontFamily: MONO,
          fontSize: '0.5625rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: 'var(--ink-tertiary)',
        }}>
          Executive Summary
        </span>
        <MoodBadge mood={mood} />
      </div>

      {/* Executive summary text */}
      <p style={{
        fontSize: '0.8125rem',
        lineHeight: 1.6,
        color: 'var(--ink-secondary)',
        margin: 0,
      }}>
        {displayText}
      </p>

      {/* Expand/collapse toggle */}
      {needsTruncation && (
        <span
          onClick={() => setExpanded(prev => !prev)}
          style={{
            fontFamily: MONO,
            fontSize: '0.625rem',
            color: 'var(--accent)',
            cursor: 'pointer',
            userSelect: 'none',
            marginTop: '0.25rem',
            display: 'inline-block',
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </span>
      )}

      {/* Quick scan bullets */}
      {quickScan && quickScan.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <QuickScanList entries={quickScan} />
        </div>
      )}

      {/* Risk flags */}
      {riskFlags && riskFlags.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <RiskFlagsList flags={riskFlags} />
        </div>
      )}
    </div>
  )
}
