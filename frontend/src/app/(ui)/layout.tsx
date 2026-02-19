// ABOUTME: UI shell layout — wraps all dashboard pages with sidebar and toast notifications.
// ABOUTME: Provides ToastContext so any page component can trigger toasts without prop drilling.
'use client'
import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { ToastContext } from '@/lib/toast-context'

const PAGE_TITLES: Record<string, string> = {
  '/status': 'Status',
  '/console': 'Console',
  '/api-keys': 'Connections',
  '/settings': 'Settings',
  '/pipeline': 'Pipeline',
  '/sensors': 'Sensors',
  '/data': 'Intel Data',
}

export default function UiLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const pageTitle = PAGE_TITLES[pathname] ?? 'Intel Briefing'

  return (
    <Toaster>
      {(showToast) => (
        <ToastContext.Provider value={showToast}>
          <div
            className={sidebarOpen ? 'sidebar-open' : ''}
            style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}
          >
            {/* Mobile top bar — brand + page title + hamburger */}
            <div className="mobile-top-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--sb-muted)',
                  fontFamily: 'ui-monospace, monospace',
                }}>
                  IB
                </span>
                <span style={{
                  width: 1,
                  height: 16,
                  background: 'var(--sb-border)',
                }} />
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--sb-ink)',
                  letterSpacing: '-0.01em',
                }}>
                  {pageTitle}
                </span>
              </div>
              <button
                className="mobile-menu-btn"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  {sidebarOpen
                    ? <><line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" /></>
                    : <><line x1="2" y1="4.5" x2="16" y2="4.5" /><line x1="2" y1="9" x2="12" y2="9" /><line x1="2" y1="13.5" x2="16" y2="13.5" /></>
                  }
                </svg>
              </button>
            </div>

            {/* Backdrop — visible only on mobile when sidebar is open */}
            <div className="sidebar-backdrop" onClick={closeSidebar} />

            <Sidebar showToast={showToast} onNavigate={closeSidebar} />
            <main className="main-content" style={{
              flex: 1,
              height: '100vh',
              overflowY: 'auto',
              scrollBehavior: 'smooth',
            }}>
              {children}
            </main>
          </div>
        </ToastContext.Provider>
      )}
    </Toaster>
  )
}
