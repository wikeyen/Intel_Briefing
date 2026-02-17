// ABOUTME: App shell — dark sidebar with nav, health status, and Fetch Now button.
// ABOUTME: Sidebar switches between Status view and Config view; config nav scrolls only the content pane.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../api/client'
import type { View } from '../App'

const CONFIG_NAV = [
  { href: '#api-keys',  label: 'API Keys',          num: '01' },
  { href: '#sensors',   label: 'Sensors',            num: '02' },
  { href: '#schedule',  label: 'Schedule',           num: '03' },
  { href: '#politics',  label: 'Politics Accounts',  num: '04' },
  { href: '#topics',    label: 'Topics',             num: '05' },
  { href: '#filters',   label: 'Filters',            num: '06' },
  { href: '#output',    label: 'Output',             num: '07' },
]

interface Props {
  children: ReactNode
  showToast: (msg: string) => void
  view: View
  onViewChange: (v: View) => void
}

export function Layout({ children, showToast, view, onViewChange }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [fetching, setFetching] = useState(false)
  const [activeHash, setActiveHash] = useState(window.location.hash || '#api-keys')

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    const iv = setInterval(() => api.health().then(setHealth).catch(() => {}), 30_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const onHash = () => setActiveHash(window.location.hash || '#api-keys')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
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

  const handleConfigNav = (href: string) => {
    setActiveHash(href)
    if (view !== 'config') {
      onViewChange('config')
      // After config sections mount, scroll to the target section
      setTimeout(() => {
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    } else {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const statusColor =
    health?.status === 'ok' ? 'var(--ok)' :
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
        <div style={{ padding: '2rem 1.75rem 1.75rem' }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--sb-ink)',
          }}>
            Intel Briefing
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

        {/* Nav */}
        <div style={{ flex: 1, padding: '1rem 0' }}>

          {/* Overview label */}
          <div style={{
            padding: '0 1.75rem 0.375rem',
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--sb-faint)',
          }}>
            Overview
          </div>

          {/* Status — top-level view */}
          <button
            onClick={() => onViewChange('status')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1.75rem',
              width: '100%',
              background: 'none',
              border: 'none',
              borderLeft: view === 'status' ? '2px solid var(--sb-accent)' : '2px solid transparent',
              color: view === 'status' ? 'var(--sb-ink)' : 'var(--sb-muted)',
              fontSize: '0.875rem',
              fontWeight: view === 'status' ? 500 : 400,
              cursor: 'pointer',
              transition: 'color 120ms, border-color 120ms',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              if (view !== 'status') (e.currentTarget as HTMLElement).style.color = '#C0BDBA'
            }}
            onMouseLeave={e => {
              if (view !== 'status') (e.currentTarget as HTMLElement).style.color = 'var(--sb-muted)'
            }}
          >
            <span style={{
              fontSize: '0.5625rem',
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--sb-faint)',
              letterSpacing: '0.05em',
              flexShrink: 0,
              userSelect: 'none',
            }}>
              00
            </span>
            Status
          </button>

          {/* Divider + Config label */}
          <div style={{ height: 1, background: 'var(--sb-border)', margin: '0.5rem 1.75rem 0.875rem' }} />
          <div style={{
            padding: '0 1.75rem 0.375rem',
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--sb-faint)',
          }}>
            Config
          </div>

          {/* Config sections */}
          {CONFIG_NAV.map(({ href, label, num }) => {
            const active = view === 'config' && activeHash === href
            return (
              <a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  handleConfigNav(href)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 1.75rem',
                  color: active ? 'var(--sb-ink)' : 'var(--sb-muted)',
                  borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
                  fontSize: '0.875rem',
                  fontWeight: active ? 500 : 400,
                  transition: 'color 120ms, border-color 120ms',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = '#C0BDBA'
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--sb-muted)'
                }}
              >
                <span style={{
                  fontSize: '0.5625rem',
                  fontFamily: 'ui-monospace, monospace',
                  color: 'var(--sb-faint)',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                  userSelect: 'none',
                }}>
                  {num}
                </span>
                {label}
              </a>
            )
          })}

          {/* Divider + Data label */}
          <div style={{ height: 1, background: 'var(--sb-border)', margin: '0.875rem 1.75rem 0.875rem' }} />
          <div style={{
            padding: '0 1.75rem 0.375rem',
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--sb-faint)',
          }}>
            Data
          </div>

          {/* Data view */}
          <button
            onClick={() => onViewChange('data')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1.75rem',
              width: '100%',
              background: 'none',
              border: 'none',
              borderLeft: view === 'data' ? '2px solid var(--sb-accent)' : '2px solid transparent',
              color: view === 'data' ? 'var(--sb-ink)' : 'var(--sb-muted)',
              fontSize: '0.875rem',
              fontWeight: view === 'data' ? 500 : 400,
              cursor: 'pointer',
              transition: 'color 120ms, border-color 120ms',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              if (view !== 'data') (e.currentTarget as HTMLElement).style.color = '#C0BDBA'
            }}
            onMouseLeave={e => {
              if (view !== 'data') (e.currentTarget as HTMLElement).style.color = 'var(--sb-muted)'
            }}
          >
            <span style={{
              fontSize: '0.5625rem',
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--sb-faint)',
              letterSpacing: '0.05em',
              flexShrink: 0,
              userSelect: 'none',
            }}>
              08
            </span>
            Intel Data
          </button>
        </div>

        {/* Divider */}
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
            onMouseEnter={e => {
              if (!fetching) (e.currentTarget as HTMLElement).style.background = 'var(--accent)'
            }}
            onMouseLeave={e => {
              if (!fetching) (e.currentTarget as HTMLElement).style.background = 'var(--sb-accent)'
            }}
          >
            {fetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </div>

        {/* Health */}
        <div style={{ padding: '0 1.75rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.625rem',
              color: 'var(--sb-muted)',
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.02em',
            }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Main (independent scroll) ────────────────────────────────────── */}
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
