// ABOUTME: App shell — dark sidebar with nav, health status, and Fetch Now button.
// ABOUTME: Sidebar and main area scroll independently; anchor links scroll only the content pane.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../api/client'

const NAV = [
  { href: '#api-keys',  label: 'API Keys',          num: '01' },
  { href: '#sensors',   label: 'Sensors',            num: '02' },
  { href: '#schedule',  label: 'Schedule',           num: '03' },
  { href: '#politics',  label: 'Politics Accounts',  num: '04' },
  { href: '#topics',    label: 'Topics',             num: '05' },
  { href: '#filters',   label: 'Filters',            num: '06' },
  { href: '#output',    label: 'Output',             num: '07' },
]

interface Props { children: ReactNode }

export function Layout({ children }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [fetching, setFetching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
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

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

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
          <div style={{
            fontSize: '0.625rem',
            color: 'var(--sb-muted)',
            marginTop: '0.25rem',
            letterSpacing: '0.04em',
          }}>
            Configuration
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--sb-border)', margin: '0 1.75rem' }} />

        {/* Nav */}
        <div style={{ flex: 1, padding: '1rem 0' }}>
          {NAV.map(({ href, label, num }) => {
            const active = activeHash === href
            return (
              <a
                key={href}
                href={href}
                onClick={() => setActiveHash(href)}
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

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '1.25rem',
          right: '1.5rem',
          background: 'var(--ink)',
          color: 'var(--surface)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          padding: '0.875rem 1.25rem',
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 50,
          letterSpacing: '0.01em',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
