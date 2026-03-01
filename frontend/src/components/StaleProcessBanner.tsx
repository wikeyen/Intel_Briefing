// ABOUTME: Stale process detection banner — shows when a process was interrupted mid-run.
// ABOUTME: Offers Abort (clear state), Resume (continue from interruption), and Restart (fresh run).
'use client'
import type { SummaryProgress, PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

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
  // Skip cancelled pipelines — they were intentionally stopped, not interrupted.
  if (pipelineStatus?.running && !pipelineStatus.alive && !pipelineStatus.cancelled) {
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
    // If all sensors finished, this is a transient DB-lag race, not a real crash
    const allSensorsDone = summaryProgress.sensors.length > 0 &&
      summaryProgress.sensors.every(s => s.state === 'ok' || s.state === 'failed')
    if (allSensorsDone) return null
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

/**
 * Extract sensor names that did not complete fetching in a stale pipeline run.
 * Used by resume handlers to trigger an incremental run for only the missing sensors.
 */
export function getIncompleteSensors(sensors: PipelineStatus['sensors']): string[] {
  return sensors
    .filter(s => s.fetch !== 'ok' && s.fetch !== 'skipped' && !s.fetch_cached)
    .map(s => s.name)
}

function timeAgo(isoString: string, t: (key: string, params?: Record<string, string>) => string): string {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return t('time.seconds_ago', { n: String(diff) })
  if (diff < 3600) return t('time.minutes_ago', { n: String(Math.floor(diff / 60)) })
  if (diff < 86400) return t('time.hours_ago', { n: String(Math.floor(diff / 3600)) })
  return t('time.days_ago', { n: String(Math.floor(diff / 86400)) })
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
  color: 'var(--canvas)',
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
  const { t } = useTranslation()
  const label = stale.type === 'pipeline' ? t('stale.pipeline') : t('stale.summary')
  const pct = stale.totalSensors > 0
    ? Math.round((stale.completedSensors / stale.totalSensors) * 100)
    : 0
  const remaining = stale.totalSensors - stale.completedSensors
  const resumeHint = stale.fetchComplete
    ? t('stale.resume_summary')
    : t('stale.resume_full')

  return (
    <div style={{
      background: 'var(--warn-tint)',
      border: '1px solid var(--warn-border)',
      borderRadius: 8,
      padding: '1rem 1.25rem',
      marginBottom: '1.25rem',
    }}>
      <div className="stale-banner-layout" style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stale-banner-header" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.375rem',
            flexWrap: 'wrap',
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--warn)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--ink)',
            }}>
              {t('stale.interrupted', { label })}
            </span>
            {stale.startedAt && (
              <span style={{
                fontSize: '0.6875rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {t('stale.started', { time: timeAgo(stale.startedAt, t) })}
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--ink-muted)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {t('stale.sources_fetched', { done: String(stale.completedSensors), total: String(stale.totalSensors) })}
            {stale.failedSensors.length > 0 && (
              <> · {t('stale.n_failed', { count: String(stale.failedSensors.length) })}</>
            )}
            {' '}— {t('stale.lost')}
          </p>
        </div>
        <div className="stale-banner-actions" style={{
          display: 'flex',
          gap: '0.5rem',
          flexShrink: 0,
          alignItems: 'center',
        }}>
          <button
            onClick={onAbort}
            title={t('stale.abort_title')}
            style={ghostBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-faint)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            {t('stale.abort')}
          </button>
          <button
            onClick={onResume}
            title={resumeHint}
            style={ghostBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-faint)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            {t('stale.continue', { remaining: String(remaining) })}
          </button>
          <button
            onClick={onRestart}
            title={t('stale.restart_title')}
            style={solidBtn}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--ink-muted)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--ink)' }}
          >
            {t('stale.discard')}
          </button>
        </div>
      </div>
    </div>
  )
}
