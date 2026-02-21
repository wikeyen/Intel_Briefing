// ABOUTME: Stale process detection banner — shows when a process was interrupted mid-run.
// ABOUTME: Offers Abort (clear state), Resume (continue from interruption), and Restart (fresh run).
'use client'
import type { SummaryProgress, PipelineStatus } from '@/api/client'

export type StaleProcess = 'summary' | 'pipeline'

export interface StaleInfo {
  type: StaleProcess
  startedAt: string
  completedSensors: number
  totalSensors: number
  failedSensors: string[]
  /** True when all sensors finished fetching — resume can skip to summarize */
  fetchComplete: boolean
}

/** Minimum age (ms) before a run can be flagged as stale. Prevents false
 *  positives during startup (after() hasn't run yet) and completion (DB write
 *  in-flight). */
const STALE_MIN_AGE_MS = 30_000

/**
 * Detect stale processes from status responses.
 * A process is stale when the DB says running=true but the server has no
 * in-memory controller (alive=false), meaning the process died (e.g. app restart).
 */
export function detectStale(
  summaryProgress: SummaryProgress | null,
  pipelineStatus: PipelineStatus | null,
): StaleInfo | null {
  // Check pipeline first (higher priority — it drives both fetch and summary)
  if (pipelineStatus?.running && !pipelineStatus.alive) {
    // Don't flag as stale if the run is too recent — the process may still be starting
    if (pipelineStatus.started_at) {
      const age = Date.now() - new Date(pipelineStatus.started_at).getTime()
      if (age < STALE_MIN_AGE_MS) return null
    }
    const completed = pipelineStatus.sensors.filter(
      s => s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped',
    ).length
    const failed = pipelineStatus.sensors
      .filter(s => s.fetch === 'failed')
      .map(s => s.name)
    const fetchComplete = pipelineStatus.sensors.length > 0 &&
      pipelineStatus.sensors.every(s => s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped')
    return {
      type: 'pipeline',
      startedAt: pipelineStatus.started_at ?? '',
      completedSensors: completed,
      totalSensors: pipelineStatus.sensors.length,
      failedSensors: failed,
      fetchComplete,
    }
  }

  // Check standalone summary
  if (summaryProgress?.running && !summaryProgress.alive) {
    if (summaryProgress.started_at) {
      const age = Date.now() - new Date(summaryProgress.started_at).getTime()
      if (age < STALE_MIN_AGE_MS) return null
    }
    const completed = summaryProgress.sensors.filter(
      s => s.state === 'ok' || s.state === 'failed',
    ).length
    const failed = summaryProgress.sensors
      .filter(s => s.state === 'failed')
      .map(s => s.sensor_name)
    return {
      type: 'summary',
      startedAt: summaryProgress.started_at ?? '',
      completedSensors: completed,
      totalSensors: summaryProgress.sensors.length,
      failedSensors: failed,
      fetchComplete: true, // standalone summary = fetch already done
    }
  }

  return null
}

function timeAgo(isoString: string): string {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const ghostBtn: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--ink-muted)',
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.375rem 0.75rem',
  cursor: 'pointer',
  transition: 'border-color 100ms',
}

const solidBtn: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#fff',
  background: 'var(--ink)',
  border: 'none',
  borderRadius: 4,
  padding: '0.375rem 0.75rem',
  cursor: 'pointer',
  transition: 'background 100ms',
}

export function StaleProcessBanner({ stale, onAbort, onResume, onRestart }: {
  stale: StaleInfo
  onAbort: () => void
  onResume: () => void
  onRestart: () => void
}) {
  const label = stale.type === 'pipeline' ? 'Pipeline' : 'Summary'
  const pct = stale.totalSensors > 0
    ? Math.round((stale.completedSensors / stale.totalSensors) * 100)
    : 0
  const resumeHint = stale.fetchComplete
    ? 'Resume will re-run summaries only'
    : 'Resume will re-fetch and summarize'

  return (
    <div style={{
      background: 'rgba(234,179,8,0.06)',
      border: '1px solid rgba(234,179,8,0.3)',
      borderRadius: 8,
      padding: '1rem 1.25rem',
      marginBottom: '1.25rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.375rem',
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#eab308',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--ink)',
            }}>
              {label} interrupted
            </span>
            {stale.startedAt && (
              <span style={{
                fontSize: '0.6875rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                started {timeAgo(stale.startedAt)}
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--ink-muted)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {pct}% complete ({stale.completedSensors}/{stale.totalSensors} sensors)
            {stale.failedSensors.length > 0 && (
              <> · {stale.failedSensors.length} failed</>
            )}
            {' '}— the process was lost, likely due to an app restart.
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexShrink: 0,
          alignItems: 'center',
        }}>
          <button
            onClick={onAbort}
            title="Clear the interrupted state"
            style={ghostBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-faint)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            Abort
          </button>
          <button
            onClick={onResume}
            title={resumeHint}
            style={ghostBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-faint)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            Resume
          </button>
          <button
            onClick={onRestart}
            title="Start a fresh full run"
            style={solidBtn}
            onMouseEnter={e => { e.currentTarget.style.background = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--ink)' }}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
