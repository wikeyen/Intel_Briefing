// ABOUTME: Sidebar navigation component for Intel Briefing.
// ABOUTME: Uses Next.js Link and usePathname for client-side routing.
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, PipelineStatus } from '@/api/client'

const CONFIG_NAV = [
  { href: '/sources',     label: 'Sources' },
  { href: '/pipeline',    label: 'Pipeline' },
  { href: '/ai',          label: 'AI Summary' },
  { href: '/connections', label: 'Connections' },
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
  showToast: (msg: string) => void
  onNavigate?: () => void
}

export function Sidebar({ showToast, onNavigate }: Props) {
  const pathname = usePathname()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [fetching, setFetching] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    const iv = setInterval(() => api.health().then(setHealth).catch(() => {}), 30_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
    const iv = setInterval(() => api.getPipelineStatus().then(setPipelineStatus).catch(() => {}), 10_000)
    return () => clearInterval(iv)
  }, [])

  const hasErrors = (pipelineStatus?.sensors.some(s => s.error !== null)) ?? false
  const runId = pipelineStatus?.completed_at ?? pipelineStatus?.started_at ?? ''

  // Track which pipeline run the user last viewed on /console via server-side KV store.
  // Badge shows when errors exist for a run the user hasn't seen yet.
  const [seenRun, setSeenRun] = useState<string | null>(null)
  const onConsolePage = pathname === '/console'

  useEffect(() => {
    api.getConsoleSeen().then(r => setSeenRun(r.runId)).catch(() => {})
  }, [])

  useEffect(() => {
    if (onConsolePage && hasErrors && runId) {
      api.setConsoleSeen(runId).then(() => setSeenRun(runId)).catch(() => {})
    }
  }, [onConsolePage, hasErrors, runId])

  const showBadge = hasErrors && !!runId && runId !== seenRun

  const handleFetchNow = async () => {
    setFetching(true)
    try {
      await api.triggerFetch()
      showToast('Pipeline triggered — data will update shortly')
    } catch (e) {
      showToast('Fetch failed: ' + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

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
      {/* Brand */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            transition: 'background 400ms',
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
      </div>

      <div className="sidebar-brand-divider" style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

      {/* Nav */}
      <div style={{ flex: 1, padding: '1rem 0' }}>
        <SideLabel>Overview</SideLabel>
        <NavLink href="/briefing" active={pathname === '/briefing'} onClick={onNavigate}>
          Briefing
        </NavLink>
        <NavLink href="/status" active={pathname === '/status'} onClick={onNavigate}>
          Status
        </NavLink>
        <NavLink href="/console" active={pathname === '/console'} onClick={onNavigate}>
          Console
          {showBadge && (
            <span style={{
              fontSize: '0.5rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--err)',
              marginLeft: 'auto',
            }}>
              new
            </span>
          )}
        </NavLink>
        <NavLink href="/data" active={pathname === '/data'} onClick={onNavigate}>
          Raw Feed
        </NavLink>

        <SideDivider />

        <SideLabel>Config</SideLabel>
        {CONFIG_NAV.map(({ href, label }) => (
          <NavLink key={href} href={href} active={pathname === href} onClick={onNavigate}>
            {label}
          </NavLink>
        ))}

      </div>

      <div style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

      {/* Fetch Now */}
      <div className="sidebar-fetch" style={{ padding: '1.25rem 1.75rem', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0))' }}>
        <button
          onClick={handleFetchNow}
          disabled={fetching}
          style={{
            width: '100%',
            padding: '0.625rem 1rem',
            background: fetching ? 'var(--sb-faint)' : 'var(--sb-accent)',
            color: fetching ? 'var(--sb-muted)' : '#FFFFFF',
            border: 'none',
            borderRadius: 4,
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: fetching ? 'not-allowed' : 'pointer',
            transition: 'background 120ms',
            letterSpacing: '0.01em',
          }}
        >
          {fetching ? 'Fetching…' : 'Fetch Now'}
        </button>
      </div>
    </nav>
  )
}
