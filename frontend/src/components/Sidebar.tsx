// ABOUTME: Sidebar navigation component for Intel Briefing.
// ABOUTME: Uses Next.js Link and usePathname for client-side routing.
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, PipelineStatus, SummaryProgress } from '@/api/client'
import { usePolling, usePollEffect } from '@/lib/hooks/usePolling'

const CONFIG_NAV = [
  { href: '/sources',     label: 'Sources' },
  { href: '/pipeline',    label: 'Pipeline' },
  { href: '/ai',          label: 'AI Summary' },
  { href: '/connections', label: 'Credentials' },
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
    <div style={{
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
  return <div style={{ height: 1, background: 'var(--sb-border)', margin: '0.625rem 1.75rem 0.875rem' }} />
}


interface Props {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: Props) {
  const pathname = usePathname()
  const router = useRouter()
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

  useEffect(() => {
    try { setLastViewedFetch(localStorage.getItem('ib:dashboard:lastViewedFetch')) } catch {}
  }, [])

  // Re-read localStorage whenever health updates (every 30s) to catch Dashboard writes
  useEffect(() => {
    try { setLastViewedFetch(localStorage.getItem('ib:dashboard:lastViewedFetch')) } catch {}
  }, [health?.last_fetch])

  const hasNewBriefing = !onDashboard
    && !!health?.last_fetch
    && lastViewedFetch !== null
    && health.last_fetch !== lastViewedFetch

  // Pipeline progress percentage for the mini bar
  const pipelinePct = (() => {
    if (!isJobRunning) return null
    if (pipelineStatus?.running) {
      const total = pipelineStatus.sensors.length
      if (total === 0) return 0
      const done = pipelineStatus.sensors.filter(s =>
        s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped',
      ).length
      return Math.round((done / total) * 100)
    }
    if (summaryProgress?.running) {
      const sensors = summaryProgress.sensors.filter(s => s.sensor_name !== '__overall__')
      const total = sensors.length
      if (total === 0) return 0
      const done = sensors.filter(s => s.state === 'ok' || s.state === 'failed').length
      return Math.round((done / total) * 100)
    }
    return null
  })()

  const statusColor =
    !health                      ? 'var(--ink-faint)' :
    health.status === 'ok'       ? 'var(--ok)'        :
    health.status === 'stale'    ? 'var(--warn)'      :
    health.status === 'no_data'  ? 'var(--ink-faint)' :
    'var(--err)'

  const statusLabel = health
    ? `${health.status}${health.last_fetch ? ' · ' + health.last_fetch.slice(0, 16).replace('T', ' ') : ''}`
    : 'loading…'

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
          Intel Briefing
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
        {/* Mini progress bar — visible only when pipeline or summary is running */}
        {pipelinePct != null && (
          <div style={{
            height: 2,
            background: 'var(--sb-border)',
            borderRadius: 1,
            overflow: 'hidden',
            marginTop: '0.5rem',
          }}>
            <div style={{
              height: '100%',
              width: `${pipelinePct}%`,
              background: 'var(--accent)',
              borderRadius: 1,
              transition: 'width 400ms ease',
            }} />
          </div>
        )}
      </div>

      <div className="sidebar-brand-divider" style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

      {/* Nav */}
      <div style={{ flex: 1, padding: '1rem 0' }}>
        <SideLabel>Overview</SideLabel>
        <NavLink href="/dashboard" active={pathname === '/dashboard'} onClick={onNavigate}>
          Dashboard
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
          Status
          {showBadge && (
            <span style={{
              fontSize: '0.5rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--err)',
              marginLeft: 'auto',
            }}>
              errors
            </span>
          )}
        </NavLink>
        <NavLink href="/data" active={pathname === '/data'} onClick={onNavigate}>
          Feed
        </NavLink>

        <SideDivider />

        <SideLabel>Config</SideLabel>
        {CONFIG_NAV.map(({ href, label }) => (
          <NavLink key={href} href={href} active={pathname === href} onClick={onNavigate}>
            {label}
          </NavLink>
        ))}

      </div>
    </nav>
  )
}
