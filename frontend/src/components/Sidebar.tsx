// ABOUTME: Sidebar navigation component for Intel Briefing.
// ABOUTME: Uses Next.js Link and usePathname for client-side routing; mini phase stepper, icons, and collapse/pin support.
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Activity,
  Rss,
  Database,
  Workflow,
  Sparkles,
  KeyRound,
  Globe,
  Pin,
  PinOff,
} from 'lucide-react'
import { api } from '@/api/client'
import type { HealthResponse, PipelineStatus, SummaryProgress } from '@/api/client'
import { usePolling } from '@/lib/hooks/usePolling'
import { useTranslation, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n'
import { deriveStepStatuses, MAIN_STEPS, STEP_COLORS } from './status/PhaseStepper'
import type { StepStatus } from './status/PhaseStepper'

/** Shared easing matching the sidebar width transition in globals.css. */
const SB_EASE = '250ms cubic-bezier(0.4, 0, 0.2, 1)'

/** Icon mapping for config nav items by href. */
const CONFIG_ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  '/sources': Database,
  '/pipeline': Workflow,
  '/ai': Sparkles,
  '/connections': KeyRound,
}

/** Nav item config keys for i18n. */
const CONFIG_NAV: { href: string; labelKey: string }[] = [
  { href: '/sources',     labelKey: 'nav.sources' },
  { href: '/pipeline',    labelKey: 'nav.pipeline' },
  { href: '/ai',          labelKey: 'nav.ai_summary' },
  { href: '/connections', labelKey: 'nav.credentials' },
]

function NavLink({ href, active, onClick, collapsed, title, children }: {
  href: string
  active: boolean
  onClick?: () => void
  collapsed?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? title : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: collapsed ? '0.5rem 0 0.5rem 1rem' : '0.5rem 1.75rem 0.5rem 1rem',
        justifyContent: 'flex-start',
        minHeight: 44,
        width: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
        color: active ? 'var(--sb-ink)' : 'var(--sb-muted)',
        fontSize: '0.875rem',
        fontWeight: active ? 500 : 400,
        textDecoration: 'none',
        transition: `padding ${SB_EASE}, color 120ms, border-color 120ms`,
      }}
    >
      {children}
    </Link>
  )
}

function SideLabel({ children, collapsed }: { children: ReactNode; collapsed?: boolean }) {
  return (
    <div className="sidebar-label" style={{
      padding: '0 1.75rem 0.375rem',
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--sb-faint)',
      opacity: collapsed ? 0 : 1,
      transition: `opacity ${SB_EASE}`,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function SideDivider({ collapsed }: { collapsed?: boolean }) {
  return (
    <div
      className="sidebar-divider"
      style={{
        height: 1,
        background: 'var(--sb-border)',
        margin: collapsed ? '0.625rem 0.75rem 0.875rem' : '0.625rem 1.75rem 0.875rem',
        transition: `margin ${SB_EASE}`,
      }}
    />
  )
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
        ...(isActive ? { boxShadow: `0 0 0 2px color-mix(in srgb, ${colors.dot} 20%, transparent)`, animation: 'pulseDot 1.6s ease-in-out infinite' } : {}),
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
  collapsed?: boolean
  peeking?: boolean
  pinned?: boolean
  onPinToggle?: () => void
}

export function Sidebar({ onNavigate, collapsed, peeking, pinned, onPinToggle }: Props) {
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

  const statusFg =
    !health                      ? 'var(--sb-muted)' :
    health.status === 'ok'       ? 'color-mix(in srgb, var(--ok) 80%, white)'   :
    health.status === 'stale'    ? 'color-mix(in srgb, var(--warn) 80%, white)' :
    health.status === 'no_data'  ? 'var(--sb-muted)' :
    'color-mix(in srgb, var(--err) 80%, white)'

  const statusWord = health ? t('health.' + health.status) : t('sidebar.loading')
  const statusTimestamp = health?.last_fetch ? health.last_fetch.slice(0, 16).replace('T', ' ') : null

  const PinIcon = pinned ? PinOff : Pin
  const txtStyle: React.CSSProperties = { opacity: collapsed ? 0 : 1, transition: `opacity ${SB_EASE}` }

  return (
    <nav className={`sidebar-nav${peeking ? ' sidebar-peeking' : ''}`} style={{
      background: 'var(--sb)',
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      overflowY: 'auto',
      flexShrink: 0,
      borderRight: '1px solid var(--sb-border)',
    }}>
      {/* Brand — status row links to /status */}
      <div className="sidebar-brand" style={{
        padding: collapsed ? '1rem 0.75rem 0.75rem' : '2rem 1.75rem 1.5rem',
        height: 102,
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: `padding ${SB_EASE}`,
        overflow: 'hidden',
      }}>
        {collapsed ? (
          /* Collapsed brand: status-colored Activity icon — matches nav icon pattern */
          <div
            role="link"
            tabIndex={0}
            onClick={() => { router.push('/status'); onNavigate?.() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { router.push('/status'); onNavigate?.() } }}
            title={statusWord}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: statusFg,
              transition: 'color 300ms',
              ...(isJobRunning ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : {}),
            }}
          >
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect x="7" y="20" width="4" height="5" rx="1" fill="currentColor" />
              <rect x="13" y="15" width="4" height="10" rx="1" fill="currentColor" />
              <rect x="19" y="10" width="4" height="15" rx="1" fill="currentColor" />
              <rect x="25" y="7" width="4" height="18" rx="1" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        ) : (
          /* Expanded brand: full title, status, stepper, pin button */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              {onPinToggle && (
                <button
                  className="sidebar-pin-btn"
                  onClick={onPinToggle}
                  aria-label={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    color: 'var(--sb-faint)',
                    cursor: 'pointer',
                    transition: 'color 150ms',
                    marginBottom: '0.25rem',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sb-ink)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sb-faint)' }}
                >
                  <PinIcon size={16} strokeWidth={1.5} />
                </button>
              )}
            </div>
            <div
              role="link"
              tabIndex={0}
              onClick={() => { router.push('/status'); onNavigate?.() }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { router.push('/status'); onNavigate?.() } }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.5625rem',
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '0.02em',
              }}
            >
              <span style={{
                color: statusFg,
                fontWeight: 600,
                transition: 'color 300ms',
              }}>
                {statusWord}
              </span>
              {statusTimestamp && (
                <span style={{ color: 'var(--sb-muted)' }}>
                  {statusTimestamp}
                </span>
              )}
            </div>
            {/* Mini phase stepper — visible only when pipeline is running */}
            {showStepper && <MiniStepper pipelineStatus={pipelineStatus} t={t} />}
          </>
        )}
      </div>

      <div className="sidebar-brand-divider" style={{ height: 1, background: 'var(--sb-border)', margin: collapsed ? '0 0.75rem' : '0 1.75rem', transition: `margin ${SB_EASE}` }} />

      {/* Nav */}
      <div style={{ flex: 1, padding: '1rem 0' }}>
        <SideLabel collapsed={collapsed}>{t('nav.overview')}</SideLabel>
        <NavLink href="/dashboard" active={pathname === '/dashboard'} onClick={onNavigate} collapsed={collapsed} title={t('nav.dashboard')}>
          <LayoutDashboard size={22} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={txtStyle}>{t('nav.dashboard')}</span>
          {!collapsed && hasNewBriefing && (
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
        <NavLink href="/status" active={pathname === '/status'} onClick={onNavigate} collapsed={collapsed} title={t('nav.status')}>
          <Activity size={22} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={txtStyle}>{t('nav.status')}</span>
          {!collapsed && showBadge && (
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
        <NavLink href="/data" active={pathname === '/data'} onClick={onNavigate} collapsed={collapsed} title={t('nav.feed')}>
          <Rss size={22} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={txtStyle}>{t('nav.feed')}</span>
        </NavLink>

        <SideDivider collapsed={collapsed} />

        <SideLabel collapsed={collapsed}>{t('nav.config')}</SideLabel>
        {CONFIG_NAV.map(({ href, labelKey }) => {
          const Icon = CONFIG_ICON_MAP[href]
          return (
            <NavLink key={href} href={href} active={pathname === href} onClick={onNavigate} collapsed={collapsed} title={t(labelKey)}>
              {Icon && <Icon size={22} strokeWidth={1.5} style={{ flexShrink: 0 }} />}
              <span style={txtStyle}>{t(labelKey)}</span>
            </NavLink>
          )
        })}

      </div>

      {/* Language selector — sidebar footer */}
      <div style={{
        padding: collapsed ? '0.75rem 0 0.75rem 1rem' : '0.75rem 1.75rem',
        borderTop: '1px solid var(--sb-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '0.5rem',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        transition: `padding ${SB_EASE}`,
      }}>
        <Globe size={22} strokeWidth={1.5} style={{ color: 'var(--sb-faint)', flexShrink: 0 }} />
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
            flexShrink: 0,
          }}
        >
          {SUPPORTED_LOCALES.map(loc => (
            <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
          ))}
        </select>
      </div>

    </nav>
  )
}
