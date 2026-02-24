// ABOUTME: Sidebar navigation component for Intel Briefing.
// ABOUTME: Uses Next.js Link and usePathname for client-side routing; mini phase stepper and language selector.
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, PipelineStatus, SummaryProgress } from '@/api/client'
import { usePolling } from '@/lib/hooks/usePolling'
import { useTranslation, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n'
import { deriveStepStatuses, MAIN_STEPS, STEP_COLORS } from './status/PhaseStepper'
import type { StepStatus } from './status/PhaseStepper'

/** Nav item config keys for i18n. */
const CONFIG_NAV: { href: string; labelKey: string }[] = [
  { href: '/sources',     labelKey: 'nav.sources' },
  { href: '/pipeline',    labelKey: 'nav.pipeline' },
  { href: '/ai',          labelKey: 'nav.ai_summary' },
  { href: '/connections', labelKey: 'nav.credentials' },
]

function NavLink({ href, active, onClick, children }: { href: string; active: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 1.75rem',
        minHeight: 44,
        width: '100%',
        borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
        color: active ? 'var(--sb-ink)' : 'var(--sb-muted)',
        fontSize: '0.875rem',
        fontWeight: active ? 500 : 400,
        textDecoration: 'none',
        transition: 'color 120ms, border-color 120ms',
      }}
    >
      {children}
    </Link>
  )
}

function SideLabel({ children }: { children: ReactNode }) {
  return (
    <div className="sidebar-label" style={{
      padding: '0 1.75rem 0.375rem',
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--sb-faint)',
    }}>
      {children}
    </div>
  )
}

function SideDivider() {
  return <div className="sidebar-divider" style={{ height: 1, background: 'var(--sb-border)', margin: '0.625rem 1.75rem 0.875rem' }} />
}


const MINI_NODE = 6
const MINI_CONNECTOR_H = 2
const LABEL_GAP = 12 // vertical space occupied by the label below each node

/** Fading transition line indicating more stages exist in that direction. */
function TransitionLine({ direction }: { direction: 'left' | 'right' }) {
  const gradient = direction === 'right'
    ? 'linear-gradient(to right, var(--sb-border), transparent)'
    : 'linear-gradient(to left, var(--sb-border), transparent)'
  return (
    <div style={{
      flex: '1 1 0',
      height: MINI_CONNECTOR_H,
      background: gradient,
      borderRadius: 1,
      minWidth: 12,
      marginBottom: LABEL_GAP,
    }} />
  )
}

/** Single mini stepper node — dot + label. */
function MiniNode({ step, status, align = 'center', t }: { step: { labelKey: string }; status: StepStatus; align?: 'start' | 'center' | 'end'; t: (k: string) => string }) {
  const colors = STEP_COLORS[status]
  const isActive = status === 'active'
  const alignItems = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems, gap: 2, flexShrink: 0 }}>
      <div style={{
        width: MINI_NODE,
        height: MINI_NODE,
        borderRadius: '50%',
        border: `1.5px solid ${colors.dot}`,
        background: isActive ? colors.dot : 'transparent',
        transition: 'all 300ms ease',
        ...(isActive ? { boxShadow: `0 0 0 2px color-mix(in srgb, ${colors.dot} 20%, transparent)` } : {}),
      }} />
      <span style={{
        fontSize: '0.4375rem',
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

/** Compact pipeline phase stepper — shows 2 active nodes with contextual alignment. */
function MiniStepper({ pipelineStatus, t }: { pipelineStatus: PipelineStatus | null; t: (k: string) => string }) {
  const statuses = deriveStepStatuses(pipelineStatus)
  const visible = MAIN_STEPS.filter(s => statuses[s.key] !== 'skipped')
  if (visible.length === 0) return null

  // Find the focus: first active step, or last done step, or 0
  let focus = visible.findIndex(s => statuses[s.key] === 'active')
  if (focus < 0) {
    const lastDone = visible.map((s, i) => statuses[s.key] === 'done' ? i : -1).filter(i => i >= 0).pop()
    focus = lastDone != null ? lastDone : 0
  }

  const windowSteps = visible.slice(focus, focus + 2)
  const isAtStart = focus === 0
  const isAtEnd = focus + windowSteps.length >= visible.length

  // Alignment: left when at start, right when at end, stretch when in middle
  const justify = isAtStart && !isAtEnd ? 'flex-start'
    : !isAtStart && isAtEnd ? 'flex-end'
    : !isAtStart && !isAtEnd ? 'stretch'
    : 'flex-start' // both start+end (2 or fewer visible steps)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: justify,
      gap: 0,
      marginTop: '0.5rem',
    }}>
      {/* Leading transition line — stages exist before the window */}
      {!isAtStart && <TransitionLine direction="left" />}

      {windowSteps.map((step, i) => {
        const status: StepStatus = statuses[step.key]
        const isFirst = i === 0
        const isLast = i === windowSteps.length - 1
        const nodeAlign = isFirst && isAtStart ? 'start' : isLast && isAtEnd ? 'end' : 'center'
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <MiniNode step={step} status={status} align={nodeAlign} t={t} />
            {!isLast && (
              <div style={{
                width: 16,
                height: MINI_CONNECTOR_H,
                background: 'var(--sb-border)',
                borderRadius: 1,
                margin: '0 3px',
                marginBottom: LABEL_GAP,
                flexShrink: 0,
              }} />
            )}
          </div>
        )
      })}

      {/* Trailing transition line — stages exist after the window */}
      {!isAtEnd && <TransitionLine direction="right" />}
    </div>
  )
}

interface Props {
  onNavigate?: () => void
  onCollapse?: () => void
  collapsed?: boolean
}

export function Sidebar({ onNavigate, onCollapse, collapsed }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { t, locale, setLocale } = useTranslation()
  const health = usePolling<HealthResponse>(() => api.health(), 30_000)
  const pipelineStatus = usePolling<PipelineStatus>(() => api.getPipelineStatus(), 5_000)
  const summaryProgress = usePolling<SummaryProgress>(() => api.getSummaryStatus(), 5_000)

  const hasErrors = (pipelineStatus?.sensors.some(s => s.fetch_error !== null || s.summary_error !== null)) ?? false
  const runId = pipelineStatus?.completed_at ?? pipelineStatus?.started_at ?? ''

  // Track which pipeline run the user last viewed on /status via server-side KV store.
  // Badge shows when errors exist for a run the user hasn't seen yet.
  const [seenRun, setSeenRun] = useState<string | null>(null)
  const onStatusPage = pathname === '/status'

  useEffect(() => {
    api.getConsoleSeen().then(r => setSeenRun(r.runId)).catch(() => {})
  }, [])

  useEffect(() => {
    if (onStatusPage && hasErrors && runId) {
      api.setConsoleSeen(runId).then(() => setSeenRun(runId)).catch(() => {})
    }
  }, [onStatusPage, hasErrors, runId])

  const isJobRunning = !!(pipelineStatus?.running || summaryProgress?.running)
  const showBadge = hasErrors && !!runId && runId !== seenRun

  // Track whether the dashboard has unviewed data.
  // Dashboard writes its report.fetched_at to localStorage; we compare against health.last_fetch.
  const [lastViewedFetch, setLastViewedFetch] = useState<string | null>(null)
  const onDashboard = pathname === '/dashboard'

  // Re-read localStorage on mount, navigation, and health updates to stay in sync.
  // pathname ensures we pick up what Dashboard wrote when navigating away.
  // health?.last_fetch ensures we detect new runs even while on a non-dashboard page.
  useEffect(() => {
    try { setLastViewedFetch(localStorage.getItem('ib:dashboard:lastViewedFetch')) } catch {}
  }, [health?.last_fetch, pathname])

  const hasNewBriefing = !onDashboard
    && !!health?.last_fetch
    && lastViewedFetch !== null
    && health.last_fetch !== lastViewedFetch

  // Show mini stepper when pipeline is actively running
  const showStepper = isJobRunning && !!pipelineStatus

  const statusColor =
    !health                      ? 'var(--ink-faint)' :
    health.status === 'ok'       ? 'var(--ok)'        :
    health.status === 'stale'    ? 'var(--warn)'      :
    health.status === 'no_data'  ? 'var(--ink-faint)' :
    'var(--err)'

  const statusLabel = health
    ? `${t('health.' + health.status)}${health.last_fetch ? ' · ' + health.last_fetch.slice(0, 16).replace('T', ' ') : ''}`
    : t('sidebar.loading')

  return (
    <nav className="sidebar-nav" style={{
      width: 240,
      background: 'var(--sb)',
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      overflowY: 'auto',
      flexShrink: 0,
      borderRight: '1px solid var(--sb-border)',
    }}>
      {/* Brand — status row links to /status */}
      <div className="sidebar-brand" style={{ padding: '2rem 1.75rem 1.5rem' }}>
        <div style={{
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--sb-ink)',
          marginBottom: '0.5rem',
        }}>
          {t('app.title')}
        </div>
        <div
          role="link"
          tabIndex={0}
          onClick={() => { router.push('/status'); onNavigate?.() }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { router.push('/status'); onNavigate?.() } }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        >
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: isJobRunning ? 'var(--accent)' : statusColor,
            flexShrink: 0,
            transition: 'background 400ms',
            animation: isJobRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: '0.5625rem',
            color: 'var(--sb-muted)',
            fontFamily: 'ui-monospace, monospace',
            letterSpacing: '0.02em',
          }}>
            {statusLabel}
          </span>
        </div>
        {/* Mini phase stepper — visible only when pipeline is running */}
        {showStepper && <MiniStepper pipelineStatus={pipelineStatus} t={t} />}
      </div>

      <div className="sidebar-brand-divider" style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

      {/* Nav */}
      <div style={{ flex: 1, padding: '1rem 0' }}>
        <SideLabel>{t('nav.overview')}</SideLabel>
        <NavLink href="/dashboard" active={pathname === '/dashboard'} onClick={onNavigate}>
          {t('nav.dashboard')}
          {hasNewBriefing && (
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--sb-accent)',
              marginLeft: 'auto',
              flexShrink: 0,
              animation: 'pulseDot 1.6s ease-in-out infinite',
            }} />
          )}
        </NavLink>
        <NavLink href="/status" active={pathname === '/status'} onClick={onNavigate}>
          {t('nav.status')}
          {showBadge && (
            <span style={{
              fontSize: '0.5rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--err)',
              marginLeft: 'auto',
            }}>
              {t('nav.errors')}
            </span>
          )}
        </NavLink>
        <NavLink href="/data" active={pathname === '/data'} onClick={onNavigate}>
          {t('nav.feed')}
        </NavLink>

        <SideDivider />

        <SideLabel>{t('nav.config')}</SideLabel>
        {CONFIG_NAV.map(({ href, labelKey }) => (
          <NavLink key={href} href={href} active={pathname === href} onClick={onNavigate}>
            {t(labelKey)}
          </NavLink>
        ))}

      </div>

      {/* Language selector — sidebar footer */}
      <div style={{
        padding: '0.75rem 1.75rem',
        borderTop: '1px solid var(--sb-border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--sb-faint)',
          }}>
            {t('sidebar.language')}
          </span>
          <select
            value={locale}
            onChange={e => setLocale(e.target.value as Locale)}
            style={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--sb-ink)',
              background: 'var(--sb)',
              border: '1px solid var(--sb-border)',
              borderRadius: 4,
              padding: '2px 4px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {SUPPORTED_LOCALES.map(loc => (
              <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Collapse toggle — desktop only */}
      {onCollapse && (
        <button
          className="sidebar-collapse-btn"
          onClick={onCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.625rem 1.75rem',
            background: 'none',
            border: 'none',
            borderTop: '1px solid var(--sb-border)',
            color: 'var(--sb-faint)',
            cursor: 'pointer',
            width: '100%',
            transition: 'color 150ms ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <line x1="5.5" y1="1" x2="5.5" y2="15" />
            <polyline points={collapsed ? '8,6 11,8 8,10' : '11,6 8,8 11,10'} />
          </svg>
        </button>
      )}
    </nav>
  )
}
