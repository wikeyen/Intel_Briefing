// ABOUTME: Pipeline phase stepper — horizontal visual indicator of pipeline workflow phases.
// ABOUTME: Shows fetch → summary → briefing → intel as a connected progress line.
'use client'

import { useState } from 'react'
import type { PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export type PipelinePhaseStep = 'fetch' | 'retry' | 'summary' | 'briefing' | 'intelligence'
export type StepStatus = 'pending' | 'active' | 'done' | 'warn' | 'error' | 'skipped'

interface StepDef {
  key: PipelinePhaseStep
  labelKey: string
}

export const MAIN_STEPS: StepDef[] = [
  { key: 'fetch', labelKey: 'log.phase_fetch' },
  { key: 'summary', labelKey: 'log.phase_summary' },
  { key: 'briefing', labelKey: 'log.phase_briefing' },
  { key: 'intelligence', labelKey: 'log.phase_intelligence' },
]
const NODE_SIZE = 20
const CONNECTOR_HEIGHT = 4
const CONNECTOR_OFFSET = (NODE_SIZE - CONNECTOR_HEIGHT) / 2  // vertically center connector on node

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '',
  active: '●',
  done: '✓',
  warn: '✓',
  error: '✓',
  skipped: '–',
}

const TERMINAL_STATES = ['ok', 'failed', 'skipped', 'cancelled']

export function deriveStepStatuses(ps: PipelineStatus | null): Record<PipelinePhaseStep, StepStatus> {
  const s: Record<PipelinePhaseStep, StepStatus> = {
    fetch: 'pending',
    retry: 'pending',
    summary: 'pending',
    briefing: 'pending',
    intelligence: 'pending',
  }

  if (!ps) return s

  const events = ps.events ?? []

  // Fetch phase — exclude cached sensors (they didn't need fetching)
  const fetchSensors = ps.sensors.filter(sen => !sen.fetch_cached)
  const fetchStates = fetchSensors.map(sen => sen.fetch)
  const anyFetching = fetchStates.some(f => f === 'running')
  const anyFetchQueued = fetchStates.some(f => f === 'queued')
  const allFetchTerminal = fetchStates.every(f => TERMINAL_STATES.includes(f))
  const anyFetchFailed = fetchStates.some(f => f === 'failed')
  const allFetchCached = ps.sensors.length > 0 && fetchSensors.length === 0

  if (ps.mode === 'summarize') {
    s.fetch = 'skipped'
  } else if (allFetchCached) {
    s.fetch = 'skipped'
  } else if (anyFetching || anyFetchQueued) {
    s.fetch = 'active'
  } else if (allFetchTerminal && fetchStates.length > 0) {
    const allFetchFailed = fetchStates.length > 0 && fetchStates.every(f => f === 'failed')
    s.fetch = allFetchFailed ? 'error' : anyFetchFailed ? 'warn' : 'done'
  }

  // Retry phase
  if (ps.retry_attempt > 0) {
    s.retry = 'active'
  } else if (s.fetch === 'done' || s.fetch === 'warn' || s.fetch === 'error') {
    const hadRetryEvents = events.some(e => e.phase === 'retry')
    s.retry = hadRetryEvents ? 'done' : 'skipped'
  } else if (s.fetch === 'skipped') {
    s.retry = 'skipped'
  }

  // Summary phase
  const summaryStates = ps.sensors.map(sen => sen.summary)
  const anySummaryRunning = summaryStates.some(su => su === 'running')
  const anySummaryQueued = summaryStates.some(su => su === 'queued')
  const allSummaryTerminal = summaryStates.every(su => TERMINAL_STATES.includes(su))
  const anySummaryFailed = summaryStates.some(su => su === 'failed')
  const anySummaryIssue = anySummaryFailed || ps.sensors.some(sen => !!sen.summary_error)
  const allSummaryIssue = ps.sensors.every(sen => sen.summary === 'failed' || !!sen.summary_error)
  const allSummaryCancelled = summaryStates.length > 0 && summaryStates.every(su => su === 'cancelled' || su === 'skipped')
  const allSummaryCached = ps.sensors.length > 0 && ps.sensors.every(sen => sen.summary_cached || sen.summary === 'skipped')

  // Briefing (overall summary) — derived first so summary can use it as a guardrail
  if (ps.mode === 'fetch') {
    s.briefing = 'skipped'
  } else if (ps.overall_summary === 'running') {
    s.briefing = 'active'
  } else if (ps.overall_summary === 'ok') {
    s.briefing = 'done'
  } else if (ps.overall_summary === 'failed') {
    s.briefing = 'error'
  } else if (ps.overall_summary === 'skipped' || ps.overall_summary === 'cancelled') {
    s.briefing = 'skipped'
  }

  // Summary phase — active sensors always take priority over briefing state
  const briefingStarted = s.briefing === 'active' || s.briefing === 'done' || s.briefing === 'error'
  if (ps.mode === 'fetch') {
    s.summary = 'skipped'
  } else if (allSummaryCached) {
    s.summary = 'done'
  } else if (anySummaryRunning || anySummaryQueued) {
    s.summary = 'active'
  } else if (briefingStarted) {
    // Briefing started and no sensors are actively summarizing — treat any
    // remaining non-terminal states as stale.
    s.summary = allSummaryIssue ? 'error' : anySummaryIssue ? 'warn' : 'done'
  } else if (allSummaryCancelled) {
    s.summary = 'skipped'
  } else if (allSummaryTerminal && summaryStates.length > 0) {
    s.summary = allSummaryIssue ? 'error' : anySummaryIssue ? 'warn' : 'done'
  }

  // Intelligence
  const intelEvents = events.filter(e => e.phase === 'intelligence')
  if (ps.mode === 'fetch') {
    s.intelligence = 'skipped'
  } else if (s.summary === 'skipped' && s.briefing === 'skipped' && intelEvents.length === 0) {
    // All LLM phases skipped (e.g. all-cached early exit) — intel is also skipped
    s.intelligence = 'skipped'
  } else if (intelEvents.some(e => e.level === 'ok')) {
    s.intelligence = 'done'
  } else if (intelEvents.some(e => e.level === 'warn' || e.level === 'error')) {
    s.intelligence = 'error'
  } else if (intelEvents.some(e => e.level === 'info')) {
    s.intelligence = 'active'
  }

  // Paused state
  if (ps.paused) {
    if (ps.paused_stage === 'pre_overall') {
      s.briefing = 'active'
    }
  }

  return s
}

/** Returns 0–1 progress for each phase. -1 means indeterminate (running but no granular %). */
function derivePhaseProgress(ps: PipelineStatus | null): Record<PipelinePhaseStep, number> {
  const p: Record<PipelinePhaseStep, number> = { fetch: 0, retry: 0, summary: 0, briefing: 0, intelligence: 0 }
  if (!ps) return p

  // Fetch: fraction of non-skipped, non-cached sensors in terminal state
  const fetchActive = ps.sensors.filter(s => s.fetch !== 'skipped' && !s.fetch_cached)
  if (fetchActive.length > 0) {
    p.fetch = fetchActive.filter(s => TERMINAL_STATES.includes(s.fetch)).length / fetchActive.length
  }

  // Retry: indeterminate while active
  if (ps.retry_attempt > 0 && ps.retry_max > 0) {
    p.retry = -1
  }

  // Summary: fraction of non-skipped sensors in terminal state
  const sumActive = ps.sensors.filter(s => s.summary !== 'skipped')
  if (sumActive.length > 0) {
    p.summary = sumActive.filter(s => TERMINAL_STATES.includes(s.summary)).length / sumActive.length
  }

  // Briefing: binary — indeterminate while running
  if (ps.overall_summary === 'running') {
    p.briefing = -1
  } else if (TERMINAL_STATES.includes(ps.overall_summary)) {
    p.briefing = 1
  }

  // Intelligence: indeterminate while active (event-based, no granular %)
  const intelEvents = (ps.events ?? []).filter(e => e.phase === 'intelligence')
  if (intelEvents.some(e => e.level === 'ok' || e.level === 'warn' || e.level === 'error')) {
    p.intelligence = 1
  } else if (intelEvents.some(e => e.level === 'info')) {
    p.intelligence = -1
  }

  return p
}

/** Per-phase tooltip data — only meaningful for terminal phases. */
export interface PhaseTooltipData {
  /** Lines to display in the tooltip, e.g. ["8 fetched", "2 cached", "1 failed", "42 items"] */
  lines: string[]
}

/**
 * Aggregate per-phase outcome stats from pipeline status.
 * Returns null for phases that haven't completed yet.
 */
export function derivePhaseTooltipData(
  ps: PipelineStatus | null,
  statuses: Record<PipelinePhaseStep, StepStatus>,
  t: (key: string) => string,
): Record<PipelinePhaseStep, PhaseTooltipData | null> {
  const result: Record<PipelinePhaseStep, PhaseTooltipData | null> = {
    fetch: null, retry: null, summary: null, briefing: null, intelligence: null,
  }
  if (!ps) return result

  const TERMINAL: StepStatus[] = ['done', 'warn', 'error', 'skipped']

  // ── Fetch ──
  if (TERMINAL.includes(statuses.fetch)) {
    if (statuses.fetch === 'skipped') {
      result.fetch = { lines: [t('stepper.skipped')] }
    } else {
      const fetched = ps.sensors.filter(s => !s.fetch_cached && s.fetch === 'ok').length
      const cached = ps.sensors.filter(s => s.fetch_cached).length
      const failed = ps.sensors.filter(s => s.fetch === 'failed').length
      const items = ps.sensors.reduce((sum, s) => sum + s.item_count, 0)
      const lines: string[] = []
      if (fetched > 0) lines.push(`${fetched} ${t('stepper.sources_fetched')}`)
      if (cached > 0) lines.push(`${cached} ${t('stepper.sources_cached')}`)
      if (failed > 0) lines.push(`${failed} ${t('stepper.sources_failed')}`)
      lines.push(`${items} ${t('stepper.items_collected')}`)
      result.fetch = { lines }
    }
  }

  // ── Summary ──
  if (TERMINAL.includes(statuses.summary)) {
    if (statuses.summary === 'skipped') {
      result.summary = { lines: [t('stepper.skipped')] }
    } else {
      const summarized = ps.sensors.filter(s => s.summary === 'ok' && !s.summary_error).length
      const failed = ps.sensors.filter(s => s.summary === 'failed' || !!s.summary_error).length
      const chunks = ps.sensors.reduce((sum, s) => sum + s.summary_chunks_done, 0)
      const lines: string[] = []
      if (summarized > 0) lines.push(`${summarized} ${t('stepper.sources_summarized')}`)
      if (failed > 0) lines.push(`${failed} ${t('stepper.summaries_failed')}`)
      if (chunks > 0) lines.push(`${chunks} ${t('stepper.chunks_processed')}`)
      result.summary = { lines }
    }
  }

  // ── Briefing ──
  if (TERMINAL.includes(statuses.briefing)) {
    if (statuses.briefing === 'skipped') {
      result.briefing = { lines: [t('stepper.skipped')] }
    } else {
      const statusLabel = statuses.briefing === 'done' ? t('stepper.status_ok') : t('stepper.status_failed')
      const lines = [statusLabel]
      if (ps.started_at && ps.completed_at) {
        const durMs = new Date(ps.completed_at).getTime() - new Date(ps.started_at).getTime()
        const durSec = Math.round(durMs / 1000)
        lines.push(durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`)
      }
      result.briefing = { lines }
    }
  }

  // ── Intelligence ──
  if (TERMINAL.includes(statuses.intelligence)) {
    if (statuses.intelligence === 'skipped') {
      result.intelligence = { lines: [t('stepper.skipped')] }
    } else {
      const statusLabel = statuses.intelligence === 'done' ? t('stepper.status_ok') : t('stepper.status_failed')
      const lines = [statusLabel]
      if (ps.started_at && ps.completed_at) {
        const durMs = new Date(ps.completed_at).getTime() - new Date(ps.started_at).getTime()
        const durSec = Math.round(durMs / 1000)
        lines.push(durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`)
      }
      result.intelligence = { lines }
    }
  }

  return result
}


export const STEP_COLORS: Record<StepStatus, { dot: string; label: string }> = {
  pending: { dot: 'var(--border)', label: 'var(--ink-faint)' },
  active: { dot: 'var(--accent)', label: 'var(--accent)' },
  done: { dot: 'var(--ok)', label: 'var(--ink-muted)' },
  warn: { dot: 'var(--warn)', label: 'var(--warn)' },
  error: { dot: 'var(--err)', label: 'var(--err)' },
  skipped: { dot: 'var(--border)', label: 'var(--ink-faint)' },
}

const STEPPER_CSS = `
@keyframes stepperShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

/** Soft-UI tooltip rendered below a completed stepper node. */
function PhaseTooltip({ data }: { data: PhaseTooltipData }) {
  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: 8,
      padding: '6px 10px',
      background: 'var(--surface-overlay)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      boxShadow: 'var(--shadow-md)',
      zIndex: 20,
      whiteSpace: 'nowrap',
      animation: 'tooltipFadeIn 200ms ease',
      pointerEvents: 'none',
    }}>
      {/* Upward caret */}
      <div style={{
        position: 'absolute',
        top: -4,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 8,
        height: 8,
        background: 'var(--surface-overlay)',
        borderTop: '1px solid var(--border-subtle)',
        borderLeft: '1px solid var(--border-subtle)',
      }} />
      {data.lines.map((line, i) => (
        <div key={i} style={{
          fontSize: '0.625rem',
          fontWeight: 500,
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-muted)',
          lineHeight: 1.5,
          letterSpacing: '0.02em',
        }}>
          {line}
        </div>
      ))}
    </div>
  )
}

/** Circle node with icon + label. */
function StepNode({ step, status, isClickable, onLogToggle, t, align = 'center', tooltipData }: {
  step: StepDef
  status: StepStatus
  isClickable: boolean
  onLogToggle?: () => void
  t: (key: string) => string
  align?: 'flex-start' | 'center' | 'flex-end'
  tooltipData: PhaseTooltipData | null
}) {
  const [hovered, setHovered] = useState(false)
  const colors = STEP_COLORS[status]
  const icon = STEP_ICONS[status]

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onLogToggle : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onLogToggle!() } : undefined}
      onMouseEnter={() => tooltipData && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap: '0.1875rem',
        flexShrink: 0,
        position: 'relative',
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      {/* Circle */}
      <div style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: '50%',
        border: `1.5px solid ${colors.dot}`,
        background: (status === 'done' || status === 'warn' || status === 'error') ? colors.dot : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.5625rem',
        fontWeight: 700,
        color: (status === 'done' || status === 'warn' || status === 'error') ? 'white' : colors.dot,
        transition: 'all 300ms ease',
      }}>
        {icon}
      </div>
      {/* Label */}
      <span style={{
        fontSize: '0.5rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: colors.label,
        whiteSpace: 'nowrap',
        transition: 'color 300ms ease',
      }}>
        {t(step.labelKey)}
      </span>
      {hovered && tooltipData && <PhaseTooltip data={tooltipData} />}
    </div>
  )
}


interface PipelinePhaseStepperProps {
  pipelineStatus: PipelineStatus | null
  /** Clicking any non-pending node toggles the activity log drawer. */
  onLogToggle?: () => void
}

export function PhaseStepper({ pipelineStatus, onLogToggle }: PipelinePhaseStepperProps) {
  const { t } = useTranslation()
  const statuses = deriveStepStatuses(pipelineStatus)
  const progress = derivePhaseProgress(pipelineStatus)
  const tooltipData = derivePhaseTooltipData(pipelineStatus, statuses, t)

  const visibleSteps = MAIN_STEPS
  const hasEvents = (pipelineStatus?.events ?? []).length > 0

  return (
    <>
      {/* Safe: STEPPER_CSS is a hardcoded CSS string constant — no user/external input. */}
      <style dangerouslySetInnerHTML={{ __html: STEPPER_CSS }} />
      <div style={{ width: '100%' }}>
        {/* Main line */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          padding: '0.125rem 0 0.25rem',
          width: '100%',
        }}>
          {visibleSteps.map((step, i) => {
            const status = statuses[step.key]
            const isLast = i === visibleSteps.length - 1
            const isClickable = hasEvents && status !== 'pending' && !!onLogToggle

            // Connector line represents progress toward the NEXT step.
            // When the next step is active, show its progress as a partial fill + shimmer.
            // Otherwise show the current step's completion state.
            const nextStep = !isLast ? visibleSteps[i + 1] : null
            const nextStatus = nextStep ? statuses[nextStep.key] : undefined
            const nextIsActive = nextStatus === 'active'
            const nextProg = nextStep ? progress[nextStep.key] : 0
            const nextIsIndeterminate = nextIsActive && nextProg === -1

            let lineFillColor: string
            let lineFillPct: number
            let isIndeterminate: boolean

            if (nextIsActive) {
              // Show next step's progress on this connector (progress bar effect)
              lineFillColor = 'var(--accent)'
              isIndeterminate = nextIsIndeterminate
              lineFillPct = isIndeterminate ? 0 : Math.round(nextProg * 100)
            } else {
              const nextDone = nextStatus === 'done' || nextStatus === 'warn' || nextStatus === 'error' || nextStatus === 'skipped'
              if (status === 'done') {
                lineFillColor = 'var(--ok)'
                lineFillPct = 100
              } else if (status === 'warn') {
                lineFillColor = 'var(--warn)'
                lineFillPct = 100
              } else if (status === 'error') {
                lineFillColor = 'var(--err)'
                lineFillPct = 100
              } else if (status === 'skipped') {
                lineFillColor = 'var(--border)'
                lineFillPct = 100
              } else {
                lineFillColor = 'transparent'
                lineFillPct = 0
              }
              isIndeterminate = false
            }

            const showShimmer = nextIsActive

            return (
              <div key={step.key} style={{
                display: 'flex',
                alignItems: 'flex-start',
                flex: isLast ? '0 0 auto' : '1 1 0',
                minWidth: 0,
              }}>
                <StepNode
                  step={step}
                  status={status}
                  isClickable={isClickable}
                  onLogToggle={onLogToggle}
                  t={t}
                  align={i === 0 ? 'flex-start' : isLast ? 'flex-end' : 'center'}
                  tooltipData={tooltipData[step.key]}
                />

                {!isLast && (
                  <div style={{ flex: '1 1 0', minWidth: 12 }}>
                    {/* Connector line with progress fill */}
                    <div style={{
                      height: CONNECTOR_HEIGHT,
                      background: 'var(--border)',
                      opacity: 0.4,
                      marginTop: CONNECTOR_OFFSET,
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      {/* Determinate fill */}
                      {!isIndeterminate && lineFillPct > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: `${lineFillPct}%`,
                          background: lineFillColor,
                          borderRadius: 2,
                          opacity: 1 / 0.4, // Counteract parent's opacity
                          transition: 'width 500ms ease',
                        }} />
                      )}
                      {/* Shimmer overlay for active phases */}
                      {showShimmer && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: '100%',
                          overflow: 'hidden',
                          borderRadius: 2,
                        }}>
                          <div style={{
                            width: '33%',
                            height: '100%',
                            background: `linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)`,
                            borderRadius: 2,
                            opacity: 1 / 0.4,
                            animation: 'stepperShimmer 1.2s ease-in-out infinite',
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

      </div>
    </>
  )
}
