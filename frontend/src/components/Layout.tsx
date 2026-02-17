// ABOUTME: Swiss-spa sidebar layout with health status and Fetch Now button.
// ABOUTME: Health indicator sits at the bottom of the sidebar; header is a minimal strip.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { HealthResponse } from '../api/client'

const NAV_LINKS = [
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
    const iv = setInterval(() => { api.health().then(setHealth).catch(() => {}) }, 30_000)
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

  const statusColor = health?.status === 'ok'
    ? 'var(--ok)'
    : health?.status === 'stale'
    ? 'var(--warn)'
    : 'var(--err)'

  const statusLabel = health
    ? `${health.status}${health.last_fetch ? ' · ' + health.last_fetch.slice(0, 16).replace('T', ' ') : ''}`
    : 'loading…'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--canvas)' }}>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <nav style={{
        width: 256,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{
          padding: '2rem 1.5rem 1.5rem',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
          }}>
            Intel Briefing
          </div>
        </div>

        {/* Nav links */}
        <div style={{ flex: 1, paddingTop: '1rem', paddingBottom: '1rem' }}>
          {NAV_LINKS.map((link) => {
            const active = activeHash === link.href
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setActiveHash(link.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 1.5rem',
                  fontSize: '0.8125rem',
                  color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: active ? 500 : 400,
                  transition: 'color 150ms, border-color 150ms',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
              >
                <span style={{
                  fontSize: '0.625rem',
                  fontFamily: 'ui-monospace, monospace',
                  color: 'var(--ink-faint)',
                  letterSpacing: '0.05em',
                  userSelect: 'none',
                }}>
                  {link.num}
                </span>
                {link.label}
              </a>
            )
          })}
        </div>

        {/* Health indicator */}
        <div style={{
          padding: '1rem 1.5rem 1.5rem',
          borderTop: '1px solid var(--border-soft)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.6875rem',
              color: 'var(--ink-muted)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: 48,
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 2.5rem',
          flexShrink: 0,
        }}>
          <button
            onClick={handleFetchNow}
            disabled={fetching}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: fetching ? 'var(--ink-faint)' : 'var(--accent)',
              border: '1.5px solid',
              borderColor: fetching ? 'var(--border)' : 'var(--accent)',
              borderRadius: 2,
              padding: '0.35rem 1rem',
              cursor: fetching ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
              background: 'transparent',
            }}
            onMouseEnter={e => { if (!fetching) (e.currentTarget as HTMLElement).style.background = 'var(--accent-wash)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {fetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '3rem 4rem', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'var(--ink)',
          color: 'var(--canvas)',
          fontSize: '0.8125rem',
          padding: '0.75rem 1.25rem',
          borderRadius: 2,
          boxShadow: '0 4px 24px rgba(28,26,23,0.18)',
          zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
