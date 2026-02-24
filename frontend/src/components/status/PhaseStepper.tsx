// ABOUTME: Pipeline phase stepper — horizontal visual indicator of pipeline workflow phases.
// ABOUTME: Shows fetch → retry → summarize → briefing → intelligence as connected step circles.
'use client'

import type { PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export type PipelinePhaseStep = 'fetch' | 'retry' | 'summary' | 'briefing' | 'intelligence'
type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'

interface StepDef {
  key: PipelinePhaseStep
  labelKey: string
}

const STEPS: StepDef[] = [
  { key: 'fetch', labelKey: 'log.phase_fetch' },
  { key: 'retry', labelKey: 'log.phase_retry' },
  { key: 'summary', labelKey: 'log.phase_summary' },
  { key: 'briefing', labelKey: 'log.phase_briefing' },
  { key: 'intelligence', labelKey: 'log.phase_intelligence' },
]

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
  const allFetchTerminal = fetchStates.every(f => ['ok', 'failed', 'skipped', 'cancelled'].includes(f))
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
    // Retries have either completed or were not needed
    const hadRetryEvents = events.some(e => e.phase === 'retry')
    s.retry = hadRetryEvents ? 'done' : 'skipped'
  } else if (s.fetch === 'skipped') {
    s.retry = 'skipped'
  }

  // Summary phase
  const summaryStates = ps.sensors.map(sen => sen.summary)
  const anySummaryRunning = summaryStates.some(su => su === 'running')
  const anySummaryQueued = summaryStates.some(su => su === 'queued')
  const allSummaryTerminal = summaryStates.every(su => ['ok', 'failed', 'skipped', 'cancelled'].includes(su))
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
    // Highlight whatever stage is paused
    if (ps.paused_stage === 'pre_overall') {
      s.briefing = 'active'
    }
  }

  return s
}

const STEP_COLORS: Record<StepStatus, { dot: string; label: string; line: string }> = {
  pending: { dot: 'var(--border)', label: 'var(--ink-faint)', line: 'var(--border)' },
  active: { dot: 'var(--accent)', label: 'var(--accent)', line: 'var(--accent)' },
  done: { dot: 'var(--ok)', label: 'var(--ink-muted)', line: 'var(--ok)' },
  error: { dot: 'var(--err)', label: 'var(--err)', line: 'var(--err)' },
  skipped: { dot: 'var(--border)', label: 'var(--ink-faint)', line: 'var(--border)' },
}

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '',
  active: '●',
  done: '✓',
  error: '✕',
  skipped: '–',
}

interface PipelinePhaseStepperProps {
  pipelineStatus: PipelineStatus | null
}

export function PhaseStepper({ pipelineStatus }: PipelinePhaseStepperProps) {
  const { t } = useTranslation()
  const statuses = deriveStepStatuses(pipelineStatus)

  // Filter out skipped steps for cleaner display
  const visibleSteps = STEPS.filter(step => statuses[step.key] !== 'skipped')

  if (visibleSteps.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '0.5rem 0',
      overflow: 'hidden',
    }}>
      {visibleSteps.map((step, i) => {
        const status = statuses[step.key]
        const colors = STEP_COLORS[status]
        const icon = STEP_ICONS[status]
        const isLast = i === visibleSteps.length - 1

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Step circle + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${colors.dot}`,
                background: status === 'active' ? colors.dot : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.5625rem',
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

            {/* Connector line */}
            {!isLast && (
              <div style={{
                width: 32,
                height: 2,
                background: colors.line,
                opacity: status === 'done' ? 1 : 0.3,
                margin: '0 0.25rem',
                marginBottom: '1.125rem',
                transition: 'opacity 300ms ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
