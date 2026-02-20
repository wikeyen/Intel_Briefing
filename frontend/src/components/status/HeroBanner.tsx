// ABOUTME: Hero banner for the Status dashboard showing pipeline health state and run controls.
// ABOUTME: Displays health status dot, label, description, timestamps, run mode buttons, and progress bar.
import type { HealthResponse, IntelReport, PipelineStatus, RunMode } from '@/api/client'
import { timeAgo } from './time-helpers'
import { StageBadge } from './StageBadge'

export interface HeroBannerProps {
  isRunning: boolean
  meta: { color: string; bg: string; label: string; desc: string }
  heroState: string
  health: HealthResponse | null
  fetching: boolean
  running: boolean
  report: IntelReport | null
  doneStages: number
  totalStages: number
  pipelineStatus: PipelineStatus | null
  onRun: (mode: RunMode) => void
}

export function HeroBanner({
  isRunning,
  meta,
  heroState,
  health,
  fetching,
  running,
  report,
  doneStages,
  totalStages,
  pipelineStatus,
  onRun,
}: HeroBannerProps) {
  // Hero banner background: running overrides to amber, otherwise reflects health
  const heroBg = isRunning ? 'var(--warn-bg)' : meta.bg

  return (
    <>
      <div className="hero-banner" style={{
        background: heroBg,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div className="hero-row" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
        }}>
          {/* Left side: status dot + health label + description */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <span style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: isRunning ? 'var(--accent)' : meta.color,
              flexShrink: 0,
              animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--ink)',
                lineHeight: 1.3,
              }}>
                {heroState === 'fetching' ? 'Fetching'
                  : heroState === 'summarizing' ? 'Summarizing'
                  : isRunning ? 'Pipeline Running'
                  : meta.label}
              </div>
              <div style={{
                fontSize: '0.8125rem',
                color: 'var(--ink-muted)',
                marginTop: '0.125rem',
              }}>
                {isRunning && pipelineStatus
                  ? `${doneStages}/${totalStages} stages complete \u00b7 ${pipelineStatus.total_items} items`
                  : meta.desc}
              </div>
            </div>
          </div>

          {/* Right side: last run timestamp + run mode buttons */}
          <div className="hero-actions" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            flexShrink: 0,
          }}>
            {health?.last_fetch && !isRunning && (
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}>
                  {timeAgo(health.last_fetch)}
                </div>
                <div style={{
                  fontSize: '0.6875rem',
                  color: 'var(--ink-faint)',
                  fontFamily: 'ui-monospace, monospace',
                  marginTop: '0.125rem',
                }}>
                  {health.last_fetch.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => onRun('fetch')}
                disabled={fetching || running || isRunning}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Fetch
              </button>
              <button
                onClick={() => onRun('summarize')}
                disabled={fetching || running || isRunning || !report}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning || !report) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning || !report) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning || !report) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Summarize
              </button>
              <button
                onClick={() => onRun('fetch_summarize')}
                disabled={fetching || running || isRunning}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Fetch + Summarize
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar — visible when pipeline is actively running */}
        {isRunning && (
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
              width: totalStages > 0 ? `${Math.round((doneStages / totalStages) * 100)}%` : '0%',
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 400ms ease',
            }} />
          </div>
        )}
      </div>

      {/* ── Overall Summary row (when mode includes summarization) ── */}
      {pipelineStatus && pipelineStatus.mode !== 'fetch' && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.75rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink)' }}>
            Overall Summary
          </span>
          <StageBadge state={pipelineStatus.overall_summary} label={
            pipelineStatus.overall_summary === 'running' ? 'Generating\u2026' :
            pipelineStatus.overall_summary === 'ok' ? 'Complete' :
            pipelineStatus.overall_summary === 'failed' ? 'Failed' :
            pipelineStatus.overall_summary === 'queued' ? 'Waiting' : '\u2014'
          } />
        </div>
      )}
    </>
  )
}
