// ABOUTME: Dedicated AI Briefing page — shows the executive summary and per-source summaries.
// ABOUTME: Fetches summary from /api/summary and displays it with prominent overall + source cards.
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/api/client'
import type { BriefingSummary, SummaryProgress } from '@/api/client'

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function Briefing() {
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null)

  useEffect(() => {
    api.getSummary()
      .then(r => setSummary(r.summary))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Poll summary status for live progress
  useEffect(() => {
    const check = () => {
      api.getSummaryStatus().then(s => {
        setSummaryProgress(s)
        // Refresh summary when summarization completes
        if (!s.running && s.completed_at) {
          api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
        }
      }).catch(() => {})
    }
    check()
    const iv = setInterval(check, 3_000)
    return () => clearInterval(iv)
  }, [])

  const isSummarizing = !!(summaryProgress?.running && summaryProgress.started_at
    && (Date.now() - new Date(summaryProgress.started_at).getTime()) < 5 * 60 * 1000)

  const summaryDoneSensors = summaryProgress
    ? summaryProgress.sensors.filter(s => s.state === 'ok' || s.state === 'failed').length
    : 0
  const summaryTotalSensors = summaryProgress?.sensors.length ?? 0

  if (loading) {
    return (
      <section style={{ padding: '4.5rem 0' }}>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading briefing…</p>
      </section>
    )
  }

  if (!summary && !isSummarizing) {
    return (
      <section style={{ padding: '4.5rem 0' }}>
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
            Briefing
          </h2>
        </div>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
        }}>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', margin: 0, marginBottom: '0.75rem' }}>
            No briefing available yet.
          </p>
          <p style={{ color: 'var(--ink-faint)', fontSize: '0.8125rem', margin: 0 }}>
            Configure an AI provider in{' '}
            <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Settings
            </Link>
            {' '}and run a fetch to generate your first briefing.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section style={{ padding: '4.5rem 0' }}>

      {/* ── Page header (hidden on mobile — shown in top bar) ─────── */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Briefing
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          AI-generated intelligence summary from all configured sources.
        </p>
      </div>

      {/* ── Summarizing Progress Banner ──────────────────────────── */}
      {isSummarizing && summaryProgress && (
        <div style={{
          background: 'var(--warn-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
            animation: 'pulseDot 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink)' }}>
            Summarizing — {summaryDoneSensors}/{summaryTotalSensors} sources complete
          </span>
          {/* Progress bar */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--border)',
          }}>
            <div style={{
              height: '100%',
              width: summaryTotalSensors > 0 ? `${Math.round((summaryDoneSensors / summaryTotalSensors) * 100)}%` : '0%',
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 400ms ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Executive Summary ─────────────────────────────────── */}
      {summary && (
        <>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '2rem 2.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
            }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                Executive Summary
              </h3>
              <span style={{
                fontSize: '0.6875rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {summary.generated_at.slice(0, 16).replace('T', ' ')} · {timeAgo(summary.generated_at)}
              </span>
            </div>
            <p style={{
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              lineHeight: 1.8,
              margin: 0,
            }}>
              {summary.overall}
            </p>
          </div>

          {/* ── Source Summaries ─────────────────────────────────── */}
          {summary.sections.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '1rem',
            }}>
              {summary.sections.map(s => (
                <div key={s.sensor_name} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '1.25rem 1.5rem',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.625rem',
                  }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
                      {s.label}
                    </span>
                    <span style={{
                      fontSize: '0.6875rem',
                      color: 'var(--ink-faint)',
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {s.item_count} items
                    </span>
                  </div>
                  <p style={{
                    fontSize: '0.8125rem',
                    color: 'var(--ink-muted)',
                    lineHeight: 1.7,
                    margin: 0,
                  }}>
                    {s.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
