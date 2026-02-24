// ABOUTME: Pipeline phase stepper — horizontal visual indicator of pipeline workflow phases.
// ABOUTME: Shows fetch → summary → intel → briefing main line with retry as a git-tree branch below.
'use client'

import type { PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export type PipelinePhaseStep = 'fetch' | 'retry' | 'summary' | 'briefing' | 'intelligence'
type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'

interface StepDef {
  key: PipelinePhaseStep
  labelKey: string
}

const MAIN_STEPS: StepDef[] = [
  { key: 'fetch', labelKey: 'log.phase_fetch' },
  { key: 'summary', labelKey: 'log.phase_summary' },
  { key: 'intelligence', labelKey: 'log.phase_intelligence' },
  { key: 'briefing', labelKey: 'log.phase_briefing' },
]
const BRANCH_STEP: StepDef = { key: 'retry', labelKey: 'log.phase_retry' }

const NODE_SIZE = 22
const NODE_CENTER = NODE_SIZE / 2  // 11
const CONNECTOR_HEIGHT = 3
const CONNECTOR_OFFSET = (NODE_SIZE - CONNECTOR_HEIGHT) / 2  // vertically center connector on node

const TERMINAL_STATES = ['ok', 'failed', 'skipped', 'cancelled']

function deriveStepStatuses(ps: PipelineStatus | null): Record<PipelinePhaseStep, StepStatus> {
  const s: Record<PipelinePhaseStep, StepStatus> = {
    fetch: 'pending',
    retry: 'pending',
    summary: 'pending',
    briefing: 'pending',
    intelligence: 'pending',
  }

  if (!ps) return s

  const events = ps.events ?? []

  // Fetch phase
  const fetchStates = ps.sensors.map(sen => sen.fetch)
  const anyFetching = fetchStates.some(f => f === 'running')
  const anyFetchQueued = fetchStates.some(f => f === 'queued')
  const allFetchTerminal = fetchStates.every(f => TERMINAL_STATES.includes(f))
  const anyFetchFailed = fetchStates.some(f => f === 'failed')

  if (ps.mode === 'summarize') {
    s.fetch = 'skipped'
  } else if (anyFetching || anyFetchQueued) {
    s.fetch = 'active'
  } else if (allFetchTerminal && fetchStates.length > 0) {
    s.fetch = anyFetchFailed ? 'error' : 'done'
  }

  // Retry phase
  if (ps.retry_attempt > 0) {
    s.retry = 'active'
  } else if (s.fetch === 'done' || s.fetch === 'error') {
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

  if (ps.mode === 'fetch') {
    s.summary = 'skipped'
  } else if (anySummaryRunning || anySummaryQueued) {
    s.summary = 'active'
  } else if (allSummaryTerminal && summaryStates.length > 0) {
    s.summary = anySummaryFailed ? 'error' : 'done'
  }

  // Briefing (overall summary)
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

  // Intelligence
  const intelEvents = events.filter(e => e.phase === 'intelligence')
  if (ps.mode === 'fetch') {
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

  // Fetch: fraction of non-skipped sensors in terminal state
  const fetchActive = ps.sensors.filter(s => s.fetch !== 'skipped')
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

const STEP_COLORS: Record<StepStatus, { dot: string; label: string }> = {
  pending: { dot: 'var(--border)', label: 'var(--ink-faint)' },
  active: { dot: 'var(--accent)', label: 'var(--accent)' },
  done: { dot: 'var(--ok)', label: 'var(--ink-muted)' },
  error: { dot: 'var(--err)', label: 'var(--err)' },
  skipped: { dot: 'var(--border)', label: 'var(--ink-faint)' },
}

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '',
  active: '●',
  done: '✓',
  error: '✕',
  skipped: '–',
}

// CSS for the indeterminate shimmer and branch grow animations
const STEPPER_CSS = `
@keyframes stepperShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
@keyframes branchGrow {
  from { max-height: 0; opacity: 0; }
  to { max-height: 100px; opacity: 1; }
}
`

/** Shared node (circle + label) used by both the main line and the retry branch. */
function StepNode({ step, status, isClickable, onLogToggle, t }: {
  step: StepDef
  status: StepStatus
  isClickable: boolean
  onLogToggle?: () => void
  t: (key: string) => string
}) {
  const colors = STEP_COLORS[status]
  const icon = STEP_ICONS[status]

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onLogToggle : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onLogToggle!() } : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.25rem',
        flexShrink: 0,
        position: 'relative',
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: '50%',
        border: `2px solid ${colors.dot}`,
        background: status === 'active' ? colors.dot : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.625rem',
        fontWeight: 700,
        color: status === 'active' ? 'white' : colors.dot,
        transition: 'all 300ms ease',
        ...(status === 'active' ? {
          boxShadow: `0 0 0 3px color-mix(in srgb, ${colors.dot} 20%, transparent)`,
        } : {}),
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: '0.5625rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: colors.label,
        whiteSpace: 'nowrap',
      }}>
        {t(step.labelKey)}
      </span>
    </div>
  )
}

/** Retry branch rendered below the main line between fetch and summary nodes. */
function RetryBranch({ retryStatus, isClickable, onLogToggle, t, segmentWidthPct }: {
  retryStatus: StepStatus
  isClickable: boolean
  onLogToggle?: () => void
  t: (key: string) => string
  segmentWidthPct: number
}) {
  const dropHeight = 20
  const borderColor = 'var(--border)'

  // Branch fill colors and percentages based on retry status
  const branchFillColor = retryStatus === 'done' ? 'var(--ok)'
    : retryStatus === 'active' ? 'var(--accent)'
    : retryStatus === 'error' ? 'var(--err)'
    : 'transparent'
  const branchFillPct = retryStatus === 'done' || retryStatus === 'error' ? 100 : 0
  const branchIndeterminate = retryStatus === 'active'

  return (
    <div style={{
      width: `${segmentWidthPct}%`,
      animation: 'branchGrow 300ms ease forwards',
      overflow: 'hidden',
    }}>
      {/* Vertical connectors + horizontal branch row */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
      }}>
        {/* Left vertical drop (┐ shape: border-left + border-bottom) */}
        <div style={{
          width: '50%',
          height: dropHeight,
          borderLeft: `2px solid ${borderColor}`,
          borderBottom: `2px solid ${borderColor}`,
          borderRadius: '0 0 0 6px',
          marginLeft: NODE_CENTER, // Center of fetch node
          boxSizing: 'border-box',
        }} />
        {/* Right vertical rise (┌ shape: border-right + border-bottom) */}
        <div style={{
          width: '50%',
          height: dropHeight,
          borderRight: `2px solid ${borderColor}`,
          borderBottom: `2px solid ${borderColor}`,
          borderRadius: '0 0 6px 0',
          marginRight: NODE_CENTER, // Center of summary node
          boxSizing: 'border-box',
        }} />
      </div>

      {/* Horizontal branch line with retry node in the center */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '4px 0 0',
      }}>
        {/* Left horizontal connector (fetch → retry) */}
        <div style={{
          flex: '1 1 0',
          height: CONNECTOR_HEIGHT,
          background: 'var(--border)',
          opacity: 0.4,
          marginTop: CONNECTOR_OFFSET,
          minWidth: 8,
          borderRadius: 2,
          position: 'relative',
          overflow: 'hidden',
          marginLeft: NODE_CENTER,
        }}>
          {/* Determinate fill */}
          {!branchIndeterminate && branchFillPct > 0 && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${branchFillPct}%`,
              background: branchFillColor,
              borderRadius: 2,
              opacity: 1 / 0.4,
              transition: 'width 500ms ease',
            }} />
          )}
          {/* Indeterminate shimmer */}
          {branchIndeterminate && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '50%',
              background: `linear-gradient(90deg, transparent, var(--accent), transparent)`,
              borderRadius: 2,
              opacity: 1 / 0.4,
              animation: 'stepperShimmer 1.5s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* Retry node */}
        <StepNode
          step={BRANCH_STEP}
          status={retryStatus}
          isClickable={isClickable}
          onLogToggle={onLogToggle}
          t={t}
        />

        {/* Right horizontal connector (retry → summary) */}
        <div style={{
          flex: '1 1 0',
          height: CONNECTOR_HEIGHT,
          background: 'var(--border)',
          opacity: 0.4,
          marginTop: CONNECTOR_OFFSET,
          minWidth: 8,
          borderRadius: 2,
          position: 'relative',
          overflow: 'hidden',
          marginRight: NODE_CENTER,
        }}>
          {/* Determinate fill */}
          {!branchIndeterminate && branchFillPct > 0 && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${branchFillPct}%`,
              background: branchFillColor,
              borderRadius: 2,
              opacity: 1 / 0.4,
              transition: 'width 500ms ease',
            }} />
          )}
          {/* Indeterminate shimmer — right leg stays dim when active */}
        </div>
      </div>
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

  const visibleSteps = MAIN_STEPS.filter(step => statuses[step.key] !== 'skipped')
  const hasEvents = (pipelineStatus?.events ?? []).length > 0

  // Branch visibility: show when retry is active, done, or error
  const retryStatus = statuses.retry
  const showBranch = retryStatus === 'active' || retryStatus === 'done' || retryStatus === 'error'

  // Branch width spans the first segment of the main line
  const segmentWidthPct = visibleSteps.length > 1 ? 100 / (visibleSteps.length - 1) : 100

  if (visibleSteps.length === 0) return null

  return (
    <>
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
            const phaseProg = progress[step.key]
            const isClickable = hasEvents && status !== 'pending' && !!onLogToggle

            // Line color logic: done=green filled, active=accent partial fill, else dim track
            const lineFillColor = status === 'done' ? 'var(--ok)'
              : status === 'active' ? 'var(--accent)'
              : status === 'error' ? 'var(--err)'
              : 'transparent'
            const lineFillPct = status === 'done' || status === 'error' ? 100
              : status === 'active' ? (phaseProg === -1 ? 0 : Math.round(phaseProg * 100))
              : 0
            const isIndeterminate = status === 'active' && phaseProg === -1

            // When branch is visible, suppress the first connector fill (fetch→summary)
            // because the flow goes through the branch instead
            const suppressFill = showBranch && i === 0

            return (
              <div key={step.key} style={{
                display: 'flex',
                alignItems: 'flex-start',
                flex: isLast ? '0 0 auto' : '1 1 0',
                minWidth: 0,
              }}>
                {/* Step circle + label */}
                <StepNode
                  step={step}
                  status={status}
                  isClickable={isClickable}
                  onLogToggle={onLogToggle}
                  t={t}
                />

                {/* Connector line with progress fill */}
                {!isLast && (
                  <div style={{
                    flex: '1 1 0',
                    height: CONNECTOR_HEIGHT,
                    background: 'var(--border)',
                    opacity: 0.4,
                    marginTop: CONNECTOR_OFFSET,
                    minWidth: 12,
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Determinate fill — suppressed on first connector when branch is shown */}
                    {!suppressFill && !isIndeterminate && lineFillPct > 0 && (
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
                    {/* Indeterminate shimmer — suppressed on first connector when branch is shown */}
                    {!suppressFill && isIndeterminate && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: '50%',
                        background: `linear-gradient(90deg, transparent, var(--accent), transparent)`,
                        borderRadius: 2,
                        opacity: 1 / 0.4,
                        animation: 'stepperShimmer 1.5s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Retry branch — rendered below the main line */}
        {showBranch && (
          <RetryBranch
            retryStatus={retryStatus}
            isClickable={hasEvents && retryStatus !== 'pending' && !!onLogToggle}
            onLogToggle={onLogToggle}
            t={t}
            segmentWidthPct={segmentWidthPct}
          />
        )}
      </div>
    </>
  )
}
