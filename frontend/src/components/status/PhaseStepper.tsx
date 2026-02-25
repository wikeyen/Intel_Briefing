// ABOUTME: Pipeline phase stepper — horizontal visual indicator of pipeline workflow phases.
// ABOUTME: Shows fetch → summary → briefing → intel main line with retry as a git-tree branch below.
'use client'

import type { PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export type PipelinePhaseStep = 'fetch' | 'retry' | 'summary' | 'briefing' | 'intelligence'
export type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'

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
const BRANCH_STEP: StepDef = { key: 'retry', labelKey: 'log.phase_retry' }

const NODE_SIZE = 16
const NODE_CENTER = NODE_SIZE / 2  // 8
const CONNECTOR_HEIGHT = 4
const CONNECTOR_OFFSET = (NODE_SIZE - CONNECTOR_HEIGHT) / 2  // vertically center connector on node

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '',
  active: '●',
  done: '✓',
  error: '✕',
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

  // Summary phase — if briefing has already started, summary must be complete
  const briefingStarted = s.briefing === 'active' || s.briefing === 'done' || s.briefing === 'error'
  if (ps.mode === 'fetch') {
    s.summary = 'skipped'
  } else if (briefingStarted) {
    // Briefing can only start after per-sensor summaries finish. If any sensor's
    // summary state is non-terminal (e.g. stale 'queued' from a failed retry), the
    // pipeline has moved past it — treat summary phase as done/error.
    s.summary = anySummaryFailed ? 'error' : 'done'
  } else if (anySummaryRunning || anySummaryQueued) {
    s.summary = 'active'
  } else if (allSummaryTerminal && summaryStates.length > 0) {
    s.summary = anySummaryFailed ? 'error' : 'done'
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

/** Derive count annotations for fetch and retry nodes. */
function derivePhaseCounts(ps: PipelineStatus | null): Record<string, { ok: number; total: number } | null> {
  if (!ps) return { fetch: null, retry: null }

  // Fetch counts: sensors with fetch='ok' vs total non-skipped
  const fetchActive = ps.sensors.filter(s => s.fetch !== 'skipped')
  const fetchOk = fetchActive.filter(s => s.fetch === 'ok').length
  const fetchTotal = fetchActive.length
  const fetchCount = fetchTotal > 0 ? { ok: fetchOk, total: fetchTotal } : null

  // Retry counts: derive from retry events (ok vs error)
  const retryEvents = (ps.events ?? []).filter(e => e.phase === 'retry')
  const retryOk = retryEvents.filter(e => e.level === 'ok').length
  const retryFail = retryEvents.filter(e => e.level === 'error').length
  const retryTotal = retryOk + retryFail
  const retryCount = retryTotal > 0 ? { ok: retryOk, total: retryTotal } : null

  return { fetch: fetchCount, retry: retryCount }
}

export const STEP_COLORS: Record<StepStatus, { dot: string; label: string }> = {
  pending: { dot: 'var(--border)', label: 'var(--ink-faint)' },
  active: { dot: 'var(--accent)', label: 'var(--accent)' },
  done: { dot: 'var(--ok)', label: 'var(--ink-muted)' },
  error: { dot: 'var(--err)', label: 'var(--err)' },
  skipped: { dot: 'var(--border)', label: 'var(--ink-faint)' },
}

// CSS for the shimmer and branch grow animations
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

/** Circle node with icon + label + optional count annotation. */
function StepNode({ step, status, isClickable, onLogToggle, t, counts }: {
  step: StepDef
  status: StepStatus
  isClickable: boolean
  onLogToggle?: () => void
  t: (key: string) => string
  counts?: { ok: number; total: number } | null
}) {
  const colors = STEP_COLORS[status]
  const icon = STEP_ICONS[status]
  const showCounts = counts && counts.total > 0 && status !== 'pending'

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
        background: (status === 'done' || status === 'error') ? colors.dot : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.5rem',
        fontWeight: 700,
        color: (status === 'done' || status === 'error') ? 'white' : colors.dot,
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
      {/* Count annotation (e.g. "22/24") */}
      {showCounts && (
        <span style={{
          fontSize: '0.5rem',
          fontFamily: 'ui-monospace, monospace',
          fontWeight: 500,
          color: counts.ok === counts.total ? 'var(--ok)' : 'var(--err)',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          marginTop: '-0.0625rem',
        }}>
          {counts.ok}/{counts.total}
        </span>
      )}
    </div>
  )
}

/** Retry branch rendered below the main line between fetch and summary nodes. */
function RetryBranch({ retryStatus, isClickable, onLogToggle, t, segmentWidthPct, counts }: {
  retryStatus: StepStatus
  isClickable: boolean
  onLogToggle?: () => void
  t: (key: string) => string
  segmentWidthPct: number
  counts?: { ok: number; total: number } | null
}) {
  const dropHeight = 18
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
      {/* Vertical drop lines from main line into branch */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
      }}>
        {/* Left vertical drop */}
        <div style={{
          width: '50%',
          height: dropHeight,
          borderLeft: `3px solid ${borderColor}`,
          marginLeft: NODE_CENTER,
          boxSizing: 'border-box',
        }} />
        {/* Right vertical drop */}
        <div style={{
          width: '50%',
          height: dropHeight,
          borderRight: `3px solid ${borderColor}`,
          marginRight: NODE_CENTER,
          boxSizing: 'border-box',
        }} />
      </div>

      {/* Horizontal branch line with retry node in the center */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
      }}>
        {/* Left horizontal connector (fetch -> retry) */}
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
              width: '33%',
              background: `linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)`,
              borderRadius: 2,
              opacity: 1 / 0.4,
              animation: 'stepperShimmer 1.2s ease-in-out infinite',
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
          counts={counts}
        />

        {/* Right horizontal connector (retry -> summary) */}
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
          {/* Indeterminate shimmer — right leg */}
          {branchIndeterminate && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '33%',
              background: `linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)`,
              borderRadius: 2,
              opacity: 1 / 0.4,
              animation: 'stepperShimmer 1.2s ease-in-out infinite',
            }} />
          )}
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
  const counts = derivePhaseCounts(pipelineStatus)

  const visibleSteps = MAIN_STEPS.filter(step => statuses[step.key] !== 'skipped')
  const hasEvents = (pipelineStatus?.events ?? []).length > 0

  // Branch visibility: show only during active retries or when retries failed.
  // Successful retries (done) and skipped retries stay hidden to reduce noise.
  const retryStatus = statuses.retry
  const showBranch = retryStatus === 'active' || retryStatus === 'error'

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
            const isActive = status === 'active'

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
              // Show current step's completion state
              lineFillColor = status === 'done' ? 'var(--ok)'
                : status === 'error' ? 'var(--err)'
                : 'transparent'
              isIndeterminate = false
              lineFillPct = (status === 'done' || status === 'error') ? 100 : 0
            }

            const showShimmer = nextIsActive

            // Phase-specific counts (only fetch gets annotation on main line)
            const stepCounts = step.key === 'fetch' ? counts.fetch : null

            return (
              <div key={step.key} style={{
                display: 'flex',
                alignItems: 'flex-start',
                flex: isLast ? '0 0 auto' : '1 1 0',
                minWidth: 0,
              }}>
                {/* Step node with optional count */}
                <StepNode
                  step={step}
                  status={status}
                  isClickable={isClickable}
                  onLogToggle={onLogToggle}
                  t={t}
                  counts={stepCounts}
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
                        width: isIndeterminate ? '100%' : `${lineFillPct}%`,
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
            counts={counts.retry}
          />
        )}
      </div>
    </>
  )
}
