// ABOUTME: App shell — dark sidebar with grouped nav and system health indicator.
// ABOUTME: Each nav item switches to its own independent view; no scroll-based navigation.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../api/client'
import type { View } from '../App'

const CONFIG_NAV: { key: View; label: string; num: string }[] = [
  { key: 'api-keys',  label: 'Connections',  num: '01' },
  { key: 'sensors',   label: 'Sources',      num: '02' },
  { key: 'pipeline',  label: 'Pipeline',     num: '03' },
]

interface Props {
  children: ReactNode
  showToast: (msg: string) => void
  view: View
  onViewChange: (v: View) => void
}

function NavButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 1.75rem',
        width: '100%',
        background: 'none',
        border: 'none',
        borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
        color: active ? 'var(--sb-ink)' : 'var(--sb-muted)',
        fontSize: '0.875rem',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        transition: 'color 120ms, border-color 120ms',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#C0BDBA' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--sb-muted)' }}
    >
      {children}
    </button>
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

function NumTag({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontFamily: 'ui-monospace, monospace',
      color: 'var(--sb-faint)',
      letterSpacing: '0.05em',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {children}
    </span>
  )
}

export function Layout({ children, showToast, view, onViewChange }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    const iv = setInterval(() => api.health().then(setHealth).catch(() => {}), 30_000)
    return () => clearInterval(iv)
  }, [])

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
    health?.status === 'ok'    ? 'var(--ok)'   :
    health?.status === 'stale' ? 'var(--warn)' :
    'var(--err)'


  const statusLabel = health
    ? `${health.status}${health.last_fetch ? ' · ' + health.last_fetch.slice(0, 16).replace('T', ' ') : ''}`
    : 'loading…'

  return (
    <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <nav style={{
        width: 240,
        background: 'var(--sb)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowY: 'auto',
        flexShrink: 0,
        borderRight: '1px solid var(--sb-border)',
      }}>

        {/* Brand */}
        <div style={{ padding: '2rem 1.75rem 1.5rem' }}>
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

        <div style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

        {/* Nav */}
        <div style={{ flex: 1, padding: '1rem 0' }}>

          {/* Overview */}
          <SideLabel>Overview</SideLabel>
          <NavButton active={view === 'status'} onClick={() => onViewChange('status')}>
            <NumTag>00</NumTag>
            Status
          </NavButton>

          <SideDivider />

          {/* Config */}
          <SideLabel>Config</SideLabel>
          {CONFIG_NAV.map(({ key, label, num }) => (
            <NavButton key={key} active={view === key} onClick={() => onViewChange(key)}>
              <NumTag>{num}</NumTag>
              {label}
            </NavButton>
          ))}

          <SideDivider />

          {/* Data */}
          <SideLabel>Data</SideLabel>
          <NavButton active={view === 'data'} onClick={() => onViewChange('data')}>
            <NumTag>08</NumTag>
            Intel Data
          </NavButton>
        </div>

        <div style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

        {/* Fetch Now */}
        <div style={{ padding: '1.25rem 1.75rem' }}>
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
            onMouseEnter={e => { if (!fetching) (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
            onMouseLeave={e => { if (!fetching) (e.currentTarget as HTMLElement).style.background = 'var(--sb-accent)' }}
          >
            {fetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </div>

      </nav>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        height: '100vh',
        overflowY: 'auto',
        scrollBehavior: 'smooth',
      }}>
        {children}
      </main>
    </div>
  )
}
